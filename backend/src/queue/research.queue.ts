import { Queue } from 'bullmq';
import { getBullMQConnection, ensureRedisServer } from '../config/redis.js';

export interface ResearchJobData {
  sessionId: string;
  query: string;
  cacheable?: boolean;
}

/**
 * BullMQ queue name. Overridable so standalone test scripts (which use their own embedded
 * database and in-process worker) don't share a queue with a running dev server's worker.
 */
export function getResearchQueueName(): string {
  return process.env.RESEARCH_QUEUE_NAME || 'research';
}

let researchQueueInstance: Queue<ResearchJobData, unknown, string, ResearchJobData> | null = null;

export async function getResearchQueue(): Promise<Queue<ResearchJobData, unknown, string, ResearchJobData>> {
  if (!researchQueueInstance) {
    await ensureRedisServer();
    const queue = new Queue<ResearchJobData, unknown, string, ResearchJobData>(getResearchQueueName(), {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // keep completed jobs for 1 hour
          count: 500,
        },
        removeOnFail: {
          age: 86400, // keep failed jobs for 24 hours
        },
      },
    });
    researchQueueInstance = queue;
  }
  return researchQueueInstance;
}

/**
 * Enqueues an asynchronous research job into BullMQ.
 */
export async function enqueueResearchJob(
  sessionId: string,
  query: string,
  cacheable: boolean = true,
): Promise<{ jobId: string; status: 'queued'; sessionId: string }> {
  const queue = await getResearchQueue();
  const jobId = `session-${sessionId}`;

  // BullMQ silently ignores add() when a job with the same ID still exists
  // (completed jobs are kept 1h, failed ones 24h). Dedupe only while a run is
  // genuinely in flight; otherwise clear the finished job so a re-run executes.
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized' || state === 'waiting-children') {
      console.log(`[Queue:research] Job ${jobId} already ${state}; not enqueuing a duplicate.`);
      return { jobId, status: 'queued', sessionId };
    }
    await existing.remove();
  }

  const job = await queue.add('execute-research', { sessionId, query, cacheable }, { jobId });

  console.log(`[Queue:research] Enqueued job ${job.id} for session ${sessionId}`);
  return {
    jobId: String(job.id),
    status: 'queued',
    sessionId,
  };
}

export async function closeResearchQueue(): Promise<void> {
  if (researchQueueInstance) {
    await researchQueueInstance.close();
    researchQueueInstance = null;
  }
}
