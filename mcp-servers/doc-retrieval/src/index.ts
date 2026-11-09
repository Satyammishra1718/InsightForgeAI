import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first if available, then local
// Capture PORT before loading the shared root .env: that file's PORT belongs to the
// backend (5000), and inheriting it made this server steal the backend's port.
const containerPort = process.env.PORT;
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export interface RetrievedContext {
  id: string;
  text: string;
  source: string;
  sourceType?: string;
  title?: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
  rrfScore?: number;
  vectorRank?: number;
  bm25Rank?: number;
}

/**
 * Retrieves relevant document chunks for a session query,
 * attempting backend REST API (e.g. in Docker or running backend) or dynamic RAG module fallback.
 */
export async function retrieveDocumentContext(
  sessionId: string,
  query: string,
  topK = 5,
): Promise<RetrievedContext[]> {
  const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:5000';

  // 1. Try querying backend RAG REST endpoint
  try {
    const response = await fetch(`${backendUrl}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, query, topK }),
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = (await response.json()) as { results?: RetrievedContext[] };
      if (data.results && Array.isArray(data.results)) {
        return data.results;
      }
    }
  } catch {
    // Backend API not reachable yet; proceed to direct RAG module fallback
  }

  // 2. Direct local RAG module invocation using dynamic import
  try {
    const ragPath = path.resolve(__dirname, '../../../backend/dist/rag/index.js');
    const ragSrcPath = path.resolve(__dirname, '../../../backend/src/rag/index.js');

    let mod: Record<string, unknown> | null = null;
    try {
      mod = (await import(pathToFileURL(ragPath).href)) as Record<string, unknown>;
    } catch {
      mod = (await import(pathToFileURL(ragSrcPath).href)) as Record<string, unknown>;
    }

    if (mod && typeof mod.retrieveContext === 'function') {
      const fn = mod.retrieveContext as (s: string, q: string, k: number) => Promise<RetrievedContext[]>;
      return await fn(sessionId, query, topK);
    }
  } catch (err) {
    console.warn('[mcp-doc-retrieval] Direct RAG retrieval fallback failed:', err);
  }

  return [];
}

/**
 * Creates and configures the Document Retrieval MCP Server instance and Express application.
 */
export function createDocRetrievalMcpServer() {
  function createServerInstance() {
    const server = new McpServer({
      name: 'mcp-doc-retrieval',
      version: '1.0.0',
    });

    server.tool(
      'retrieve_context',
      {
        sessionId: z.string().describe('Research session ID to scope retrieval to'),
        query: z.string().describe('Search query for semantic + keyword retrieval'),
        topK: z.number().default(5).describe('Maximum number of chunks to return'),
      },
      async ({ sessionId, query, topK }) => {
        const chunks = await retrieveDocumentContext(sessionId, query, topK);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(chunks),
            },
          ],
        };
      },
    );

    return server;
  }

  const app = express();
  app.use(cors());

  const transports = new Map<string, SSEServerTransport>();

  app.get('/sse', async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);

    const serverInstance = createServerInstance();

    // Only drop our reference here. Calling serverInstance.close() from onclose
    // re-closes the transport, which fires onclose again: infinite recursion that
    // crashed the server (stack overflow) after the first client disconnected.
    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };

    await serverInstance.connect(transport);
  });

  app.post('/message', async (req: Request, res: Response) => {
    const sessionId = (Array.isArray(req.query.sessionId)
      ? req.query.sessionId[0]
      : req.query.sessionId) as string;

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'SSE session not found or already closed' });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: 'mcp-doc-retrieval',
      tools: ['retrieve_context'],
      activeTransports: transports.size,
    });
  });

  return { app, createServerInstance };
}

const PORT = parseInt(process.env.MCP_DOC_RETRIEVAL_PORT || containerPort || '4002', 10);

if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const { app } = createDocRetrievalMcpServer();
  app.listen(PORT, () => {
    console.log(
      `[mcp-doc-retrieval] MCP Doc Retrieval Server running on http://localhost:${PORT}/sse`,
    );
  });
}
