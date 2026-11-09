import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Types } from 'mongoose';
import { config } from '../config/index.js';
import { AgentTrace } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DiscoveredToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
  serverName: string;
}

export interface MCPToolCallContext {
  sessionId?: string;
  agentName?: string;
}

interface RegisteredTool {
  tool: Tool;
  client: Client;
  serverName: string;
}

export class MCPClientManager {
  private static clients: Map<string, Client> = new Map();
  private static toolsRegistry: Map<string, RegisteredTool> = new Map();
  private static localServers: Array<{ close: () => void }> = [];
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initializes connections to all configured MCP servers and dynamically discovers tools.
   */
  public static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log('[MCP] Connecting to Model Context Protocol servers...');

      const servers = [
        {
          name: 'mcp-web-search',
          url: config.mcpWebSearchUrl,
          fallbackFactory: async () => {
            const p = path.resolve(__dirname, '../../../mcp-servers/web-search/dist/index.js');
            const pSrc = path.resolve(__dirname, '../../../mcp-servers/web-search/src/index.js');
            let mod: Record<string, unknown>;
            try {
              mod = (await import(pathToFileURL(p).href)) as Record<string, unknown>;
            } catch {
              mod = (await import(pathToFileURL(pSrc).href)) as Record<string, unknown>;
            }
            const fn = mod.createWebSearchMcpServer as () => { app: unknown };
            return fn();
          },
          port: 4001,
        },
        {
          name: 'mcp-doc-retrieval',
          url: config.mcpDocRetrievalUrl,
          fallbackFactory: async () => {
            const p = path.resolve(__dirname, '../../../mcp-servers/doc-retrieval/dist/index.js');
            const pSrc = path.resolve(__dirname, '../../../mcp-servers/doc-retrieval/src/index.js');
            let mod: Record<string, unknown>;
            try {
              mod = (await import(pathToFileURL(p).href)) as Record<string, unknown>;
            } catch {
              mod = (await import(pathToFileURL(pSrc).href)) as Record<string, unknown>;
            }
            const fn = mod.createDocRetrievalMcpServer as () => { app: unknown };
            return fn();
          },
          port: 4002,
        },
      ];

      for (const s of servers) {
        await this.connectWithFallback(s);
      }

      this.isInitialized = true;
      const discovered = this.listDiscoveredTools();
      console.log(
        `[MCP] Dynamic tool discovery completed! Discovered ${discovered.length} tools: ${discovered.map((t) => `'${t.name}' (${t.serverName})`).join(', ')}`,
      );
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private static async connectWithFallback(serverConfig: {
    name: string;
    url: string;
    fallbackFactory: () => Promise<{ app: unknown }>;
    port: number;
  }): Promise<void> {
    // 1. Attempt connection to existing running server (e.g. a separately started dev process)
    const connected = await this.tryConnect(serverConfig.name, serverConfig.url);
    if (connected) {
      return;
    }

    // 2. If server not running, start an in-process local instance and connect
    try {
      console.log(
        `[MCP] Server '${serverConfig.name}' unreachable at ${serverConfig.url}. Starting local in-process instance on port ${serverConfig.port}...`,
      );
      const { app } = await serverConfig.fallbackFactory();
      const expressApp = app as {
        listen: (port: number, cb: () => void) => { close: () => void };
      };

      const runningServer = await new Promise<{ close: () => void }>((resolve, reject) => {
        const srv = expressApp.listen(serverConfig.port, () => {
          resolve(srv);
        });
        (srv as unknown as { on: (event: string, cb: (err: unknown) => void) => void }).on(
          'error',
          (err: unknown) => {
            const code = (err as { code?: string })?.code;
            if (code === 'EADDRINUSE') {
              // Port is already occupied, resolve with dummy close
              resolve({ close: () => null });
            } else {
              reject(err);
            }
          },
        );
      });

      this.localServers.push(runningServer);

      // Re-attempt connection
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryConnected = await this.tryConnect(serverConfig.name, serverConfig.url);
      if (!retryConnected) {
        console.warn(`[MCP] Failed to connect to '${serverConfig.name}' after starting local server.`);
      }
    } catch (err) {
      console.warn(`[MCP] Unable to spawn fallback local server for '${serverConfig.name}':`, err);
    }
  }

  private static async tryConnect(serverName: string, urlStr: string): Promise<boolean> {
    try {
      const url = new URL(urlStr);
      const transport = new SSEClientTransport(url);
      const client = new Client(
        {
          name: `insightforge-backend-${serverName}`,
          version: '1.0.0',
        },
        { capabilities: {} },
      );

      await client.connect(transport);
      this.clients.set(serverName, client);

      // Dynamically query available tools from the MCP server
      const toolsResult = await client.listTools();

      for (const tool of toolsResult.tools) {
        this.toolsRegistry.set(tool.name, {
          tool,
          client,
          serverName,
        });
      }

      console.log(
        `[MCP] Connected to '${serverName}' (${urlStr}). Registered: [${toolsResult.tools.map((t) => t.name).join(', ')}]`,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[MCP] Connection probe to '${serverName}' at ${urlStr} failed: ${msg}`);
      return false;
    }
  }

  /**
   * Returns metadata for all dynamically discovered tools across all MCP servers.
   */
  public static listDiscoveredTools(): DiscoveredToolInfo[] {
    return Array.from(this.toolsRegistry.values()).map(({ tool, serverName }) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName,
    }));
  }

  /**
   * Checks if a tool is available in the dynamic MCP registry.
   */
  public static hasTool(toolName: string): boolean {
    return this.toolsRegistry.has(toolName);
  }

  /**
   * Invokes an MCP tool by name through its respective client, measuring latency
   * and logging an AgentTrace to MongoDB.
   */
  public static async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    context?: MCPToolCallContext,
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const entry = this.toolsRegistry.get(toolName);
    if (!entry) {
      const available = Array.from(this.toolsRegistry.keys()).join(', ');
      throw new Error(
        `MCP tool '${toolName}' not found in registry. Discovered tools: [${available}]`,
      );
    }

    const startTime = Date.now();
    let resultData: T;

    try {
      const response = await entry.client.callTool({
        name: toolName,
        arguments: args,
      });

      const contentList = response.content as Array<{ type: string; text?: string }> | undefined;
      const firstContent = contentList?.[0];

      if (firstContent && firstContent.type === 'text' && typeof firstContent.text === 'string') {
        try {
          resultData = JSON.parse(firstContent.text) as T;
        } catch {
          resultData = firstContent.text as unknown as T;
        }
      } else {
        resultData = response.content as unknown as T;
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Log failed tool call trace
      if (context?.sessionId && Types.ObjectId.isValid(context.sessionId)) {
        await AgentTrace.create({
          sessionId: context.sessionId,
          agentName: context.agentName || 'MCPClient',
          step: `mcp_call_${toolName}`,
          input: { tool: toolName, arguments: args },
          output: { error: errorMsg, durationMs, success: false },
          timestamp: new Date(),
        }).catch(() => null);
      }

      throw error;
    }

    const durationMs = Date.now() - startTime;

    // Requirement 5: Log every MCP tool call into AgentTrace collection
    if (context?.sessionId && Types.ObjectId.isValid(context.sessionId)) {
      const isArray = Array.isArray(resultData);
      const preview =
        typeof resultData === 'string'
          ? resultData.slice(0, 160)
          : JSON.stringify(resultData).slice(0, 160);

      await AgentTrace.create({
        sessionId: context.sessionId,
        agentName: context.agentName || 'MCPClient',
        step: `mcp_call_${toolName}`,
        input: {
          tool: toolName,
          serverName: entry.serverName,
          arguments: args,
        },
        output: {
          success: true,
          durationMs,
          itemCount: isArray ? (resultData as unknown[]).length : 1,
          preview,
        },
        timestamp: new Date(),
      }).catch((err) => {
        console.warn(`[MCP] Failed to record AgentTrace for tool '${toolName}':`, err);
      });
    }

    return resultData;
  }

  /**
   * Gracefully closes all active MCP client sessions and local servers.
   */
  public static async close(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (err) {
        console.warn(`[MCP] Error closing client '${name}':`, err);
      }
    }

    this.clients.clear();
    this.toolsRegistry.clear();

    for (const srv of this.localServers) {
      try {
        srv.close();
      } catch {
        // Ignored
      }
    }

    this.localServers = [];
    this.isInitialized = false;
  }
}
