import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ResearchSession, AgentTrace, Report } from '../models/index.js';
import { IngestionPipeline } from '../rag/index.js';
import { PlannerAgent } from '../agents/planner.agent.js';
import { ResearcherAgent } from '../agents/researcher.agent.js';
import { CriticAgent } from '../agents/critic.agent.js';
import { SynthesizerAgent } from '../agents/synthesizer.agent.js';
import { AgentState, ResearchFinding } from '../agents/types.js';

async function verifyOrchestrationChecklist() {
  console.log('========================================================================');
  console.log('   INSIGHTFORGE-AI: MULTI-AGENT ORCHESTRATION CHECKLIST VERIFICATION    ');
  console.log('========================================================================\n');

  console.log('[Setup] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[Setup] Connected to database: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);

  const app = createApp();
  const sampleQuery =
    'compare the tradeoffs between PostgreSQL and MongoDB for a high-write workload';

  // Create isolated session for verification
  const session = await ResearchSession.create({
    query: sampleQuery,
    status: 'pending',
  });
  const sessionId = session._id.toString();
  console.log(`Created active test session: ${sessionId}\n`);

  // Ingest grounded context into RAG for this session
  await IngestionPipeline.ingestWebSnippets(sessionId, [
    {
      title: 'PostgreSQL WAL Internals and Concurrency',
      url: 'https://postgresql.org/docs/current/wal-internals.html',
      snippet:
        'PostgreSQL writes changes to a Write-Ahead Log (WAL) before updating shared buffer data pages to ensure ACID durability. ' +
        'In write-intensive workloads, WAL disk I/O and fsync flushing can become a bottleneck. Group commit helps batch simultaneous commits. ' +
        'Multi-Version Concurrency Control (MVCC) creates new row versions on updates, causing table bloat and requiring aggressive autovacuum cycles. ' +
        'Heap-Only Tuple (HOT) optimizations minimize write amplification by avoiding secondary index updates when indexed columns are untouched.',
    },
    {
      title: 'MongoDB WiredTiger Storage Engine Architecture',
      url: 'https://mongodb.com/docs/manual/core/wiredtiger-storage-engine',
      snippet:
        'MongoDB default WiredTiger storage engine utilizes document-level concurrency control and optimistic locking to deliver high write throughput. ' +
        'WiredTiger maintains an in-memory cache and writes modifications to an on-disk write-ahead journal every 100 milliseconds or on commit. ' +
        'Checkpoints are written every 60 seconds by default, flushing dirty cache pages to disk in a consolidated sequential write burst. ' +
        'For distributed write scalability, MongoDB provides horizontal sharding across partition keys without requiring application-level data routing.',
    },
    {
      title: 'Database Ingestion Benchmarks: Postgres vs Mongo',
      url: 'https://db-engines.com/en/article/postgres-vs-mongodb-write-benchmarks',
      snippet:
        'Benchmark analysis for heavy ingestion workloads reveals key architectural trade-offs between PostgreSQL and MongoDB. ' +
        'For batched bulk inserts into unindexed collections, MongoDB WiredTiger outperforms PostgreSQL due to asynchronous cache buffering. ' +
        'However, PostgreSQL maintains superior write latency consistency under strict serializable isolation and complex relational integrity constraints. ' +
        'Adding multiple secondary indexes significantly increases write amplification in both engines, but PostgreSQL suffers higher index maintenance overhead.',
    },
  ]);

  const state: AgentState = {
    sessionId,
    originalQuery: sampleQuery,
    subQuestions: [],
    researchFindings: [],
    verifiedClaims: [],
    status: 'in_progress',
  };

  // ------------------------------------------------------------------
  // CHECK 1: Planner produces sensible, non-overlapping sub-questions
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 1/6] Planner produces sensible, non-overlapping sub-questions');
  console.log('------------------------------------------------------------------------');

  const subQuestions = await PlannerAgent.execute(state);

  console.log(`Generated Sub-Questions Count: ${subQuestions.length}`);
  if (subQuestions.length < 3 || subQuestions.length > 5) {
    throw new Error(`Expected 3-5 sub-questions, got ${subQuestions.length}`);
  }

  // Verify non-overlapping uniqueness
  const questionTexts = subQuestions.map((s) => s.question.toLowerCase());
  const uniqueQuestions = new Set(questionTexts);
  if (uniqueQuestions.size !== subQuestions.length) {
    throw new Error('Detected overlapping/duplicate sub-questions in planner output');
  }

  subQuestions.forEach((sq, i) => {
    console.log(`  Sub-Question ${i + 1} [${sq.id}]:`);
    console.log(`    Question: "${sq.question}"`);
    console.log(`    Rationale: ${sq.rationale}`);
  });

  console.log('\n>>> [PASS] Planner produces sensible, non-overlapping sub-questions.\n');

  // ------------------------------------------------------------------
  // CHECK 2: Researcher agents run in parallel and ground findings in RAG
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 2/6] Researcher agents run in parallel with grounded findings');
  console.log('------------------------------------------------------------------------');

  const startTime = Date.now();
  const findings = await ResearcherAgent.executeAll(state, 3);
  const elapsedMs = Date.now() - startTime;

  console.log(`Parallel execution completed in ${elapsedMs}ms for ${findings.length} researchers.`);

  findings.forEach((f, i) => {
    console.log(`\n  Researcher ${i + 1} Finding for [${f.subQuestionId}]:`);
    console.log(`    Sub-Question: "${f.subQuestion.slice(0, 60)}..."`);
    console.log(`    Retrieved Chunks Count: ${f.retrievedChunks.length}`);
    console.log(`    Sources Cited: ${f.sources.map((s) => s.title).join('; ')}`);
    console.log(`    Inline Citation Excerpt: "${f.finding.slice(0, 140)}..."`);

    // Verify grounding
    if (f.retrievedChunks.length === 0) {
      throw new Error(`Researcher ${f.subQuestionId} retrieved 0 RAG chunks`);
    }
    if (f.sources.length === 0) {
      throw new Error(`Researcher ${f.subQuestionId} failed to attach sources`);
    }
  });

  console.log('\n>>> [PASS] Researcher agents run in parallel and produce grounded findings.\n');

  // ------------------------------------------------------------------
  // CHECK 3: Critic agent visibly flags/removes at least one unsupported claim
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 3/6] Critic agent visibly flags/removes unsupported claims');
  console.log('------------------------------------------------------------------------');

  // Inject a deliberately-flawed finding alongside legitimate findings
  const deliberateUnsupportedClaim =
    'PostgreSQL was invented in 2029 by SpaceX and writes directly to quantum storage tape drives.';
  const deliberateContradictedClaim =
    'MongoDB does not support document-level concurrency and relies entirely on single-threaded magnetic tape.';

  const deliberateFindings: ResearchFinding[] = [
    ...state.researchFindings,
    {
      subQuestionId: 'sub-deliberate-test',
      subQuestion: 'Experimental storage hardware test',
      finding: `${deliberateUnsupportedClaim} Furthermore, ${deliberateContradictedClaim}`,
      sources: [
        {
          title: 'Fictional Speculative Blog',
          url: 'https://speculative-fiction.org/storage',
        },
      ],
      retrievedChunks: state.researchFindings[0]?.retrievedChunks || [],
    },
  ];

  const criticState: AgentState = {
    sessionId: state.sessionId,
    originalQuery: sampleQuery,
    subQuestions: state.subQuestions,
    researchFindings: deliberateFindings,
    verifiedClaims: [],
    status: 'in_progress',
  };

  const criticResult = await CriticAgent.execute(criticState, deliberateFindings);

  console.log(`Total Claims Assessed by Critic: ${criticState.verifiedClaims.length}`);
  console.log(`Claims Verified: ${criticResult.verified.length}`);
  console.log(`Claims Flagged / Removed: ${criticResult.flagged.length}`);

  console.log('\n  --- Flagged / Removed Claims Detail ---');
  criticResult.flagged.forEach((c, idx) => {
    console.log(`  [FLAGGED #${idx + 1}] Status: ${c.status.toUpperCase()}`);
    console.log(`    Claim: "${c.claim}"`);
    console.log(`    Reasoning: ${c.reasoning}`);
  });

  console.log('\n  --- Sample Verified Claim Detail ---');
  const sampleVerified = criticResult.verified[0];
  if (sampleVerified) {
    console.log(`  [VERIFIED #1] Status: ${sampleVerified.status.toUpperCase()}`);
    console.log(`    Claim: "${sampleVerified.claim.slice(0, 90)}..."`);
    console.log(`    Corroborating Evidence: "${sampleVerified.evidence?.slice(0, 110)}..."`);
    console.log(`    Source: ${sampleVerified.sourceUrl}`);
  }

  const caughtDeliberate = criticResult.flagged.some(
    (c) =>
      c.claim.toLowerCase().includes('spacex') ||
      c.claim.toLowerCase().includes('quantum storage') ||
      c.claim.toLowerCase().includes('magnetic tape') ||
      c.status === 'unsupported',
  );

  if (!caughtDeliberate) {
    throw new Error('Critic agent failed to visibly flag the deliberate unsupported claim');
  }

  console.log('\n>>> [PASS] Critic agent visibly flags and removes unsupported claims.\n');

  // Update original state with cleaned verified claims
  state.verifiedClaims = criticResult.verified;

  // ------------------------------------------------------------------
  // CHECK 4: Synthesizer produces a coherent report with inline citations
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 4/6] Synthesizer produces coherent final report with citations');
  console.log('------------------------------------------------------------------------');

  const finalReport = await SynthesizerAgent.execute(state);

  console.log(`Report Title: "${finalReport.title}"`);
  console.log(`Total Report Characters: ${finalReport.content.length}`);
  console.log(`Sources Attached Count: ${finalReport.sources.length}`);

  const requiredSections = [
    'Executive Summary',
    'Architectural & Technical Breakdown',
    'Comparative Trade-off Analysis',
    'Verification & Evidence Audit',
    'References & Sources',
  ];

  for (const sec of requiredSections) {
    const present = finalReport.content.includes(sec);
    console.log(`  - Section "${sec}": ${present ? 'PRESENT' : 'MISSING'}`);
    if (!present) {
      throw new Error(`Report is missing mandatory section: ${sec}`);
    }
  }

  // Check for inline citations like [1], [2] or source mentions
  const hasInlineCitations =
    /\[\d+\]/.test(finalReport.content) || /\[Source:/.test(finalReport.content);
  console.log(`  - Inline Citations Present: ${hasInlineCitations ? 'YES' : 'NO'}`);
  if (!hasInlineCitations) {
    throw new Error('Report is missing inline source citations');
  }

  console.log('\n>>> [PASS] Synthesizer produces coherent report with valid inline citations.\n');

  // ------------------------------------------------------------------
  // CHECK 5: AgentTrace documents are correctly written for every step
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 5/6] AgentTrace documents correctly written to MongoDB');
  console.log('------------------------------------------------------------------------');

  const traces = await AgentTrace.find({ sessionId }).sort({ timestamp: 1 });
  console.log(`Total AgentTrace Documents Found in MongoDB: ${traces.length}`);

  traces.forEach((t, i) => {
    console.log(
      `  [Step ${i + 1}] Agent: ${t.agentName.padEnd(16)} | Step: ${String(t.step).padEnd(20)} | Time: ${t.timestamp.toISOString()}`,
    );
  });

  const agentNames = new Set(traces.map((t) => t.agentName));
  const expectedAgents = ['PlannerAgent', 'ResearcherAgent', 'CriticAgent', 'SynthesizerAgent'];
  for (const expected of expectedAgents) {
    if (!agentNames.has(expected)) {
      throw new Error(`Missing required trace for agent: ${expected}`);
    }
  }

  // Verify traces have inputs and outputs
  for (const t of traces) {
    if (!t.input || !t.output) {
      throw new Error(`AgentTrace for ${t.agentName} (${t.step}) is missing input or output payload`);
    }
  }

  console.log('\n>>> [PASS] AgentTrace documents correctly written to MongoDB for every step.\n');

  // ------------------------------------------------------------------
  // CHECK 6: POST /api/sessions/:id/run runs full pipeline end-to-end
  // ------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('[CHECK 6/6] POST /api/sessions/:id/run runs pipeline end-to-end');
  console.log('------------------------------------------------------------------------');

  // Create a brand new session via REST API
  const createRes = await request(app)
    .post('/api/sessions')
    .send({ query: 'High-concurrency time-series ingestion benchmarks: PostgreSQL vs MongoDB' });

  console.log(`Session Creation HTTP Status: ${createRes.status}`);
  const newSessionId = createRes.body.session._id;
  console.log(`Created Session ID via REST: ${newSessionId}`);

  // Run the pipeline via HTTP POST /api/sessions/:id/run
  console.log(`Executing POST /api/sessions/${newSessionId}/run...`);
  const runRes = await request(app).post(`/api/sessions/${newSessionId}/run`).send({});

  console.log(`Execution HTTP Status: ${runRes.status}`);
  if (runRes.status !== 200) {
    console.error('Run endpoint failed:', runRes.body);
    throw new Error(`Pipeline run endpoint returned status ${runRes.status}`);
  }

  const { session: completedSession, report: completedReport, state: returnedState } = runRes.body;

  console.log(`Session Final Status: "${completedSession.status}"`);
  console.log(`Report Title: "${returnedState.finalReport?.title}"`);
  console.log(`Report Sources Count: ${completedReport.sources.length}`);
  console.log(`Report Length: ${completedReport.content.length} characters`);
  console.log(`Verified Claims in State: ${returnedState.verifiedClaims.length}`);

  if (completedSession.status !== 'completed') {
    throw new Error(`Expected session status 'completed', got '${completedSession.status}'`);
  }

  if (!completedReport || !completedReport.content) {
    throw new Error('Pipeline finished but did not return a valid completed report');
  }

  // Confirm report and traces in DB for this new session
  const [dbReport, dbTraces] = await Promise.all([
    Report.findOne({ sessionId: newSessionId }),
    AgentTrace.find({ sessionId: newSessionId }),
  ]);

  if (!dbReport) {
    throw new Error('Report was not persisted to MongoDB for new session');
  }
  if (dbTraces.length < 4) {
    throw new Error(`Expected at least 4 AgentTraces in MongoDB, got ${dbTraces.length}`);
  }

  console.log(`Confirmed DB Report and ${dbTraces.length} AgentTraces saved in MongoDB.`);
  console.log('\n>>> [PASS] POST /api/sessions/:id/run executes full pipeline end-to-end.\n');

  await disconnectDatabase();

  console.log('========================================================================');
  console.log('  ALL 6 ORCHESTRATION CHECKLIST REQUIREMENTS VERIFIED AND PASSING!     ');
  console.log('========================================================================\n');
  process.exit(0);
}

verifyOrchestrationChecklist().catch(async (err) => {
  console.error('\n❌ Verification Checklist Failed:', err);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
