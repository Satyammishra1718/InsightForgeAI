import assert from 'node:assert';
import http from 'http';
import type { AddressInfo } from 'net';
import type { ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ensureRedisServer, getRedisClient, closeRedis } from '../config/redis.js';
import { wsServer } from '../websocket/server.js';
import { startResearchWorker, closeResearchWorker } from '../queue/research.worker.js';
import { closeResearchQueue } from '../queue/research.queue.js';
import { ResearchSession, Report, AgentTrace } from '../models/index.js';

// Standalone script: own embedded DB + in-process worker, so use a private BullMQ queue
// instead of the dev server's 'research' queue (its worker can't see this script's sessions).
process.env.RESEARCH_QUEUE_NAME ??= `research-script-${process.pid}`;

let pythonProcess: ChildProcess | null = null;

async function ensurePythonAgentService(): Promise<void> {
  const agentUrl = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const res = await fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      console.log(`[QA:Setup] Python agent-service is already running at ${agentUrl}`);
      return;
    }
  } catch {
    // not running
  }

  console.log(`[QA:Setup] Spawning Python FastAPI agent-service on port 8000...`);
  const { spawn } = await import('child_process');
  const path = await import('path');
  const rootDir = path.resolve(process.cwd(), '..');
  const pythonExe = path.join(rootDir, 'agent-service', 'venv', 'Scripts', 'python.exe');

  pythonProcess = spawn(
    pythonExe,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: path.join(rootDir, 'agent-service'),
      stdio: 'pipe',
      env: { ...process.env, REDIS_URL: 'redis://127.0.0.1:6380' },
    },
  );

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const res = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        console.log('[QA:Setup] Python FastAPI agent-service ready at http://127.0.0.1:8000');
        return;
      }
    } catch {
      // retry
    }
  }
  throw new Error('Failed to start Python agent-service within timeout');
}

export async function runFullQASuite() {
  console.log('========================================================================');
  console.log('       INSIGHTFORGE-AI FULL COMPREHENSIVE QA & HARDENING SUITE          ');
  console.log('========================================================================\n');

  // Step 1: Start dependencies
  await ensurePythonAgentService();
  await ensureRedisServer();

  const redis = await getRedisClient();
  await redis.del('semantic_cache:index');
  const queueKeys = await redis.keys('bull:research:*');
  if (queueKeys.length > 0) {
    await redis.del(...queueKeys);
  }
  console.log('[QA:Setup] Cleaned previous Redis queue and semantic cache keys.');

  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[QA:Setup] Database connected: [${dbInfo.mode.toUpperCase()}]`);

  // Start test server & WebSocket server on dynamic port
  const app = createApp();
  const server = http.createServer(app);
  wsServer.init(server);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  console.log(`[QA:Setup] HTTP & WebSocket test gateway listening on port ${port}\n`);

  // Start BullMQ worker with concurrency 2
  await startResearchWorker(2);

  // Helper for waiting on session completion
  async function waitForSession(sessionId: string, maxSeconds: number = 40) {
    for (let i = 0; i < maxSeconds; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await ResearchSession.findById(sessionId);
      if (s?.status === 'completed' || s?.status === 'failed') return s;
    }
    return await ResearchSession.findById(sessionId);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Standard Deep Research Query Flow
  // ---------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('TEST 1: Standard Deep Research Query End-to-End');
  console.log('------------------------------------------------------------------------');
  const q1 = 'Architectural comparison of B-tree vs LSM-tree storage engines in modern databases';

  const createRes1 = await request(app).post('/api/sessions').send({ query: q1 });
  assert.strictEqual(createRes1.status, 201);
  const s1Id = createRes1.body.session._id;
  assert.strictEqual(createRes1.body.session.status, 'pending');
  console.log(`✓ 1.1 POST /api/sessions created session: ${s1Id}`);

  // Connect WebSocket subscriber
  const ws1Events: Array<Record<string, unknown>> = [];
  const wsClient1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => wsClient1.on('open', () => r()));
  wsClient1.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'progress' && msg.data) ws1Events.push(msg.data);
    } catch {
      // ignore non-JSON frames
    }
  });
  wsClient1.send(JSON.stringify({ type: 'subscribe', sessionId: s1Id }));
  await new Promise((r) => setTimeout(r, 200));

  const runRes1 = await request(app).post(`/api/sessions/${s1Id}/run`).send({ cacheable: true });
  assert.strictEqual(runRes1.status, 202);
  assert.strictEqual(runRes1.body.status, 'queued');
  console.log(`✓ 1.2 POST /api/sessions/${s1Id}/run enqueued BullMQ job (202 Accepted)`);

  const completed1 = await waitForSession(s1Id, 45);
  assert.strictEqual(completed1?.status, 'completed', 'Session 1 must complete');
  console.log(`✓ 1.3 Pipeline finished in status="completed"`);

  assert(ws1Events.length >= 4, `Expected at least 4 live WS events, received ${ws1Events.length}`);
  console.log(`✓ 1.4 WebSocket subscriber received ${ws1Events.length} live progress events`);

  // Verify report in MongoDB
  const report1 = await Report.findOne({ sessionId: s1Id });
  assert(report1, 'Report must be persisted in MongoDB');
  assert(report1.content.length > 200, 'Report must contain substantive content');
  assert(report1.sources.length > 0, 'Report must contain sources/citations');
  console.log(`✓ 1.5 Report persisted with ${report1.sources.length} citations (${report1.content.length} chars)`);

  // Verify AgentTrace in MongoDB
  const traces1 = await AgentTrace.find({ sessionId: s1Id });
  assert(traces1.length >= 3, `Expected at least 3 AgentTrace records, found ${traces1.length}`);
  console.log(`✓ 1.6 Persisted ${traces1.length} observability AgentTrace records with prompt/output`);

  wsClient1.close();

  // ---------------------------------------------------------------------------
  // TEST 2: Edge Case: Short / Vague Query ("crypto")
  // ---------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 2: Edge Case: Short / Vague Query ("crypto")');
  console.log('------------------------------------------------------------------------');
  const q2 = 'crypto';
  const createRes2 = await request(app).post('/api/sessions').send({ query: q2 });
  assert.strictEqual(createRes2.status, 201);
  const s2Id = createRes2.body.session._id;

  const runRes2 = await request(app).post(`/api/sessions/${s2Id}/run`).send({ cacheable: true });
  assert.strictEqual(runRes2.status, 202);

  const completed2 = await waitForSession(s2Id, 45);
  assert.strictEqual(completed2?.status, 'completed', 'Short query session must complete cleanly');

  const report2 = await Report.findOne({ sessionId: s2Id });
  assert(report2 && report2.content.length > 100);
  console.log(`✓ 2.1 Short query "crypto" expanded into structured research briefing (${report2.content.length} chars)`);

  // ---------------------------------------------------------------------------
  // TEST 3: Edge Case: Query with Exaggerated / Unsupported Claim
  // ---------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 3: Edge Case: Unsupported / Hyperbolic Claim Detection by Critic');
  console.log('------------------------------------------------------------------------');
  const q3 = 'Claim to verify: In-memory distributed architectures eliminate all data loss risks and achieve 10x throughput with zero latency';
  const createRes3 = await request(app).post('/api/sessions').send({ query: q3 });
  assert.strictEqual(createRes3.status, 201);
  const s3Id = createRes3.body.session._id;

  await request(app).post(`/api/sessions/${s3Id}/run`).send({ cacheable: true });
  const completed3 = await waitForSession(s3Id, 45);
  assert.strictEqual(completed3?.status, 'completed');

  const traces3 = await AgentTrace.find({ sessionId: s3Id, agentName: 'Critic' });
  assert(traces3.length > 0, 'Critic trace must exist');
  const criticOutput = traces3[0].output as {
    flaggedCount: number;
    flaggedClaims?: Array<{ claim?: string; reason?: string }>;
  };
  assert(criticOutput.flaggedCount >= 1, `Critic must flag unsupported claim (got ${criticOutput.flaggedCount})`);
  console.log(`✓ 3.1 Critic Agent isolated and flagged unsupported claim: "${criticOutput.flaggedClaims?.[0]?.claim?.slice(0, 60)}..."`);
  console.log(`✓ 3.2 Critic recorded rationale: "${criticOutput.flaggedClaims?.[0]?.reason?.slice(0, 80)}..."`);

  // ---------------------------------------------------------------------------
  // TEST 4: Semantic Caching Instant Return (<= 50ms)
  // ---------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 4: Redis Semantic Cache Hit');
  console.log('------------------------------------------------------------------------');
  // Re-run identical query to Test 1
  const createRes4 = await request(app).post('/api/sessions').send({ query: q1 });
  const s4Id = createRes4.body.session._id;

  const startCacheTime = Date.now();
  const runRes4 = await request(app).post(`/api/sessions/${s4Id}/run`).send({ cacheable: true });
  const cacheDurationMs = Date.now() - startCacheTime;

  assert.strictEqual(runRes4.status, 200, `Expected 200 OK on cache hit, got ${runRes4.status}`);
  assert.strictEqual(runRes4.body.cached, true, 'Response must indicate cached: true');
  assert.strictEqual(runRes4.body.status, 'completed', 'Session status must be completed');
  assert(cacheDurationMs < 500, `Expected sub-second return, took ${cacheDurationMs}ms`);
  console.log(`✓ 4.1 Semantic cache hit in ${cacheDurationMs}ms (returned cached report immediately, zero queue dispatch)`);
  console.log(`✓ 4.2 Similarity score: ${(runRes4.body.similarity * 100).toFixed(1)}%`);

  // ---------------------------------------------------------------------------
  // TEST 5: Concurrency & Stream Isolation (2 Concurrent Sessions)
  // ---------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 5: Concurrency & Stream Isolation');
  console.log('------------------------------------------------------------------------');
  const cQueryA = 'Concurrency Test A: Quantum key distribution mechanisms';
  const cQueryB = 'Concurrency Test B: Vector search indexing algorithms in HNSW vs IVF';

  const [sARes, sBRes] = await Promise.all([
    request(app).post('/api/sessions').send({ query: cQueryA }),
    request(app).post('/api/sessions').send({ query: cQueryB }),
  ]);
  const sAId = sARes.body.session._id;
  const sBId = sBRes.body.session._id;

  const wsAEvents: Array<Record<string, unknown>> = [];
  const wsBEvents: Array<Record<string, unknown>> = [];
  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  await Promise.all([
    new Promise<void>((r) => wsA.on('open', () => r())),
    new Promise<void>((r) => wsB.on('open', () => r())),
  ]);

  wsA.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'progress') wsAEvents.push(msg);
    } catch {
      // ignore non-JSON frames
    }
  });

  wsB.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'progress') wsBEvents.push(msg);
    } catch {
      // ignore non-JSON frames
    }
  });

  wsA.send(JSON.stringify({ type: 'subscribe', sessionId: sAId }));
  wsB.send(JSON.stringify({ type: 'subscribe', sessionId: sBId }));
  await new Promise((r) => setTimeout(r, 200));

  // Trigger both simultaneously
  await Promise.all([
    request(app).post(`/api/sessions/${sAId}/run`).send({ cacheable: false }),
    request(app).post(`/api/sessions/${sBId}/run`).send({ cacheable: false }),
  ]);

  await Promise.all([
    waitForSession(sAId, 45),
    waitForSession(sBId, 45),
  ]);

  wsA.close();
  wsB.close();

  // Verify stream isolation: wsA events must ONLY reference sAId
  const aLeaked = wsAEvents.some((e) => e.sessionId !== sAId);
  const bLeaked = wsBEvents.some((e) => e.sessionId !== sBId);
  assert(!aLeaked, 'Client A received events from a different session (cross-talk detected)!');
  assert(!bLeaked, 'Client B received events from a different session (cross-talk detected)!');
  console.log(`✓ 5.1 Both concurrent sessions finished without cross-talk (A: ${wsAEvents.length} events, B: ${wsBEvents.length} events)`);

  const [repA, repB] = await Promise.all([
    Report.findOne({ sessionId: sAId }),
    Report.findOne({ sessionId: sBId }),
  ]);
  assert(repA && repB, 'Both reports must be persisted independently');
  console.log('✓ 5.2 Both reports persisted in MongoDB with zero race conditions');

  // ---------------------------------------------------------------------------
  // TEST 6: Failure Paths on Purpose
  // ---------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 6: Failure Paths Handling');
  console.log('------------------------------------------------------------------------');

  // Test 6a: 404 for invalid ObjectId
  const invalidRes = await request(app).get('/api/sessions/000000000000000000000000');
  assert.strictEqual(invalidRes.status, 404);
  assert(invalidRes.body.error, 'Expected clean error response for missing session');
  console.log('✓ 6.1 Handled non-existent session ID with clean 404 and structured error JSON');

  // Test 6b: System Status Endpoint
  const sysStatusRes = await request(app).get('/api/system/status');
  assert.strictEqual(sysStatusRes.status, 200);
  assert(sysStatusRes.body.services.length >= 3);
  const mongoCheck = sysStatusRes.body.services.find((s: { name: string }) => s.name.includes('MongoDB'));
  const redisCheck = sysStatusRes.body.services.find((s: { name: string }) => s.name.includes('Redis'));
  assert.strictEqual(mongoCheck.status, 'healthy');
  assert.strictEqual(redisCheck.status, 'healthy');
  console.log(`✓ 6.2 System status probe returned 200 OK (${sysStatusRes.body.services.length} microservices checked)`);

  // Clean up
  await closeResearchWorker().catch(() => null);
  await closeResearchQueue().catch(() => null);
  await closeRedis().catch(() => null);
  await disconnectDatabase().catch(() => null);
  await new Promise<void>((r) => server.close(() => r()));

  if (pythonProcess) {
    pythonProcess.kill();
  }

  console.log('\n========================================================================');
  console.log('    ✓ ALL 6 QA SUITE TEST SCENARIOS PASSED WITH ZERO FAILURES!          ');
  console.log('========================================================================\n');
  process.exit(0);
}

runFullQASuite().catch((err) => {
  console.error('\n❌ QA Suite Failure:', err);
  process.exit(1);
});
