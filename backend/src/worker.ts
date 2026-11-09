import { connectDatabase, disconnectDatabase, getDatabaseInfo } from './config/database.js';
import { startResearchWorker, closeResearchWorker } from './queue/research.worker.js';
import { closeRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { EmbeddingService } from './rag/embeddings.js';

async function runWorkerProcess() {
  logger.info('Starting standalone BullMQ Research Worker process...');

  try {
    await connectDatabase();
    const dbInfo = getDatabaseInfo();
    logger.info({ mode: dbInfo.mode }, 'Worker connected to MongoDB');

    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
    await startResearchWorker(concurrency);
    void EmbeddingService.warmUp();
    logger.info({ concurrency }, 'BullMQ Research Worker is listening for jobs on queue [research]');
  } catch (err) {
    logger.fatal({ err }, 'Worker startup failed');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Worker shutting down gracefully...');
  await closeResearchWorker().catch(() => null);
  await closeRedis().catch(() => null);
  await disconnectDatabase().catch(() => null);
  logger.info('Worker process exit clean');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

runWorkerProcess();
