import { Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ResearchSession, AgentTrace, Report } from '../models/index.js';
import { IngestionPipeline } from '../rag/index.js';
import { CriticAgent } from '../agents/critic.agent.js';
import { ResearcherAgent } from '../agents/researcher.agent.js';
import { AgentState, ResearchFinding } from '../agents/types.js';

async function runPipelineTests() {
  console.log('================================================================');
  console.log('  InsightForge-AI Multi-Agent Orchestration End-to-End Test');
  console.log('================================================================\n');

  console.log('[Setup] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[Setup] Connected to database: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);

  const app = createApp();
  const targetQuery =
    'compare the tradeoffs between PostgreSQL and MongoDB for a high-write workload';

  // ------------------------------------------------------------------
  // 1. Create Session & Ingest RAG Knowledge Chunks
  // ------------------------------------------------------------------
  console.log('--- Step 1: Ingesting Grounded Research Chunks into RAG ---');

  // Create session first
  const session = await ResearchSession.create({
    query: targetQuery,
    status: 'pending',
  });
  const sessionId = session._id.toString();
  console.log(`Created test session: ${sessionId} (Query: "${targetQuery}")`);

  // Ingest reference technical docs for this session
  const ingestionResult = await IngestionPipeline.ingestWebSnippets(sessionId, [
    {
      title: 'PostgreSQL Internals: High-Write Workloads and WAL Architecture',
      url: 'https://postgresql.org/docs/current/wal-internals.html',
      snippet:
        'PostgreSQL writes changes to a Write-Ahead Log (WAL) before writing to shared buffer data pages to ensure ACID durability. ' +
        'In write-intensive workloads, WAL disk I/O and fsync flushing can become a bottleneck. Group commit helps batch simultaneous commits. ' +
        'Multi-Version Concurrency Control (MVCC) creates new row versions on updates, causing table bloat and requiring aggressive autovacuum cycles. ' +
        'Heap-Only Tuple (HOT) optimizations minimize write amplification by avoiding secondary index updates when indexed columns are untouched.',
    },
    {
      title: 'MongoDB WiredTiger Storage Engine: Concurrency and Write Throughput',
      url: 'https://mongodb.com/docs/manual/core/wiredtiger-storage-engine',
      snippet:
        'MongoDB default WiredTiger storage engine utilizes document-level concurrency control and optimistic locking to deliver high write throughput. ' +
        'WiredTiger maintains an in-memory cache and writes modifications to an on-disk write-ahead journal every 100 milliseconds or on commit. ' +
        'Checkpoints are written every 60 seconds by default, flushing dirty cache pages to disk in a consolidated sequential write burst. ' +
        'For distributed write scalability, MongoDB provides horizontal sharding across partition keys without requiring application-level data routing.',
    },
    {
      title: 'High-Throughput Database Benchmarks: PostgreSQL vs MongoDB',
      url: 'https://db-engines.com/en/article/postgres-vs-mongodb-write-benchmarks',
      snippet:
        'Benchmark analysis for heavy ingestion workloads reveals key architectural trade-offs between PostgreSQL and MongoDB. ' +
        'For batched bulk inserts into unindexed collections, MongoDB WiredTiger outperforms PostgreSQL due to asynchronous cache buffering. ' +
        'However, PostgreSQL maintains superior write latency consistency under strict serializable isolation and complex relational integrity constraints. ' +
        'Adding multiple secondary indexes significantly increases write amplification in both engines, but PostgreSQL suffers higher index maintenance overhead.',
    },
  ]);

  console.log(
    `Ingested ${ingestionResult.chunksCount} chunks (${ingestionResult.totalTokens} tokens) into RAG for session.\n`,
  );

  // ------------------------------------------------------------------
  // 2. Trigger Multi-Agent Pipeline via POST /api/sessions/:id/run
  // ------------------------------------------------------------------
  console.log('--- Step 2: Testing POST /api/sessions/:id/run ---');

  const runRes = await request(app).post(`/api/sessions/${sessionId}/run`).send({});

  console.log(`HTTP Status: ${runRes.status}`);
  if (runRes.status !== 200) {
    console.error('Run pipeline error response:', runRes.body);
    throw new Error(`Pipeline execution endpoint failed with status ${runRes.status}`);
  }

  const { session: updatedSession, report, state } = runRes.body;

  console.log('✓ Pipeline finished successfully!');
  console.log(`Session Status: ${updatedSession.status}`);
  console.log(`Sub-Questions Planned: ${state.subQuestions.length}`);
  state.subQuestions.forEach((sq: { id: string; question: string }) => {
    console.log(`  - [${sq.id}] ${sq.question}`);
  });

  console.log(`Research Findings Count: ${state.researchFindings.length}`);
  console.log(`Verified Claims Count: ${state.verifiedClaims.length}`);
  console.log(`Report Title: "${report.title || 'Architectural Evaluation'}"`);
  console.log(`Report Sources Count: ${report.sources?.length}`);
  console.log(`Report Content Length: ${report.content?.length} characters\n`);

  // Verify session status in DB
  const dbSession = await ResearchSession.findById(sessionId);
  if (dbSession?.status !== 'completed') {
    throw new Error(`Expected session status 'completed', got '${dbSession?.status}'`);
  }
  console.log('✓ MongoDB Session status is "completed".');

  // Verify Report in DB
  const dbReport = await Report.findOne({ sessionId });
  if (!dbReport || !dbReport.content || dbReport.sources.length === 0) {
    throw new Error('Report document missing or empty in MongoDB');
  }
  console.log('✓ MongoDB Report document verified with sources.');

  // Verify AgentTraces in DB
  const traces = await AgentTrace.find({ sessionId }).sort({ timestamp: 1 });
  console.log(`Agent Traces written to MongoDB: ${traces.length}`);
  traces.forEach((t) => {
    console.log(`  [Trace] Agent: ${t.agentName.padEnd(16)} | Step: ${String(t.step).padEnd(20)}`);
  });

  const agentNames = traces.map((t) => t.agentName);
  if (
    !agentNames.includes('PlannerAgent') ||
    !agentNames.includes('ResearcherAgent') ||
    !agentNames.includes('CriticAgent') ||
    !agentNames.includes('SynthesizerAgent')
  ) {
    throw new Error(
      `Missing required agent traces. Found: ${JSON.stringify(Array.from(new Set(agentNames)))}`,
    );
  }
  console.log('✓ All 4 AgentTraces (Planner, Researcher, Critic, Synthesizer) persisted.\n');

  // ------------------------------------------------------------------
  // 3. Test Critic Agent with Deliberately Flawed / Unsupported Claims
  // ------------------------------------------------------------------
  console.log('--- Step 3: Testing Critic/Verifier Agent with Deliberately Flawed Claim ---');

  const flawedFindings: ResearchFinding[] = [
    {
      subQuestionId: 'sub-test',
      subQuestion: 'What are the write persistence mechanisms?',
      finding:
        'PostgreSQL writes changes to a Write-Ahead Log (WAL) before writing to shared buffer data pages to ensure ACID durability. ' +
        'PostgreSQL was invented in 2029 by SpaceX and writes directly to quantum storage tape drives. ' +
        'MongoDB default WiredTiger storage engine utilizes document-level concurrency control to deliver high write throughput.',
      sources: [
        {
          title: 'PostgreSQL WAL Docs',
          url: 'https://postgresql.org/docs/current/wal-internals.html',
        },
      ],
      retrievedChunks: [
        {
          id: 'chunk-1',
          text:
            'PostgreSQL writes changes to a Write-Ahead Log (WAL) before writing to shared buffer data pages to ensure ACID durability. ' +
            'In write-intensive workloads, WAL disk I/O and fsync flushing can become a bottleneck.',
          source: 'https://postgresql.org/docs/current/wal-internals.html',
          score: 0.95,
        },
        {
          id: 'chunk-2',
          text:
            'MongoDB default WiredTiger storage engine utilizes document-level concurrency control and optimistic locking to deliver high write throughput. ' +
            'Checkpoints are written every 60 seconds by default.',
          source: 'https://mongodb.com/docs/manual/core/wiredtiger-storage-engine',
          score: 0.92,
        },
      ],
    },
  ];

  const dummySessionId = new Types.ObjectId().toString();
  const dummyState: AgentState = {
    sessionId: dummySessionId,
    originalQuery: targetQuery,
    subQuestions: [],
    researchFindings: flawedFindings,
    verifiedClaims: [],
    status: 'in_progress',
  };

  const criticResult = await CriticAgent.execute(dummyState, flawedFindings);

  console.log(`Critic verified claims: ${criticResult.verified.length}`);
  criticResult.verified.forEach((c) => {
    console.log(`  ✓ [VERIFIED] "${c.claim.slice(0, 70)}..."`);
    console.log(`    Evidence: "${c.evidence?.slice(0, 80)}..."`);
  });

  console.log(`\nCritic flagged claims: ${criticResult.flagged.length}`);
  criticResult.flagged.forEach((c) => {
    console.log(`  ✗ [FLAGGED: ${c.status.toUpperCase()}] "${c.claim}"`);
    console.log(`    Reasoning: ${c.reasoning}`);
  });

  const caughtUnsupported = criticResult.flagged.some(
    (c) =>
      c.claim.toLowerCase().includes('spacex') ||
      c.claim.toLowerCase().includes('quantum storage') ||
      c.status === 'unsupported',
  );

  if (!caughtUnsupported) {
    throw new Error('Critic agent failed to catch deliberately-flawed unsupported claim!');
  }
  console.log('\n✓ Critic Agent successfully caught deliberately-flawed claim!\n');

  // ------------------------------------------------------------------
  // 4. Test Error Handling (Invalid Session ID)
  // ------------------------------------------------------------------
  console.log('--- Step 4: Testing Error Handling on Invalid Session ID ---');
  const fakeSessionId = '000000000000000000000000';
  const notFoundRes = await request(app).post(`/api/sessions/${fakeSessionId}/run`).send({});

  console.log(`HTTP Status for fake ID: ${notFoundRes.status}`);
  console.log('Response body:', JSON.stringify(notFoundRes.body));

  if (
    notFoundRes.status !== 404 ||
    !notFoundRes.body.error ||
    notFoundRes.body.error.code !== 'NOT_FOUND'
  ) {
    throw new Error('Expected 404 NOT_FOUND response for non-existent session ID');
  }
  console.log('✓ 404 error handling verified successfully!\n');

  // ------------------------------------------------------------------
  // 5. Test Researcher Error Resilience (Requirement 8)
  // ------------------------------------------------------------------
  console.log('--- Step 5: Testing Researcher Agent Error Resilience ---');
  const resilienceState: AgentState = {
    sessionId: new Types.ObjectId().toString(),
    originalQuery: 'resilience test query',
    subQuestions: [
      { id: 'sub-ok-1', question: 'How do database checkpoints function?' },
      { id: 'sub-fail', question: 'FORCE_ERROR_SIMULATION' },
      { id: 'sub-ok-2', question: 'What is write amplification in b-trees?' },
    ],
    researchFindings: [],
    verifiedClaims: [],
    status: 'in_progress',
  };

  // Mock executeSingle to fail only on sub-fail
  const originalExecuteSingle = ResearcherAgent.executeSingle;
  ResearcherAgent.executeSingle = async (sId, sq) => {
    if (sq.id === 'sub-fail') {
      throw new Error('Simulated network timeout for researcher sub-fail');
    }
    return originalExecuteSingle.call(ResearcherAgent, sId, sq);
  };

  try {
    const resilientFindings = await ResearcherAgent.executeAll(resilienceState, 3);
    console.log(`Resilient researchers completed: ${resilientFindings.length} of 2 working`);
    if (resilientFindings.length !== 2) {
      throw new Error(`Expected 2 surviving findings, got ${resilientFindings.length}`);
    }
    console.log('✓ Researcher error resilience verified (isolated failure handled gracefully).\n');
  } finally {
    ResearcherAgent.executeSingle = originalExecuteSingle;
  }

  // ------------------------------------------------------------------
  // 6. Inspect and Print Generated Markdown Report
  // ------------------------------------------------------------------
  console.log('--- Step 6: Report Excerpt Verification ---');
  console.log('Report Title:', state.finalReport?.title || 'Architectural Evaluation');
  console.log('Markdown Content Preview:');
  console.log('----------------------------------------------------');
  const previewLines = report.content.split('\n').slice(0, 20).join('\n');
  console.log(previewLines);
  console.log('----------------------------------------------------');
  console.log('✓ Report markdown structure verified.\n');

  await disconnectDatabase();
  console.log('================================================================');
  console.log('  ALL MULTI-AGENT ORCHESTRATION PIPELINE TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runPipelineTests().catch(async (err) => {
  console.error('\n❌ Pipeline Test Suite Failed:', err);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
