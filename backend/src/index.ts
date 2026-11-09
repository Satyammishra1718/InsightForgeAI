import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from './config/database.js';
import { wsServer } from './websocket/server.js';
import { ResearchSession } from './models/index.js';
import { startResearchWorker, closeResearchWorker, closeResearchQueue } from './queue/index.js';
import { closeRedis } from './config/redis.js';
import { EmbeddingService } from './rag/embeddings.js';

const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket server
wsServer.init(server);

async function startServer(): Promise<void> {
  try {
    // 1. Connect to MongoDB using Mongoose (auto-falls back to local embedded if Atlas is unreachable)
    console.log('[Startup] Initializing MongoDB connection...');
    await connectDatabase();
    const dbInfo = getDatabaseInfo();
    console.log(`[Startup] MongoDB connected successfully in [${dbInfo.mode.toUpperCase()}] mode.`);

    // 2. Auto-seed if database has 0 sessions (ensures UI always has data on initial run)
    const sessionCount = await ResearchSession.countDocuments();
    if (sessionCount === 0) {
      console.log(
        '[Startup] Fresh/empty database detected. Auto-seeding initial research sessions...',
      );
      const { seedDatabase } = await import('./scripts/seed.js');
      await seedDatabase();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Startup] Warning: MongoDB connection could not be established (${errorMsg}). ` +
        'The server will run in degraded mode.',
    );
  }

  if (process.env.RUN_EMBEDDED_WORKER !== 'false') {
    try {
      // 3. Start BullMQ background worker (in-process for single-service dev)
      await startResearchWorker(3);
      console.log('[Startup] Embedded BullMQ research worker running.');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Startup] Warning: Could not start BullMQ research worker (${errorMsg}).`);
    }
  } else {
    console.log('[Startup] Standalone worker configured (RUN_EMBEDDED_WORKER=false).');
  }

  // Load the local embedding model in the background so the first query is fast.
  void EmbeddingService.warmUp();

  // 4. Start HTTP & WebSocket Server
  server.listen(config.port, () => {
    console.log(`[InsightForge-AI] Server running on http://localhost:${config.port}`);
    console.log(`[InsightForge-AI] Health check: http://localhost:${config.port}/api/health`);
    console.log(`[InsightForge-AI] Sessions API: http://localhost:${config.port}/api/sessions`);
    console.log(`[InsightForge-AI] WebSocket: ws://localhost:${config.port}/ws`);
  });
}

// Graceful Shutdown Handlers
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);
  await closeResearchWorker().catch(() => null);
  await closeResearchQueue().catch(() => null);
  await closeRedis().catch(() => null);

  server.close(async () => {
    console.log('[Shutdown] HTTP server closed.');
    await disconnectDatabase();
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[Shutdown] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startServer();

export { app, server };
