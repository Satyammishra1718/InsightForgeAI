import express from 'express';
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
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
/**
 * Retrieves relevant document chunks for a session query,
 * attempting backend REST API (e.g. in Docker or running backend) or dynamic RAG module fallback.
 */
export async function retrieveDocumentContext(sessionId, query, topK = 5) {
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
            const data = (await response.json());
            if (data.results && Array.isArray(data.results)) {
                return data.results;
            }
        }
    }
    catch {
        // Backend API not reachable yet; proceed to direct RAG module fallback
    }
    // 2. Direct local RAG module invocation using dynamic import
    try {
        const ragPath = path.resolve(__dirname, '../../../backend/dist/rag/index.js');
        const ragSrcPath = path.resolve(__dirname, '../../../backend/src/rag/index.js');
        let mod = null;
        try {
            mod = (await import(pathToFileURL(ragPath).href));
        }
        catch {
            mod = (await import(pathToFileURL(ragSrcPath).href));
        }
        if (mod && typeof mod.retrieveContext === 'function') {
            const fn = mod.retrieveContext;
            return await fn(sessionId, query, topK);
        }
    }
    catch (err) {
        console.warn('[mcp-doc-retrieval] Direct RAG retrieval fallback failed:', err);
    }
    return [];
}
/**
 * Creates and configures the Document Retrieval MCP Server instance and Express application.
 */
export function createDocRetrievalMcpServer() {
    const server = new McpServer({
        name: 'mcp-doc-retrieval',
        version: '1.0.0',
    });
    server.tool('retrieve_context', {
        sessionId: z.string().describe('Research session ID to scope retrieval to'),
        query: z.string().describe('Search query for semantic + keyword retrieval'),
        topK: z.number().default(5).describe('Maximum number of chunks to return'),
    }, async ({ sessionId, query, topK }) => {
        const chunks = await retrieveDocumentContext(sessionId, query, topK);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(chunks),
                },
            ],
        };
    });
    const app = express();
    app.use(cors());
    const transports = new Map();
    app.get('/sse', async (_req, res) => {
        const transport = new SSEServerTransport('/message', res);
        transports.set(transport.sessionId, transport);
        transport.onclose = () => {
            transports.delete(transport.sessionId);
        };
        await server.connect(transport);
    });
    app.post('/message', async (req, res) => {
        const sessionId = (Array.isArray(req.query.sessionId)
            ? req.query.sessionId[0]
            : req.query.sessionId);
        const transport = transports.get(sessionId);
        if (!transport) {
            res.status(404).json({ error: 'SSE session not found or already closed' });
            return;
        }
        await transport.handlePostMessage(req, res);
    });
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            server: 'mcp-doc-retrieval',
            tools: ['retrieve_context'],
            activeTransports: transports.size,
        });
    });
    return { app, server };
}
const PORT = parseInt(process.env.MCP_DOC_RETRIEVAL_PORT || process.env.PORT || '4002', 10);
if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
    const { app } = createDocRetrievalMcpServer();
    app.listen(PORT, () => {
        console.log(`[mcp-doc-retrieval] MCP Doc Retrieval Server running on http://localhost:${PORT}/sse`);
    });
}
