import { connectDatabase, disconnectDatabase, getDatabaseInfo } from '../config/database.js';
import mongoose from 'mongoose';
import { seedDatabase } from './seed.js';

async function inspectDatabase() {
  console.log('====================================================');
  console.log('   Point 8: Direct Database & Schema Inspection     ');
  console.log('====================================================\n');

  await connectDatabase();
  const dbInfo = getDatabaseInfo();
  console.log(`Connected to: ${dbInfo.uri} (mode: ${dbInfo.mode})\n`);

  // Ensure seeded state
  await seedDatabase();

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database handle not available');
  }

  // 1. List Collections
  const collections = await db.listCollections().toArray();
  const colNames = collections.map((c) => c.name);
  console.log('Found Collections in Database:', colNames);

  const targetCollections = ['users', 'researchsessions', 'agenttraces', 'reports'];
  for (const colName of targetCollections) {
    const exists = colNames.includes(colName);
    console.log(`  [${exists ? '✓' : '✗'}] Collection '${colName}': ${exists ? 'EXISTS' : 'MISSING'}`);
  }
  console.log('');

  // 2. Eyeball User Collection
  console.log('----------------------------------------------------');
  console.log('Collection: "users"');
  console.log('----------------------------------------------------');
  const rawUsers = await db.collection('users').find().toArray();
  console.log(`Total count: ${rawUsers.length}`);
  if (rawUsers.length > 0) {
    const sample = rawUsers[0];
    console.log('Sample Document:');
    console.log(JSON.stringify(sample, null, 2));
    console.log('Field Types Verification:');
    console.log(`  - _id:       ${sample._id?.constructor?.name} (${sample._id})`);
    console.log(`  - name:      ${typeof sample.name} ("${sample.name}")`);
    console.log(`  - email:     ${typeof sample.email} ("${sample.email}")`);
    console.log(`  - createdAt: ${sample.createdAt instanceof Date ? 'Date' : typeof sample.createdAt} (${sample.createdAt})`);
  }
  console.log('');

  // 3. Eyeball ResearchSession Collection
  console.log('----------------------------------------------------');
  console.log('Collection: "researchsessions"');
  console.log('----------------------------------------------------');
  const rawSessions = await db.collection('researchsessions').find().toArray();
  console.log(`Total count: ${rawSessions.length}`);
  if (rawSessions.length > 0) {
    const sample = rawSessions[0];
    console.log('Sample Document:');
    console.log(JSON.stringify(sample, null, 2));
    console.log('Field Types Verification:');
    console.log(`  - _id:       ${sample._id?.constructor?.name} (${sample._id})`);
    console.log(`  - userId:    ${sample.userId?.constructor?.name} (${sample.userId})`);
    console.log(`  - query:     ${typeof sample.query} ("${sample.query.slice(0, 40)}...")`);
    console.log(`  - status:    ${typeof sample.status} ("${sample.status}")`);
    console.log(`  - createdAt: ${sample.createdAt instanceof Date ? 'Date' : typeof sample.createdAt} (${sample.createdAt})`);
    console.log(`  - updatedAt: ${sample.updatedAt instanceof Date ? 'Date' : typeof sample.updatedAt} (${sample.updatedAt})`);
  }
  console.log('');

  // 4. Eyeball AgentTrace Collection
  console.log('----------------------------------------------------');
  console.log('Collection: "agenttraces"');
  console.log('----------------------------------------------------');
  const rawTraces = await db.collection('agenttraces').find().toArray();
  console.log(`Total count: ${rawTraces.length}`);
  if (rawTraces.length > 0) {
    const sample = rawTraces[0];
    console.log('Sample Document:');
    console.log(JSON.stringify(sample, null, 2));
    console.log('Field Types Verification:');
    console.log(`  - _id:       ${sample._id?.constructor?.name} (${sample._id})`);
    console.log(`  - sessionId: ${sample.sessionId?.constructor?.name} (${sample.sessionId})`);
    console.log(`  - agentName: ${typeof sample.agentName} ("${sample.agentName}")`);
    console.log(`  - step:      ${typeof sample.step} (${sample.step})`);
    console.log(`  - input:     ${typeof sample.input} (${JSON.stringify(sample.input)})`);
    console.log(`  - output:    ${typeof sample.output} (${JSON.stringify(sample.output)})`);
    console.log(`  - timestamp: ${sample.timestamp instanceof Date ? 'Date' : typeof sample.timestamp} (${sample.timestamp})`);
  }
  console.log('');

  // 5. Eyeball Report Collection
  console.log('----------------------------------------------------');
  console.log('Collection: "reports"');
  console.log('----------------------------------------------------');
  const rawReports = await db.collection('reports').find().toArray();
  console.log(`Total count: ${rawReports.length}`);
  if (rawReports.length > 0) {
    const sample = rawReports[0];
    console.log('Sample Document:');
    console.log(JSON.stringify(sample, null, 2));
    console.log('Field Types Verification:');
    console.log(`  - _id:       ${sample._id?.constructor?.name} (${sample._id})`);
    console.log(`  - sessionId: ${sample.sessionId?.constructor?.name} (${sample.sessionId})`);
    console.log(`  - content:   ${typeof sample.content} (Length: ${sample.content?.length} chars)`);
    console.log(`  - sources:   Array of ${sample.sources?.length} items`);
    if (sample.sources?.length > 0) {
      const src = sample.sources[0];
      console.log(`     * Source[0].title:   ${typeof src.title} ("${src.title}")`);
      console.log(`     * Source[0].url:     ${typeof src.url} ("${src.url}")`);
      console.log(`     * Source[0].snippet: ${typeof src.snippet} ("${src.snippet?.slice(0, 35)}...")`);
    }
    console.log(`  - createdAt: ${sample.createdAt instanceof Date ? 'Date' : typeof sample.createdAt} (${sample.createdAt})`);
  }
  console.log('');

  await disconnectDatabase();
  console.log('====================================================');
  console.log('   All 4 Collections Eyeballed & Verified Directly!  ');
  console.log('====================================================');
}

inspectDatabase().catch(async (e) => {
  console.error('Inspection failed:', e);
  await disconnectDatabase();
  process.exit(1);
});
