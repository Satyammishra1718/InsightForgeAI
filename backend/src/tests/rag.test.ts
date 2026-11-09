import assert from 'node:assert';
import { chunkText } from '../rag/chunker.js';

export async function runRagTests() {
  console.log('\n--- Running RAG Unit Tests ---');

  // Test 1: Tokenizer-aware chunking
  const sampleText = `
    Quantum computing leverages the principles of quantum mechanics, specifically superposition and entanglement.
    Superposition allows a quantum bit, or qubit, to exist simultaneously in combinations of 0 and 1 states.
    Entanglement links qubits such that the quantum state of one instantaneously affects another regardless of spatial separation.
    Shor's algorithm poses a cryptographic threat to RSA and ECC key exchange mechanisms.
    Post-quantum cryptography seeks lattice-based mathematical structures that resist quantum Shor factoring attacks.
  `.repeat(15); // Expand text to require multiple chunks

  const chunks = chunkText(sampleText, {
    targetTokens: 100,
    overlapTokens: 20,
    source: 'quantum_paper.pdf',
    sourceType: 'pdf',
    title: 'Quantum Overview',
    sessionId: 'test_session_123',
  });

  assert(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);
  assert.strictEqual(chunks[0].metadata.source, 'quantum_paper.pdf');
  assert.strictEqual(chunks[0].metadata.sourceType, 'pdf');
  assert.strictEqual(chunks[0].sessionId, 'test_session_123');
  assert(chunks[0].tokens <= 100, `Chunk 0 tokens exceeded targetTokens (got ${chunks[0].tokens})`);
  assert(chunks[0].metadata.totalChunks === chunks.length, 'Total chunks metadata matches');

  console.log(`✓ RAG Chunker: generated ${chunks.length} overlapping chunks successfully with correct metadata`);

  // Test 2: Edge case - empty text
  const emptyChunks = chunkText('', {
    source: 'empty.txt',
    sourceType: 'text',
    sessionId: 'test_session_empty',
  });
  assert.strictEqual(emptyChunks.length, 0, 'Empty string produces 0 chunks');
  console.log('✓ RAG Chunker: handled empty document edge-case');

  // Test 3: Short text fits in single chunk
  const singleChunk = chunkText('Brief quantum paragraph.', {
    targetTokens: 200,
    overlapTokens: 20,
    source: 'short.txt',
    sourceType: 'text',
    sessionId: 'test_session_short',
  });
  assert.strictEqual(singleChunk.length, 1, 'Short text produces 1 chunk');
  assert.strictEqual(singleChunk[0].metadata.chunkIndex, 0);
  console.log('✓ RAG Chunker: short document fits cleanly into 1 chunk');

  return true;
}
