import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { getRedisSubscriber } from '../config/redis.js';

interface ClientSubscription {
  sessionId: string;
  ws: WebSocket;
}

export class AppWebSocketServer {
  private wss: WebSocketServer | null = null;
  // Map of sessionId -> Set of active WebSockets
  private sessionClients: Map<string, Set<WebSocket>> = new Map();
  // Map of WebSocket -> Set of subscribed sessionIds
  private clientSessions: Map<WebSocket, Set<string>> = new Map();
  private redisListenerAttached = false;

  public init(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupServer();
    return this.wss;
  }

  public initStandalone(port: number): WebSocketServer {
    this.wss = new WebSocketServer({ port, path: '/ws' });
    console.log(`[WebSocket] Standalone WebSocket server running on port ${port} (path: /ws)`);
    this.setupServer();
    return this.wss;
  }

  private setupServer(): void {
    if (!this.wss) return;

    this.attachRedisSubscriber().catch((err) => {
      console.warn('[WebSocket] Initial Redis subscriber attachment deferred:', err.message);
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clientSessions.set(ws, new Set());

      // Welcome handshake
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'InsightForge-AI WebSocket connected. Ready to stream research progress.',
        }),
      );

      ws.on('message', async (rawMessage: string) => {
        try {
          const data = JSON.parse(rawMessage.toString());
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          if (data.type === 'subscribe' && data.sessionId) {
            await this.subscribeClient(ws, String(data.sessionId));
          } else if (data.type === 'unsubscribe' && data.sessionId) {
            await this.unsubscribeClient(ws, String(data.sessionId));
          }
        } catch {
          // ignore non-json messages
        }
      });

      ws.on('close', () => {
        this.cleanupClient(ws);
      });

      ws.on('error', (err) => {
        console.warn('[WebSocket] Client connection error:', err.message);
        this.cleanupClient(ws);
      });
    });
  }

  private async attachRedisSubscriber(): Promise<void> {
    if (this.redisListenerAttached) return;

    const subscriber = await getRedisSubscriber();
    subscriber.on('message', (channel: string, message: string) => {
      // Channel format: session:<sessionId>:progress
      const match = channel.match(/^session:([^:]+):progress$/);
      if (!match) return;

      const sessionId = match[1];
      const subscribers = this.sessionClients.get(sessionId);
      if (subscribers && subscribers.size > 0) {
        try {
          const payload = JSON.parse(message);
          const outMessage = JSON.stringify({
            type: 'progress',
            sessionId,
            data: payload,
          });

          for (const client of subscribers) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(outMessage);
            }
          }
        } catch {
          // fallback plain send
          for (const client of subscribers) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          }
        }
      }
    });

    this.redisListenerAttached = true;
    console.log('[WebSocket] Attached Redis subscriber for session live progress streaming.');
  }

  public async subscribeClient(ws: WebSocket, sessionId: string): Promise<void> {
    await this.attachRedisSubscriber();

    // 1. Add ws to session set
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
      // Subscribe to Redis channel
      const subscriber = await getRedisSubscriber();
      const channel = `session:${sessionId}:progress`;
      await subscriber.subscribe(channel);
      console.log(`[WebSocket] Subscribed to Redis channel: ${channel}`);
    }
    this.sessionClients.get(sessionId)!.add(ws);

    // 2. Add sessionId to client set
    const userSessions = this.clientSessions.get(ws) || new Set();
    userSessions.add(sessionId);
    this.clientSessions.set(ws, userSessions);

    ws.send(
      JSON.stringify({
        type: 'subscribed',
        sessionId,
        message: `Successfully subscribed to real-time progress for session ${sessionId}`,
      }),
    );
  }

  public async unsubscribeClient(ws: WebSocket, sessionId: string): Promise<void> {
    const clients = this.sessionClients.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.sessionClients.delete(sessionId);
        // Unsubscribe from Redis channel
        try {
          const subscriber = await getRedisSubscriber();
          await subscriber.unsubscribe(`session:${sessionId}:progress`);
          console.log(`[WebSocket] Unsubscribed from empty channel: session:${sessionId}:progress`);
        } catch {
          // ignore
        }
      }
    }

    const sessions = this.clientSessions.get(ws);
    if (sessions) {
      sessions.delete(sessionId);
    }

    ws.send(
      JSON.stringify({
        type: 'unsubscribed',
        sessionId,
      }),
    );
  }

  private cleanupClient(ws: WebSocket): void {
    const sessions = this.clientSessions.get(ws);
    if (sessions) {
      for (const sessionId of sessions) {
        const clients = this.sessionClients.get(sessionId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            this.sessionClients.delete(sessionId);
            getRedisSubscriber()
              .then((s) => s.unsubscribe(`session:${sessionId}:progress`))
              .catch(() => null);
          }
        }
      }
      this.clientSessions.delete(ws);
    }
  }

  public async close(): Promise<void> {
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }
    this.sessionClients.clear();
    this.clientSessions.clear();
    this.redisListenerAttached = false;
  }

  public getWss(): WebSocketServer | null {
    return this.wss;
  }
}

export const wsServer = new AppWebSocketServer();
