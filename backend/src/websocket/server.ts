import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

export class AppWebSocketServer {
  private wss: WebSocketServer | null = null;

  public init(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      ws.send(
        JSON.stringify({ type: 'connected', message: 'InsightForge-AI WebSocket connected' }),
      );

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch {
          // ignore non-json messages for now
        }
      });
    });

    return this.wss;
  }

  public getWss(): WebSocketServer | null {
    return this.wss;
  }
}

export const wsServer = new AppWebSocketServer();
