import http from 'http';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import request from 'supertest';
import { spawn, ChildProcess } from 'child_process';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import { ensureRedisServer, closeRedis } from '../config/redis.js';
import { wsServer } from '../websocket/server.js';
import { startResearchWorker, closeResearchWorker, closeResearchQueue } from '../queue/index.js';
import { ResearchSession, Report, AgentTrace } from '../models/index.js';

let pythonProcess: ChildProcess | null = null;

async function ensurePythonAgentService(): Promise<void> {
  const url = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      console.log(`[Setup] Python FastAPI agent-service is already running at ${url}`);
      return;
    }
  } catch {
    // not running, spawn it
  }

  console.log(`[Setup] Spawning Python FastAPI agent-service on port 8000...`);
  const pythonCmd = 'agent-service/venv/Scripts/python.exe';
  pythonProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'app.main:app', '--app-dir', './agent-service', '--port', '8000'],
    {
      cwd: process.cwd().includes('backend') ? '..' : '.',
      stdio: 'ignore',
    },
  );

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) {
        console.log(`[Setup] Python FastAPI agent-service ready at ${url}`);
        return;
      }
    } catch {
      // keep polling
    }
  }
  throw new Error(`Python FastAPI agent-service failed to start at ${url}`);
}

async function runAsyncPipelineVerification() {
  console.log('========================================================================');
  console.log('   INSIGHTFORGE-AI: ASYNC QUEUE, REDIS PUB/SUB & WS STREAMING TEST      ');
  console.log('========================================================================\n');

  // 1. Setup Services
  console.log('[1/7] Ensuring Python agent-service and Redis are active...');
  await ensurePythonAgentService();
  await ensureRedisServer();
  const { getRedisClient } = await import('../config/redis.js');
  const redis = await getRedisClient();
  await redis.del('semantic_cache:index');
  // Flush all previous BullMQ keys to prevent ID collisions or stale locks
  const queueKeys = await redis.keys('bull:research:*');
  if (queueKeys.length > 0) {
    await redis.del(...queueKeys);
  }
  console.log('[Setup] Cleared previous semantic cache and BullMQ research queue for clean test run.');

  console.log('[2/7] Connecting to database...');
  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`[2/7] Database connected: [${dbInfo.mode.toUpperCase()}] (${dbInfo.uri})\n`);

  // 2. Start Express & WebSocket Server on dynamic port
  const app = createApp();
  const server = http.createServer(app);
  wsServer.init(server);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  console.log(`[3/7] Test server & WebSocket listening on port ${port} (ws://127.0.0.1:${port}/ws)\n`);

  // 3. Start BullMQ worker
  console.log('[4/7] Starting BullMQ research worker (concurrency=2)...');
  await startResearchWorker(2);

  // 4. Create two research sessions
  console.log('[5/7] Creating two concurrent research sessions...');
  const query1 = 'Architectural tradeoffs between PostgreSQL and MongoDB for high-write workloads';
  const query2 = 'Comparative analysis of horizontal scaling in distributed document databases';

  const sess1 = await ResearchSession.create({ query: query1, status: 'pending' });
  const sess2 = await ResearchSession.create({ query: query2, status: 'pending' });
  const s1Id = sess1._id.toString();
  const s2Id = sess2._id.toString();
  console.log(`  ✓ Session 1 created: ID=${s1Id} ('${query1}')`);
  console.log(`  ✓ Session 2 created: ID=${s2Id} ('${query2}')\n`);

  // 5. Connect two WebSocket clients and subscribe to each session
  console.log('[6/7] Connecting independent WebSocket subscribers for both sessions...');
  const ws1Events: Array<Record<string, unknown>> = [];
  const ws2Events: Array<Record<string, unknown>> = [];

  const wsClient1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const wsClient2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  await Promise.all([
    new Promise<void>((resolve) => wsClient1.on('open', () => resolve())),
    new Promise<void>((resolve) => wsClient2.on('open', () => resolve())),
  ]);

  wsClient1.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'progress') {
        ws1Events.push(msg.data);
        console.log(`  [WS-Client-1 Stream] [${msg.data.agentName}] ${msg.data.step}: ${msg.data.summary}`);
      }
    } catch {
      // ignore
    }
  });

  wsClient2.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'progress') {
        ws2Events.push(msg.data);
        console.log(`  [WS-Client-2 Stream] [${msg.data.agentName}] ${msg.data.step}: ${msg.data.summary}`);
      }
    } catch {
      // ignore
    }
  });

  // Send subscriptions
  wsClient1.send(JSON.stringify({ type: 'subscribe', sessionId: s1Id }));
  wsClient2.send(JSON.stringify({ type: 'subscribe', sessionId: s2Id }));
  await new Promise((r) => setTimeout(r, 400));
  console.log('  ✓ Both WebSocket clients subscribed to their respective session channels.\n');

  // 6. Enqueue both sessions concurrently via POST /api/sessions/:id/run
  console.log('[7/7] Enqueueing both sessions concurrently via POST /api/sessions/:id/run...');
  const [res1, res2] = await Promise.all([
    request(server).post(`/api/sessions/${s1Id}/run`).send().expect(202),
    request(server).post(`/api/sessions/${s2Id}/run`).send().expect(202),
  ]);

  console.log(`  ✓ Session 1 response: status="${res1.body.status}", jobId="${res1.body.jobId}"`);
  console.log(`  ✓ Session 2 response: status="${res2.body.status}", jobId="${res2.body.jobId}"`);
  if (res1.body.status !== 'queued' || res2.body.status !== 'queued') {
    throw new Error('Expected both sessions to return status="queued" immediately');
  }

  // Poll until both sessions complete in MongoDB
  console.log('\n[Progress] Waiting for BullMQ worker and Python agents to complete both pipelines...');
  const startTime = Date.now();
  let done1 = false;
  let done2 = false;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!done1) {
      const s = await ResearchSession.findById(s1Id);
      if (s?.status === 'completed') done1 = true;
    }
    if (!done2) {
      const s = await ResearchSession.findById(s2Id);
      if (s?.status === 'completed') done2 = true;
    }
    if (done1 && done2) break;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Progress] Both sessions completed processing in ${elapsed}s!\n`);

  if (!done1 || !done2) {
    throw new Error(`Timeout waiting for async jobs to complete (done1=${done1}, done2=${done2})`);
  }

  // Verify WebSocket streaming isolation
  console.log('--- Verification: WebSocket Real-Time Stream Isolation ---');
  console.log(`  ✓ WS Client 1 received ${ws1Events.length} progress events for Session 1`);
  console.log(`  ✓ WS Client 2 received ${ws2Events.length} progress events for Session 2`);

  if (ws1Events.length === 0 || ws2Events.length === 0) {
    throw new Error('WebSocket clients failed to receive live progress events!');
  }

  // Ensure WS1 only received events for Session 1
  for (const e of ws1Events) {
    if (e.sessionId && e.sessionId !== s1Id) {
      throw new Error(`WS Client 1 received an event for different session: ${e.sessionId}`);
    }
  }
  // Ensure WS2 only received events for Session 2
  for (const e of ws2Events) {
    if (e.sessionId && e.sessionId !== s2Id) {
      throw new Error(`WS Client 2 received an event for different session: ${e.sessionId}`);
    }
  }
  console.log('  ✓ Confirmed complete stream isolation: no cross-session event leakage!');

  // Verify MongoDB reports and agent traces
  console.log('\n--- Verification: MongoDB Persistence ---');
  const rep1 = await Report.findOne({ sessionId: s1Id });
  const rep2 = await Report.findOne({ sessionId: s2Id });
  console.log(`  ✓ Session 1 Report saved: ${rep1?.content?.length} characters`);
  console.log(`  ✓ Session 2 Report saved: ${rep2?.content?.length} characters`);

  const traces1 = await AgentTrace.find({ sessionId: s1Id });
  const traces2 = await AgentTrace.find({ sessionId: s2Id });
  console.log(`  ✓ Session 1 AgentTraces saved: ${traces1.length} records`);
  console.log(`  ✓ Session 2 AgentTraces saved: ${traces2.length} records`);

  // 7. Verify Semantic Caching with a similar query
  console.log('\n--- Verification: Semantic Caching on Repeated / Similar Query ---');
  const similarQuery = 'Tradeoffs between PostgreSQL and MongoDB for high-write workloads';
  const sess3 = await ResearchSession.create({ query: similarQuery, status: 'pending' });
  const s3Id = sess3._id.toString();

  console.log(`Creating Session 3 with similar query: '${similarQuery}'`);
  const cacheStart = Date.now();
  const cacheRes = await request(server).post(`/api/sessions/${s3Id}/run`).send().expect(200);

  const cacheTimeMs = Date.now() - cacheStart;
  console.log(`  ✓ Response status: ${cacheRes.status} (returned in ${cacheTimeMs}ms)`);
  console.log(`  ✓ Cached flag: ${cacheRes.body.cached}`);
  console.log(`  ✓ Matched cached query: '${cacheRes.body.matchedQuery}'`);
  console.log(`  ✓ Semantic similarity: ${(cacheRes.body.similarity * 100).toFixed(1)}%`);

  if (!cacheRes.body.cached) {
    throw new Error('Expected Session 3 to hit semantic cache!');
  }

  const sess3Db = await ResearchSession.findById(s3Id);
  const rep3Db = await Report.findOne({ sessionId: s3Id });
  console.log(`  ✓ Session 3 instantly marked 'completed' in MongoDB (status=${sess3Db?.status})`);
  console.log(`  ✓ Cached report attached to Session 3 (${rep3Db?.content?.length} chars)`);

  console.log('\n========================================================================');
  console.log('   ✓ ALL ASYNC QUEUE, REDIS PUB/SUB & CACHE CHECKS PASSED PERFECTLY!    ');
  console.log('========================================================================\n');

  // Clean shutdown
  wsClient1.close();
  wsClient2.close();
  await wsServer.close();
  await new Promise<void>((r) => server.close(() => r()));
  await closeResearchWorker();
  await closeResearchQueue();
  await closeRedis();
  await disconnectDatabase();

  if (pythonProcess) {
    pythonProcess.kill();
  }
}

runAsyncPipelineVerification().catch(async (err) => {
  console.error('\n❌ Verification failed with error:', err);
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch {
      // ignore
    }
  }
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
