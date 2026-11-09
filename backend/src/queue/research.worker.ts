import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions, ensureRedisServer } from '../config/redis.js';
import { ResearchJobData } from './research.queue.js';
import { runResearchPipeline } from '../agents/orchestrator.js';
import { ResearchSession } from '../models/index.js';
import { SemanticCacheService } from '../services/semanticCache.service.js';
import { logger, createSessionLogger } from '../utils/logger.js';

let researchWorkerInstance: Worker<ResearchJobData> | null = null;

export async function startResearchWorker(concurrency: number = 3): Promise<Worker<ResearchJobData>> {
  if (researchWorkerInstance) {
    return researchWorkerInstance;
  }

  await ensureRedisServer();

  logger.info({ concurrency, queue: 'research' }, 'Initializing BullMQ research worker');

  researchWorkerInstance = new Worker<ResearchJobData>(
    'research',
    async (job: Job<ResearchJobData>) => {
      const { sessionId, query, cacheable } = job.data;
      const jobLog = createSessionLogger(sessionId, { jobId: job.id, query });
      jobLog.info('Processing research job from queue');

      // Update session status to in_progress
      await ResearchSession.findByIdAndUpdate(sessionId, {
        status: 'in_progress',
        $unset: { errorMessage: 1 },
        updatedAt: new Date(),
      });

      try {
        // Execute multi-agent research pipeline (calls Python FastAPI LangGraph microservice)
        const result = await runResearchPipeline(sessionId, query);

        // Store result in semantic cache if cacheable. Skip reports with no retrieved
        // sources (e.g. search provider down): caching one would serve an empty,
        // evidence-free report to every similar query for the next 24h.
        const hasEvidence = (result.report?.sources?.length ?? 0) > 0;
        if (cacheable !== false && result.report && !hasEvidence) {
          jobLog.warn('Report has no sources; not caching it');
        }
        if (cacheable !== false && result.report && hasEvidence) {
          await SemanticCacheService.setSemanticCache(query, {
            title: result.state.finalReport?.title || query,
            content: result.report.content,
            sources: result.report.sources,
          });
          jobLog.info('Cached research report in Redis Semantic Cache');
        }

        jobLog.info({ reportId: result.report._id }, 'Successfully completed research job');
        return {
          sessionId,
          status: 'completed',
          reportId: result.report._id,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
        jobLog.error(
          { err: error, errorMsg, attempt: job.attemptsMade + 1, maxAttempts },
          isFinalAttempt ? 'Research job failed (final attempt)' : 'Research job attempt failed; BullMQ will retry',
        );

        // Only report 'failed' once retries are exhausted; otherwise clients would treat a
        // transient LLM/provider error as final even though the retry may succeed.
        await ResearchSession.findByIdAndUpdate(sessionId, {
          status: isFinalAttempt ? 'failed' : 'pending',
          errorMessage: isFinalAttempt ? errorMsg : undefined,
          updatedAt: new Date(),
        }).catch(() => null);

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions() as any,
      concurrency,
      lockDuration: 30000,
    },
  );

  researchWorkerInstance.on('completed', (job) => {
    console.log(`[Worker:research] Job ${job.id} marked COMPLETED.`);
  });

  researchWorkerInstance.on('failed', (job, err) => {
    console.error(`[Worker:research] Job ${job?.id} FAILED: ${err.message}`);
  });

  return researchWorkerInstance;
}

export async function closeResearchWorker(): Promise<void> {
  if (researchWorkerInstance) {
    await researchWorkerInstance.close();
    researchWorkerInstance = null;
    console.log('[Worker:research] Worker stopped.');
  }
}
