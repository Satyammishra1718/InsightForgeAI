import { Worker, Job } from 'bullmq';
import { getBullMQConnection, ensureRedisServer } from '../config/redis.js';
import { ResearchJobData, getResearchQueueName } from './research.queue.js';
import { runResearchPipeline } from '../agents/orchestrator.js';
import { ResearchSession } from '../models/index.js';
import { SemanticCacheService } from '../services/semanticCache.service.js';
import { logger, createSessionLogger } from '../utils/logger.js';

let researchWorkerInstance: Worker<ResearchJobData> | null = null;

/**
 * Turn a raw pipeline error (often a nested provider JSON blob) into a short message the UI can
 * show. The full error is still logged.
 */
export function toUserFacingError(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes('tokens per day') || text.includes('(tpd)')) {
    return "The LLM provider's daily token limit has been reached. Try again later, or switch LLM_MODEL / upgrade the provider plan.";
  }
  if (text.includes('429') || text.includes('rate limit') || text.includes('rate_limit')) {
    return 'The LLM provider is rate-limiting requests right now. Wait a minute and retry.';
  }
  if (text.includes('401') || text.includes('invalid api key') || text.includes('invalid_api_key')) {
    return 'The LLM provider rejected the API key. Check GROQ_API_KEY / OPENAI_API_KEY in .env.';
  }
  if (text.includes('no llm') || text.includes('llm is not configured')) {
    return 'No LLM is configured. Set GROQ_API_KEY (or OPENAI_API_KEY) in .env.';
  }
  if (text.includes('timeout') || text.includes('aborted')) {
    return 'The research run timed out before the agents finished. Please retry.';
  }
  if (text.includes('econnrefused') || text.includes('fetch failed')) {
    return 'The Python agent service is unreachable. Make sure it is running (npm run dev).';
  }
  const firstLine = raw.split('\n')[0];
  return firstLine.length > 300 ? `${firstLine.slice(0, 300)}…` : firstLine;
}

export async function startResearchWorker(concurrency: number = 3): Promise<Worker<ResearchJobData>> {
  if (researchWorkerInstance) {
    return researchWorkerInstance;
  }

  await ensureRedisServer();

  const queueName = getResearchQueueName();
  logger.info({ concurrency, queue: queueName }, 'Initializing BullMQ research worker');

  researchWorkerInstance = new Worker<ResearchJobData>(
    queueName,
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
          errorMessage: isFinalAttempt ? toUserFacingError(errorMsg) : undefined,
          updatedAt: new Date(),
        }).catch(() => null);

        throw error;
      }
    },
    {
      connection: getBullMQConnection(),
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
