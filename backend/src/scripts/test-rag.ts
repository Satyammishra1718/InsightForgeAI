import {
  chunkText,
  EmbeddingService,
  vectorStore,
  IngestionPipeline,
  retrieveContext,
} from '../rag/index.js';

function createSamplePdfBuffer(lines: string[]): Buffer {
  const contentStream = lines
    .map((line, idx) => `BT /F1 10 Tf 50 ${720 - idx * 25} Td (${line.replace(/[()]/g, '')}) Tj ET`)
    .join('\n');

  const streamLen = contentStream.length;
  const pdfString = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamLen} >> stream
${contentStream}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000261 00000 n 
0000000350 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;

  return Buffer.from(pdfString, 'utf-8');
}

async function runRagTests() {
  console.log('====================================================');
  console.log('    InsightForge-AI Standalone RAG Module Test     ');
  console.log('====================================================\n');

  const testSessionId = 'session_test_rag_pipeline_' + Date.now();

  // ------------------------------------------------------------------
  // 1. Test Tokenizer-Aware Document Chunking
  // ------------------------------------------------------------------
  console.log('--- Test 1: Tokenizer-Aware Document Chunking ---');
  const sampleLongText = Array.from({ length: 15 }, (_, i) =>
    `Paragraph ${i + 1}: Topological quantum error correction relies on stabilizer measurements across two-dimensional qubit arrays. ` +
    `Surface codes provide fault-tolerance thresholds near 1 percent under depolarizing noise models. ` +
    `Planar lattice surgery enables multi-qubit Pauli measurements without physical braid routing. ` +
    `Hardware implementations using superconducting transmons and neutral atom optical tweezers demonstrate logical lifetime enhancements.`
  ).join('\n\n');

  const chunks = chunkText(sampleLongText, {
    sessionId: testSessionId,
    source: 'sample_quantum_overview.txt',
    sourceType: 'text',
    targetTokens: 100, // smaller target to test multi-chunking & overlap
    overlapTokens: 20,
  });

  console.log(`Generated ${chunks.length} overlapping chunks from long text.`);
  console.log(`Chunk 0 Tokens: ${chunks[0].tokens}`);
  console.log(`Chunk 1 Tokens: ${chunks[1].tokens}`);
  console.log(`Chunk 0 Preview: "${chunks[0].text.slice(0, 80)}..."`);
  console.log(`Chunk 1 Preview: "${chunks[1].text.slice(0, 80)}..."`);

  if (chunks.length < 2 || chunks[0].tokens === 0) {
    throw new Error('Chunking test failed: expected multiple tokenizer-aware chunks');
  }
  console.log('✓ Tokenizer-aware chunking passed!\n');

  // ------------------------------------------------------------------
  // 2. Test Batched Embedding Service
  // ------------------------------------------------------------------
  console.log('--- Test 2: Batched Embedding Generation ---');
  const testTexts = [
    'Superconducting qubits with transmon architectures',
    'Neutral atom quantum processors with optical tweezers',
    'Trapped ion systems using laser cooling techniques',
  ];
  const embeddings = await EmbeddingService.embedBatch(testTexts);
  console.log(`Generated ${embeddings.length} embeddings.`);
  console.log(`Embedding dimensions: ${embeddings[0].length} (expected 1536)`);

  if (embeddings.length !== 3 || embeddings[0].length !== 1536) {
    throw new Error('Embedding service test failed: unexpected dimensions or count');
  }
  console.log('✓ Embedding generation passed!\n');

  // ------------------------------------------------------------------
  // 3. Test PDF Ingestion Pipeline
  // ------------------------------------------------------------------
  console.log('--- Test 3: PDF Document Ingestion ---');
  const pdfLines = [
    'Fault-Tolerant Surface Code Architecture for Deep Circuits',
    'Executive Summary: Surface code error correction requires approximately 1000 physical qubits per logical qubit.',
    'Lattice surgery enables transversal CNOT and measurement operations by merging and splitting planar boundaries.',
    'Syndrome extraction cycles must execute within the coherence time of physical superconducting transmons.',
    'Decoding algorithms including Minimum Weight Perfect Matching and Union Find process syndrome graphs in real time.',
  ];
  const pdfBuffer = createSamplePdfBuffer(pdfLines);

  const pdfResult = await IngestionPipeline.ingestPdf(
    testSessionId,
    pdfBuffer,
    'Surface_Code_Architecture_2026.pdf',
  );

  console.log(`PDF Ingested: ${pdfResult.source}`);
  console.log(`Chunks created: ${pdfResult.chunksCount}`);
  console.log(`Total tokens: ${pdfResult.totalTokens}`);

  if (pdfResult.chunksCount === 0 || pdfResult.totalTokens === 0) {
    throw new Error('PDF ingestion failed to generate chunks or tokens');
  }
  console.log('✓ PDF Ingestion pipeline passed!\n');

  // ------------------------------------------------------------------
  // 4. Test Web Search Snippets & Text Ingestion
  // ------------------------------------------------------------------
  console.log('--- Test 4: Web Search Snippets Ingestion ---');
  const sampleSnippets = [
    {
      title: 'Neutral Atom Optical Tweezer Breakthroughs - Nature 2026',
      url: 'https://nature.com/articles/neutral-atoms-tweezer-shuttling',
      snippet:
        'Researchers demonstrate dynamic 2D shuttling of neutral rubidium atoms in optical tweezer arrays. ' +
        'Rydberg blockade allows two-qubit entangling gates with 99.5 percent fidelity and long ground-state coherence.',
    },
    {
      title: 'State-Space Models (Mamba) for Million-Base Genomic Foundations',
      url: 'https://biorxiv.org/content/genomics-ssm-mamba-eval',
      snippet:
        'Sub-quadratic sequence scaling enables linear-time attention over 100k token nucleotide sequences, ' +
        'outperforming standard Transformers on splice site detection and epigenetic mark predictions.',
    },
  ];

  const webResult = await IngestionPipeline.ingestWebSnippets(testSessionId, sampleSnippets);
  console.log(`Web Snippets Ingested: ${webResult.chunksCount} chunks, ${webResult.totalTokens} tokens.`);
  console.log('✓ Web snippet ingestion passed!\n');

  // ------------------------------------------------------------------
  // 5. Test Hybrid Context Retrieval (Vector + BM25 + RRF)
  // ------------------------------------------------------------------
  console.log('--- Test 5: Hybrid Context Retrieval (retrieveContext) ---');

  // Query A: Targets PDF content
  console.log('\nQuery A: "What is the physical qubit overhead for surface code error correction?"');
  const resultsA = await retrieveContext(testSessionId, 'physical qubit overhead surface code', 3);
  console.log(`Top matches returned: ${resultsA.length}`);
  resultsA.forEach((r, idx) => {
    console.log(`  [Rank ${idx + 1}] Source: ${r.source} (${r.sourceType}) | Score: ${r.score.toFixed(4)}`);
    console.log(`          Excerpt: "${r.text.replace(/\s+/g, ' ').slice(0, 110)}..."`);
  });

  if (resultsA.length === 0 || !resultsA[0].source.includes('.pdf')) {
    throw new Error('Query A retrieval failed: top result should be from the PDF document');
  }
  console.log('✓ Query A accurately matched PDF document via hybrid search!\n');

  // Query B: Targets Web Snippet content
  console.log('Query B: "How do neutral atoms and optical tweezers perform Rydberg gates?"');
  const resultsB = await retrieveContext(testSessionId, 'neutral atom optical tweezer rydberg blockade fidelity', 3);
  console.log(`Top matches returned: ${resultsB.length}`);
  resultsB.forEach((r, idx) => {
    console.log(`  [Rank ${idx + 1}] Source: ${r.source} (${r.sourceType}) | Score: ${r.score.toFixed(4)}`);
    console.log(`          Excerpt: "${r.text.replace(/\s+/g, ' ').slice(0, 110)}..."`);
  });

  if (resultsB.length === 0 || !resultsB[0].source.includes('nature.com')) {
    throw new Error('Query B retrieval failed: top result should be from the Nature web snippet');
  }
  console.log('✓ Query B accurately matched Web Snippet via hybrid search!\n');

  // Query C: Keyword-specific BM25 boost test
  console.log('Query C: "Mamba nucleotide genomic sequence scaling"');
  const resultsC = await retrieveContext(testSessionId, 'Mamba nucleotide genomic sequence', 2);
  console.log(`Top match: ${resultsC[0]?.source} | Score: ${resultsC[0]?.score.toFixed(4)}`);
  console.log(`Excerpt: "${resultsC[0]?.text.replace(/\s+/g, ' ').slice(0, 90)}..."`);

  if (!resultsC[0]?.source.includes('biorxiv.org')) {
    throw new Error('Query C retrieval failed: top result should be genomics paper');
  }
  console.log('✓ Query C keyword + semantic match passed!\n');

  // ------------------------------------------------------------------
  // Cleanup test session from vector store
  // ------------------------------------------------------------------
  const collection = vectorStore.getOrCreateCollection('insightforge_research');
  await collection.delete({ where: { sessionId: testSessionId } });
  console.log('[Cleanup] Cleaned up temporary test vectors from vector store.');

  console.log('====================================================');
  console.log('    All RAG Module Tests Passed Successfully!       ');
  console.log('====================================================');
}

runRagTests().catch((err) => {
  console.error('[RAG Test Failed]:', err);
  process.exit(1);
});
