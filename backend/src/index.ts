import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { wsServer } from './websocket/server.js';

const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket server
wsServer.init(server);

async function startServer(): Promise<void> {
  try {
    // 1. Connect to MongoDB using Mongoose
    console.log('[Startup] Initializing MongoDB connection...');
    await connectDatabase();
    console.log('[Startup] MongoDB connected successfully. Ready to accept database operations.');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Startup] Warning: MongoDB connection could not be established (${errorMsg}). ` +
        'The server will run in degraded mode. Please check MONGODB_URI in .env.',
    );
  }

  // 2. Start HTTP & WebSocket Server
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
