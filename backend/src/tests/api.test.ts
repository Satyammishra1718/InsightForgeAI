import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

export async function runApiTests() {
  console.log('\n--- Running API Integration Tests ---');

  await connectDatabase();
  const app = createApp();

  // Test 1: GET /api/health
  const healthRes = await request(app).get('/api/health');
  assert.strictEqual(healthRes.status, 200, `Expected 200, got ${healthRes.status}`);
  assert.strictEqual(healthRes.body.status, 'ok', 'Health status should be ok');
  console.log('✓ API: GET /api/health returned 200 OK');

  // Test 2: GET /api/system/status
  const systemRes = await request(app).get('/api/system/status');
  assert.strictEqual(systemRes.status, 200, `Expected 200, got ${systemRes.status}`);
  assert(Array.isArray(systemRes.body.services), 'Services should be an array');
  assert(systemRes.body.services.length >= 3, 'Should check at least 3 services');
  console.log(`✓ API: GET /api/system/status returned 200 OK with ${systemRes.body.services.length} microservices checked`);

  // Test 3: POST /api/sessions
  const sessionRes = await request(app)
    .post('/api/sessions')
    .send({ query: 'Automated test research query on transformer attention layers' });
  assert.strictEqual(sessionRes.status, 201, `Expected 201, got ${sessionRes.status}`);
  assert(sessionRes.body.session, 'Expected session object in response');
  assert.strictEqual(sessionRes.body.session.status, 'pending', 'Initial status should be pending');
  assert(sessionRes.body.session._id, 'Session should have an _id');
  console.log(`✓ API: POST /api/sessions successfully created session ${sessionRes.body.session._id}`);

  // Test 4: GET /api/sessions/:id
  const getSessionRes = await request(app).get(`/api/sessions/${sessionRes.body.session._id}`);
  assert.strictEqual(getSessionRes.status, 200, `Expected 200, got ${getSessionRes.status}`);
  assert.strictEqual(getSessionRes.body.session._id, sessionRes.body.session._id);
  console.log('✓ API: GET /api/sessions/:id retrieved session details successfully');

  await disconnectDatabase();
  return true;
}
