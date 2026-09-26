import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ResearchSession, AgentTrace, Report } from '../models/index.js';
import { IngestionPipeline } from '../rag/index.js';
import { MCPClientManager } from '../mcp/index.js';

async function runMcpPipelineVerification() {
  console.log('========================================================================');
  console.log('    INSIGHTFORGE-AI: MCP TOOL INTEGRATION & PIPELINE VERIFICATION       ');
  console.log('========================================================================\n');

  console.log('[Setup] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[Setup] Connected to database: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);

  const app = createApp();

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

  // ------------------------------------------------------------------
  // 3. Full End-to-End Pipeline Execution with MCP-Routed Tools
  // ------------------------------------------------------------------
  console.log('--- Step 3: Running End-to-End Pipeline with MCP Routing ---');

  const runRes = await request(app).post(`/api/sessions/${testSessionId}/run`).send({});

  console.log(`Pipeline Execution Status: ${runRes.status}`);
  if (runRes.status !== 200) {
    console.error('Pipeline execution error:', runRes.body);
    throw new Error(`Pipeline failed with status ${runRes.status}`);
  }

  const { session: updatedSession, report, state } = runRes.body;
  console.log(`Session Status: ${updatedSession.status}`);
  console.log(`Sub-Questions: ${state.subQuestions.length}`);
  console.log(`Findings: ${state.researchFindings.length}`);
  console.log(`Verified Claims: ${state.verifiedClaims.length}`);
  console.log(`Report Title: "${state.finalReport?.title || report.title}"`);
  console.log(`Report Sources: ${report.sources.length}`);

  // ------------------------------------------------------------------
  // 4. Verify MongoDB Reasoning Traces for Full Run
  // ------------------------------------------------------------------
  console.log('\n--- Step 4: Verifying Complete Reasoning Trace in MongoDB ---');
  const allTraces = await AgentTrace.find({ sessionId: testSessionId }).sort({ timestamp: 1 });
  console.log(`Total Traces in MongoDB for Session: ${allTraces.length}`);

  const stepsList = allTraces.map((t) => `${t.agentName} (${t.step})`);
  stepsList.forEach((s, idx) => {
    console.log(`  ${idx + 1}. ${s}`);
  });

  // Verify presence of planner, researcher, MCP calls, critic, synthesizer
  const hasPlanner = allTraces.some((t) => t.agentName === 'PlannerAgent');
  const hasResearcher = allTraces.some((t) => t.agentName === 'ResearcherAgent');
  const hasMcpToolCalls = allTraces.some((t) => String(t.step).startsWith('mcp_call_'));
  const hasCritic = allTraces.some((t) => t.agentName === 'CriticAgent');
  const hasSynthesizer = allTraces.some((t) => t.agentName === 'SynthesizerAgent');

  console.log('\nTrace Validation Breakdown:');
  console.log(`  - PlannerAgent trace:      ${hasPlanner ? 'YES' : 'NO'}`);
  console.log(`  - ResearcherAgent trace:   ${hasResearcher ? 'YES' : 'NO'}`);
  console.log(`  - MCP Tool Call traces:    ${hasMcpToolCalls ? 'YES' : 'NO'}`);
  console.log(`  - CriticAgent trace:        ${hasCritic ? 'YES' : 'NO'}`);
  console.log(`  - SynthesizerAgent trace:   ${hasSynthesizer ? 'YES' : 'NO'}`);

  if (!hasPlanner || !hasResearcher || !hasMcpToolCalls || !hasCritic || !hasSynthesizer) {
    throw new Error('Trace audit failed: missing expected agent trace steps');
  }

  // Verify Report Document
  const dbReport = await Report.findOne({ sessionId: testSessionId });
  if (!dbReport || !dbReport.content || dbReport.sources.length === 0) {
    throw new Error('Final report document is missing or invalid in MongoDB');
  }
  console.log('✓ MongoDB Report document validated.');

  await MCPClientManager.close();
  await disconnectDatabase();

  console.log('\n========================================================================');
  console.log('  ALL MCP TOOL ACCESS & MULTI-AGENT PIPELINE TESTS PASSED (100%)       ');
  console.log('========================================================================\n');
  process.exit(0);
}

runMcpPipelineVerification().catch(async (err) => {
  console.error('\n❌ MCP Pipeline Verification Failed:', err);
  await MCPClientManager.close().catch(() => null);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
