import { runRagTests } from './rag.test.js';
import { runApiTests } from './api.test.js';

async function main() {
  console.log('=============================================');
  console.log('  InsightForge-AI Backend Test Suite Runner  ');
  console.log('=============================================');

  try {
    await runRagTests();
    await runApiTests();

    console.log('\n=============================================');
    console.log('  ALL BACKEND TESTS PASSED SUCCESSFULLY!    ');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Backend test failed:', err);
    process.exit(1);
  }
}

main();
