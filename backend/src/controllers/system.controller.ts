import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';
import { getDatabaseInfo } from '../config/database.js';

interface ServiceCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs?: number;
  details?: string;
  url?: string;
}

export async function getSystemStatus(_req: Request, res: Response): Promise<void> {
  const agentServiceUrl = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000';
  const mcpWebSearchUrl = process.env.MCP_WEB_SEARCH_URL?.replace('/sse', '') || 'http://127.0.0.1:4001';
  const mcpDocRetrievalUrl = process.env.MCP_DOC_RETRIEVAL_URL?.replace('/sse', '') || 'http://127.0.0.1:4002';

  // 1. Mongo check
  const checkMongo = async (): Promise<ServiceCheck> => {
    const start = Date.now();
    try {
      const state = mongoose.connection.readyState;
      const isConnected = state === 1;
      const dbInfo = getDatabaseInfo();
      return {
        name: 'MongoDB',
        status: isConnected ? 'healthy' : 'offline',
        latencyMs: Date.now() - start,
        details: isConnected ? `Connected (${dbInfo.mode.toUpperCase()} mode)` : 'Disconnected',
      };
    } catch (err: any) {
      return { name: 'MongoDB', status: 'offline', details: err.message };
    }
  };

  // 2. Redis check
  const checkRedis = async (): Promise<ServiceCheck> => {
    const start = Date.now();
    try {
      const client = await getRedisClient();
      const pong = await client.ping();
      const isOk = pong === 'PONG';
      return {
        name: 'Redis Broker & Cache',
        status: isOk ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        details: isOk ? 'BullMQ & Pub/Sub operational' : 'Unhealthy ping',
      };
    } catch (err: any) {
      return { name: 'Redis Broker & Cache', status: 'offline', details: err.message };
    }
  };

  // 3. Python Agent Service (LangGraph)
  const checkAgentService = async (): Promise<ServiceCheck> => {
    const start = Date.now();
    try {
      const res = await fetch(`${agentServiceUrl}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return {
          name: 'Python Agent Service (LangGraph)',
          status: 'healthy',
          latencyMs: Date.now() - start,
          details: 'FastAPI microservice active',
          url: agentServiceUrl,
        };
      }
      return {
        name: 'Python Agent Service (LangGraph)',
        status: 'degraded',
        latencyMs: Date.now() - start,
        details: `HTTP ${res.status}`,
        url: agentServiceUrl,
      };
    } catch (err: any) {
      return {
        name: 'Python Agent Service (LangGraph)',
        status: 'offline',
        latencyMs: Date.now() - start,
        details: err.name === 'TimeoutError' ? 'Connection timeout' : 'Unreachable',
        url: agentServiceUrl,
      };
    }
  };

  // 4. MCP Web Search Server
  const checkMcpWebSearch = async (): Promise<ServiceCheck> => {
    const start = Date.now();
    try {
      const res = await fetch(`${mcpWebSearchUrl}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return {
          name: 'MCP Web Search Server',
          status: 'healthy',
          latencyMs: Date.now() - start,
          details: 'Tool `web_search` registered',
          url: mcpWebSearchUrl,
        };
      }
      return {
        name: 'MCP Web Search Server',
        status: 'degraded',
        latencyMs: Date.now() - start,
        details: `HTTP ${res.status}`,
        url: mcpWebSearchUrl,
      };
    } catch (err: any) {
      return {
        name: 'MCP Web Search Server',
        status: 'offline',
        latencyMs: Date.now() - start,
        details: 'Offline (mock fallback enabled)',
        url: mcpWebSearchUrl,
      };
    }
  };

  // 5. MCP Doc Retrieval Server
  const checkMcpDocRetrieval = async (): Promise<ServiceCheck> => {
    const start = Date.now();
    try {
      const res = await fetch(`${mcpDocRetrievalUrl}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return {
          name: 'MCP Document Retrieval Server',
          status: 'healthy',
          latencyMs: Date.now() - start,
          details: 'Tool `retrieve_context` registered',
          url: mcpDocRetrievalUrl,
        };
      }
      return {
        name: 'MCP Document Retrieval Server',
        status: 'degraded',
        latencyMs: Date.now() - start,
        details: `HTTP ${res.status}`,
        url: mcpDocRetrievalUrl,
      };
    } catch (err: any) {
      return {
        name: 'MCP Document Retrieval Server',
        status: 'offline',
        latencyMs: Date.now() - start,
        details: 'Offline (internal RAG fallback enabled)',
        url: mcpDocRetrievalUrl,
      };
    }
  };

  const results = await Promise.all([
    checkMongo(),
    checkRedis(),
    checkAgentService(),
    checkMcpWebSearch(),
    checkMcpDocRetrieval(),
  ]);

  const allHealthy = results.every((r) => r.status === 'healthy');
  const anyOffline = results.some((r) => r.status === 'offline');

  res.status(200).json({
    status: allHealthy ? 'operational' : anyOffline ? 'degraded' : 'partial',
    timestamp: new Date().toISOString(),
    services: results,
  });
}
