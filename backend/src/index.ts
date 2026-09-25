import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { wsServer } from './websocket/server.js';

const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket server on the same HTTP server
wsServer.init(server);

server.listen(config.port, () => {
  console.log(`InsightForge-AI Backend running on http://localhost:${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
  console.log(`WebSocket server active on ws://localhost:${config.port}/ws`);
});

export { app, server };
