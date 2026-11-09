import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first if available, then local
// Capture PORT before loading the shared root .env: that file's PORT belongs to the
// backend (5000), and inheriting it made this server steal the backend's port.
const ownPort = process.env.PORT;
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Executes a web search using Tavily API if configured, falling back to DuckDuckGo / deterministic synthesis.
 */
export async function performWebSearch(query: string): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (tavilyKey && !tavilyKey.startsWith('your_') && tavilyKey.trim().length > 5) {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: 'basic',
          max_results: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string }>;
        };
        if (data.results && data.results.length > 0) {
          return data.results.map((r) => ({
            title: r.title || query,
            url: r.url || 'https://search.tavily.com',
            snippet: r.content || '',
          }));
        }
      }
    } catch (err) {
      console.warn('[mcp-web-search] Tavily API error, falling back:', err);
    }
  }

  // Attempt DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const json = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };

      const results: SearchResult[] = [];
      if (json.AbstractText && json.AbstractURL) {
        results.push({
          title: json.Heading || query,
          url: json.AbstractURL,
          snippet: json.AbstractText,
        });
      }

      if (json.RelatedTopics) {
        for (const topic of json.RelatedTopics.slice(0, 4)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.slice(0, 60),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }

      if (results.length > 0) {
        return results;
      }
    }
  } catch {
    // Network or timeout: fall through
  }

  // No live search provider answered. Return nothing rather than inventing sources,
  // so downstream agents never cite URLs that do not exist.
  return [];
}

/**
 * Creates and configures the Web Search MCP Server instance and Express application.
 */
export function createWebSearchMcpServer() {
  function createServerInstance() {
    const server = new McpServer({
      name: 'mcp-web-search',
      version: '1.0.0',
    });

    server.tool(
      'web_search',
      {
        query: z.string().describe('Search query string to find articles and technical documentation'),
      },
      async ({ query }) => {
        const results = await performWebSearch(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results),
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
      server: 'mcp-web-search',
      tools: ['web_search'],
      activeTransports: transports.size,
    });
  });

  return { app, createServerInstance };
}

const PORT = parseInt(process.env.MCP_WEB_SEARCH_PORT || ownPort || '4001', 10);

if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const { app } = createWebSearchMcpServer();
  app.listen(PORT, () => {
    console.log(`[mcp-web-search] MCP Web Search Server running on http://localhost:${PORT}/sse`);
  });
}
