import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ResearchSession, AgentTrace, Report } from '../models/index.js';
import { IngestionPipeline } from '../rag/index.js';
import { runResearchPipeline } from '../agents/orchestrator.js';

// Standalone script: own embedded DB + in-process worker, so use a private BullMQ queue
// instead of the dev server's 'research' queue (its worker can't see this script's sessions).
process.env.RESEARCH_QUEUE_NAME ??= `research-script-${process.pid}`;

async function runLangGraphMigrationVerification() {
  console.log('========================================================================');
  console.log('    INSIGHTFORGE-AI: LANGGRAPH AGENT SERVICE END-TO-END VERIFICATION    ');
  console.log('========================================================================\n');

  console.log('[1/6] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[1/6] Connected to database: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);

  const app = createApp();
  const query = 'compare the tradeoffs between PostgreSQL and MongoDB for a high-write workload';

  // Step 1: Create session via REST API
  console.log('[2/6] Creating research session via POST /api/sessions...');
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ query })
    .expect(201);

  const sessionId = createRes.body.session._id;
  console.log(`[2/6] Session created: ID = ${sessionId}, status = ${createRes.body.session.status}\n`);

  // Step 2: Seed RAG knowledge base for this session
  console.log('[3/6] Seeding RAG knowledge chunks for session context...');
  await IngestionPipeline.ingestWebSnippets(sessionId, [
    {
      title: 'PostgreSQL WAL Internals and Concurrency',
      url: 'https://postgresql.org/docs/current/wal-internals.html',
      snippet:
        'PostgreSQL writes changes to a Write-Ahead Log (WAL) before updating shared buffer data pages to ensure ACID durability. ' +
        'High-write workloads can create WAL contention and require tuning wal_buffers, max_wal_size, and synchronous_commit.',
    },
    {
      title: 'MongoDB WiredTiger Engine Architecture',
      url: 'https://mongodb.com/docs/manual/core/wiredtiger/',
      snippet:
        'MongoDB uses the WiredTiger storage engine which supports document-level concurrency control, compression, ' +
        'and in-memory cache checkpoints every 60 seconds or 2GB of data.',
    },
  ]);
  console.log('[3/6] RAG snippets successfully ingested.\n');

  // Step 3: Run the full LangGraph pipeline. POST /run only enqueues a BullMQ job (202), so
  // call the same orchestrator function the worker executes and await the result directly.
  console.log(`[4/6] Executing full LangGraph pipeline for session ${sessionId}...`);
  const runStart = Date.now();
  const { state: responseState } = await runResearchPipeline(sessionId, query);

  const durationMs = Date.now() - runStart;
  console.log(`[4/6] Pipeline completed in ${(durationMs / 1000).toFixed(2)}s\n`);

  // Step 4: Verify session state and report
  console.log('[5/6] Verifying session state, report, and claims...');
  const sessionAfter = await ResearchSession.findById(sessionId);
  if (!sessionAfter || sessionAfter.status !== 'completed') {
    throw new Error(`Expected session status to be 'completed', but got '${sessionAfter?.status}'`);
  }
  console.log(`  ✓ Session status verified: '${sessionAfter.status}'`);

  const reportInDb = await Report.findOne({ sessionId });
  if (!reportInDb || !reportInDb.content) {
    throw new Error('Expected Report document in MongoDB with valid content');
  }
  console.log(`  ✓ Report stored in MongoDB: ${reportInDb.content.length} characters, ${reportInDb.sources.length} sources`);

  console.log(`  ✓ Sub-questions generated: ${responseState.subQuestions.length}`);
  for (const sq of responseState.subQuestions) {
    console.log(`     - [${sq.id}] ${sq.question}`);
  }

  console.log(`  ✓ Research findings generated: ${responseState.researchFindings.length}`);
  
  const verifiedClaims = responseState.verifiedClaims.filter((c: { status: string }) => c.status === 'verified');
  const flaggedClaims = responseState.verifiedClaims.filter((c: { status: string }) => c.status === 'unsupported' || c.status === 'flagged');
  console.log(`  ✓ Verified claims: ${verifiedClaims.length}`);
  console.log(`  ✓ Flagged/unsupported claims: ${flaggedClaims.length}`);
  if (flaggedClaims.length > 0) {
    console.log(`     [FLAGGED CLAIM]: "${flaggedClaims[0].claim}"`);
    console.log(`     [REASON]: ${flaggedClaims[0].reasoning}`);
  } else {
    // With well-sourced evidence the Critic may legitimately flag nothing.
    console.log('     (Critic flagged no claims for this query)');
  }

  // Step 5: Verify AgentTrace telemetry in MongoDB
  console.log('\n[6/6] Verifying AgentTrace records in MongoDB...');
  const traces = await AgentTrace.find({ sessionId }).sort({ timestamp: 1 });
  console.log(`  ✓ Total AgentTrace records written to MongoDB: ${traces.length}`);

  const agentNames = new Set(traces.map((t) => t.agentName));
  console.log(`  ✓ Distinct agents recorded in traces: ${Array.from(agentNames).join(', ')}`);

  const requiredAgents = ['Planner', 'Critic', 'Synthesizer'];
  for (const reqAgent of requiredAgents) {
    const hasAgent = Array.from(agentNames).some((n) => n.includes(reqAgent));
    if (!hasAgent) {
      throw new Error(`Missing expected trace for agent: ${reqAgent}`);
    }
  }

  const hasResearcher = Array.from(agentNames).some((n) => n.toLowerCase().includes('researcher'));
  if (!hasResearcher) {
    throw new Error('Missing expected trace for Researcher agent(s)');
  }
  console.log('  ✓ Verified traces exist for Planner, Parallel Researchers, Critic, and Synthesizer');

  console.log('\n========================================================================');
  console.log('   ✓ ALL LANGGRAPH MICROSERVICE MIGRATION CHECKS PASSED SUCCESSFULLY!    ');
  console.log('========================================================================\n');

  await disconnectDatabase();
}

runLangGraphMigrationVerification().catch(async (err) => {
  console.error('\n❌ Verification failed with error:', err);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
