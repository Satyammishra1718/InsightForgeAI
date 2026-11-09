import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ResearchSession, AgentTrace } from '../models/index.js';
import { IngestionPipeline } from '../rag/index.js';
import { MCPClientManager } from '../mcp/index.js';

// Standalone script: own embedded DB + in-process worker, so use a private BullMQ queue
// instead of the dev server's 'research' queue (its worker can't see this script's sessions).
process.env.RESEARCH_QUEUE_NAME ??= `research-script-${process.pid}`;

async function runMcpPipelineVerification() {
  console.log('========================================================================');
  console.log('    INSIGHTFORGE-AI: MCP TOOL INTEGRATION & PIPELINE VERIFICATION       ');
  console.log('========================================================================\n');

  console.log('[Setup] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[Setup] Connected to database: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);


  // ------------------------------------------------------------------
  // 1. Dynamic Tool Discovery via MCP Client
  // ------------------------------------------------------------------
  console.log('--- Step 1: Initializing MCP Client & Dynamic Discovery ---');
  await MCPClientManager.initialize();

  const discoveredTools = MCPClientManager.listDiscoveredTools();
  console.log(`Discovered Tools Count: ${discoveredTools.length}`);
  discoveredTools.forEach((t) => {
    console.log(`  - Tool: '${t.name}' from Server: '${t.serverName}'`);
  });

  const toolNames = discoveredTools.map((t) => t.name);
  if (!toolNames.includes('web_search') || !toolNames.includes('retrieve_context')) {
    throw new Error(
      `Required MCP tools missing. Found: ${JSON.stringify(toolNames)}. Expected: ['web_search', 'retrieve_context']`,
    );
  }
  console.log('✓ Dynamic MCP tool discovery verified!\n');

  // ------------------------------------------------------------------
  // 2. Direct MCP Tool Invocations & Trace Logging
  // ------------------------------------------------------------------
  console.log('--- Step 2: Testing Direct MCP Tool Invocations with Tracing ---');

  const testSession = await ResearchSession.create({
    query: 'compare the tradeoffs between PostgreSQL and MongoDB for a high-write workload',
    status: 'pending',
  });
  const testSessionId = testSession._id.toString();

  // Ingest sample chunks for this session
  await IngestionPipeline.ingestWebSnippets(testSessionId, [
    {
      title: 'PostgreSQL WAL Engine Analysis',
      url: 'https://postgresql.org/docs/current/wal-internals.html',
      snippet:
        'PostgreSQL WAL buffers synchronous writes and commits transaction records sequentially before updating table heap pages.',
    },
  ]);

  // Invoke retrieve_context via MCP
  console.log('Calling MCP tool: retrieve_context...');
  const docResult = await MCPClientManager.callTool<unknown[]>(
    'retrieve_context',
    { sessionId: testSessionId, query: 'WAL buffer synchronous writes', topK: 2 },
    { sessionId: testSessionId, agentName: 'MCPVerificationTest' },
  );

  console.log(`retrieve_context returned: ${docResult.length} chunks`);
  if (!Array.isArray(docResult) || docResult.length === 0) {
    throw new Error('MCP retrieve_context returned empty results');
  }

  // Invoke web_search via MCP
  console.log('Calling MCP tool: web_search...');
  const webResult = await MCPClientManager.callTool<
    Array<{ title: string; url: string; snippet: string }>
  >(
    'web_search',
    { query: 'PostgreSQL vs MongoDB write performance benchmarks' },
    { sessionId: testSessionId, agentName: 'MCPVerificationTest' },
  );

  console.log(`web_search returned: ${webResult.length} results`);
  if (!Array.isArray(webResult) || webResult.length === 0) {
    throw new Error('MCP web_search returned empty results');
  }

  // Check that MCP traces were logged to MongoDB
  const mcpTraces = await AgentTrace.find({
    sessionId: testSessionId,
    step: { $regex: /^mcp_call_/ },
  });

  console.log(`AgentTrace records logged for direct MCP calls: ${mcpTraces.length}`);
  mcpTraces.forEach((t) => {
    console.log(
      `  [Trace] Step: ${t.step} | Tool: ${JSON.stringify(t.input)} | Output: ${JSON.stringify(t.output)}`,
    );
  });

  if (mcpTraces.length < 2) {
    throw new Error(`Expected at least 2 MCP tool traces, found ${mcpTraces.length}`);
  }
  console.log('✓ Direct MCP tool calls and AgentTrace telemetry verified!\n');

  // The full multi-agent run is asynchronous (POST /run returns 202 and a BullMQ worker
  // executes it), and this script runs against its own embedded database, which the dev
  // worker cannot see. End-to-end pipeline coverage lives in `npm run test:async -w backend`
  // and agent-service/tests/test_live_system.py, which drive the real running stack.

  await MCPClientManager.close();
  await disconnectDatabase();

  console.log('\n========================================================================');
  console.log('  ALL MCP TOOL DISCOVERY & TOOL-CALL TESTS PASSED                        ');
  console.log('========================================================================\n');
  process.exit(0);
}

runMcpPipelineVerification().catch(async (err) => {
  console.error('\n❌ MCP Pipeline Verification Failed:', err);
  await MCPClientManager.close().catch(() => null);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
