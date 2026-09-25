import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { seedDatabase } from './seed.js';

let mongod: MongoMemoryServer | null = null;

async function runTests() {
  console.log('====================================================');
  console.log('   InsightForge-AI Data Layer End-to-End Test Suite  ');
  console.log('====================================================\n');

  let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/insightforge';
  let usingMemoryServer = false;

  try {
    console.log(`[Test] Attempting connection to configured MONGODB_URI: ${mongoUri}...`);
    await connectDatabase(mongoUri);
    console.log('[Test] Connected to configured MongoDB instance.\n');
  } catch {
    console.log(
      '[Test] Local MongoDB not reachable. Spinning up MongoMemoryServer for verification...',
    );
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    usingMemoryServer = true;
    await connectDatabase(mongoUri);
    console.log(`[Test] Connected to in-memory MongoDB at ${mongoUri}\n`);
  }

  // 1. Seed database with initial records
  console.log('--- Step 1: Seeding database ---');
  const seedResult = await seedDatabase(mongoUri);
  const sampleSessionId = seedResult.sessions[0]._id.toString();
  console.log(`Using sample session for tests: ${sampleSessionId}\n`);

  const app = createApp();

  // Test 1: GET /api/health
  console.log('--- Test 1: GET /api/health ---');
  const healthRes = await request(app).get('/api/health');
  console.log(`Status: ${healthRes.status}`);
  console.log('Response:', JSON.stringify(healthRes.body, null, 2));
  if (
    healthRes.status !== 200 ||
    healthRes.body.status !== 'ok' ||
    healthRes.body.database !== 'connected'
  ) {
    throw new Error('Health check verification failed');
  }
  console.log('✓ Health check passed!\n');

  // Test 2: GET /api/sessions (Pagination & list)
  console.log('--- Test 2: GET /api/sessions (Pagination & Sorting) ---');
  const listRes = await request(app).get('/api/sessions?page=1&limit=2');
  console.log(`Status: ${listRes.status}`);
  console.log('Pagination info:', JSON.stringify(listRes.body.pagination, null, 2));
  console.log(`Returned sessions count: ${listRes.body.sessions.length}`);
  if (
    listRes.status !== 200 ||
    listRes.body.sessions.length !== 2 ||
    listRes.body.pagination.total < 4
  ) {
    throw new Error('List sessions pagination failed');
  }
  console.log('✓ GET /api/sessions passed!\n');

  // Test 3: GET /api/sessions/:id (Session with report & agentTraces)
  console.log(`--- Test 3: GET /api/sessions/${sampleSessionId} (With Report & Traces) ---`);
  const getOneRes = await request(app).get(`/api/sessions/${sampleSessionId}`);
  console.log(`Status: ${getOneRes.status}`);
  console.log('Session Title/Query:', getOneRes.body.session.query);
  console.log('Report Title:', getOneRes.body.session.report?.content?.split('\n')[0]);
  console.log('Report Sources Count:', getOneRes.body.session.report?.sources?.length);
  console.log('Agent Traces Count:', getOneRes.body.session.agentTraces?.length);
  if (
    getOneRes.status !== 200 ||
    !getOneRes.body.session.report ||
    getOneRes.body.session.agentTraces.length === 0
  ) {
    throw new Error('Get session by ID with relations failed');
  }
  console.log('✓ GET /api/sessions/:id passed!\n');

  // Test 4: POST /api/sessions (Create new session)
  console.log('--- Test 4: POST /api/sessions (Create New Session) ---');
  const createPayload = {
    query: 'Investigation into neuromorphic visual cortex processing algorithms',
  };
  const createRes = await request(app).post('/api/sessions').send(createPayload);
  console.log(`Status: ${createRes.status}`);
  console.log('Created Session:', JSON.stringify(createRes.body.session, null, 2));
  if (
    createRes.status !== 201 ||
    createRes.body.session.query !== createPayload.query ||
    createRes.body.session.status !== 'pending'
  ) {
    throw new Error('Create session verification failed');
  }
  const newlyCreatedId = createRes.body.session._id;
  console.log('✓ POST /api/sessions passed!\n');

  // Test 5: Validation Error test on POST /api/sessions (Empty query)
  console.log('--- Test 5: POST /api/sessions Validation (Empty Query) ---');
  const invalidCreateRes = await request(app).post('/api/sessions').send({ query: '   ' });
  console.log(`Status: ${invalidCreateRes.status}`);
  console.log('Error Response:', JSON.stringify(invalidCreateRes.body, null, 2));
  if (
    invalidCreateRes.status !== 400 ||
    !invalidCreateRes.body.error ||
    invalidCreateRes.body.error.code !== 'VALIDATION_ERROR'
  ) {
    throw new Error('Validation error response shape mismatch');
  }
  console.log('✓ Input validation test passed!\n');

  // Test 6: DELETE /api/sessions/:id
  console.log(`--- Test 6: DELETE /api/sessions/${newlyCreatedId} ---`);
  const deleteRes = await request(app).delete(`/api/sessions/${newlyCreatedId}`);
  console.log(`Status: ${deleteRes.status}`);
  console.log('Response:', JSON.stringify(deleteRes.body, null, 2));
  if (deleteRes.status !== 200 || deleteRes.body.id !== newlyCreatedId) {
    throw new Error('Delete session failed');
  }
  console.log('✓ DELETE /api/sessions/:id passed!\n');

  // Test 7: GET deleted session -> 404 with standard error shape
  console.log(`--- Test 7: GET /api/sessions/${newlyCreatedId} (Confirm 404) ---`);
  const notFoundRes = await request(app).get(`/api/sessions/${newlyCreatedId}`);
  console.log(`Status: ${notFoundRes.status}`);
  console.log('Error Response:', JSON.stringify(notFoundRes.body, null, 2));
  if (notFoundRes.status !== 404 || notFoundRes.body.error?.code !== 'NOT_FOUND') {
    throw new Error('Not found error response shape mismatch');
  }
  console.log('✓ 404 Centralized error handling passed!\n');

  // Cleanup
  await disconnectDatabase();
  if (mongod) {
    await mongod.stop();
  }

  console.log('====================================================');
  console.log(
    `All Data Layer Endpoints Verified Successfully! ${usingMemoryServer ? '(via MongoMemoryServer)' : ''}`,
  );
  console.log('====================================================');
}

runTests().catch(async (error) => {
  console.error('[Test Failed]:', error);
  await disconnectDatabase();
  if (mongod) {
    await mongod.stop();
  }
  process.exit(1);
});
