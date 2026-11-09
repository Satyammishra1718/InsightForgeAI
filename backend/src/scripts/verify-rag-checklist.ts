import request from 'supertest';
import { createApp } from '../app.js';
import {
  chunkText,
  EmbeddingService,
  vectorStore,
  IngestionPipeline,
  retrieveContext,
  hybridSearch,
} from '../rag/index.js';
import { encode, decode } from 'gpt-tokenizer';

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

async function verifyChecklist() {
  console.log('================================================================');
  console.log('   RAG Module Verification Checklist Test Suite                ');
  console.log('================================================================\n');

  const sessionId = 'verify_rag_' + Date.now();
  const results = {
    point1: false,
    point2: false,
    point3: false,
    point4: false,
    point5: false,
  };

  // ------------------------------------------------------------------
  // Point 1: Chunking utility produces sensible overlapping chunks
  // ------------------------------------------------------------------
  console.log('▶ [CHECK 1/5] Chunking utility produces sensible overlapping chunks...');
  const textSample =
    'Artificial intelligence research has evolved rapidly from static machine learning models to autonomous agentic architectures. ' +
    'These autonomous agents leverage large language models to iteratively plan, reason, invoke external tools, and inspect their own outputs. ' +
    'When coupled with Retrieval-Augmented Generation (RAG), agents ground their reasoning in dynamic, authoritative external knowledge bases. ' +
    'This grounding drastically mitigates hallucinations and enables complex synthesis across enterprise repositories and live web sources. ' +
    'The document chunking stage is critical because it dictates the granularity of information retrieved during vector searches. ' +
    'If chunks are too small, crucial contextual nuances are lost. If chunks are too large, irrelevant noise degrades the embedding quality. ' +
    'Therefore, tokenizer-aware splitting with overlapping windows ensures that semantic boundaries across paragraphs and concepts are preserved.';

  const targetTokens = 40;
  const overlapTokens = 10;
  const chunks = chunkText(textSample, {
    sessionId,
    source: 'agentic_rag_overview.txt',
    sourceType: 'text',
    targetTokens,
    overlapTokens,
  });

  console.log(`  - Total chunks generated: ${chunks.length}`);
  chunks.forEach((c, idx) => {
    console.log(`    Chunk [${idx}]: tokens=${c.tokens}, text="${c.text.slice(0, 45)}..."`);
  });

  // Verify overlap: The end of chunk 0 should overlap with the beginning of chunk 1
  const chunk0Tokens = encode(chunks[0].text);
  const chunk1Tokens = encode(chunks[1].text);
  const chunk0Tail = chunk0Tokens.slice(chunk0Tokens.length - overlapTokens);
  const chunk1Head = chunk1Tokens.slice(0, overlapTokens);

  console.log(`  - Chunk 0 tail decoded: "${decode(chunk0Tail)}"`);
  console.log(`  - Chunk 1 head decoded: "${decode(chunk1Head)}"`);

  const hasOverlap = decode(chunk0Tail).trim() === decode(chunk1Head).trim();
  if (chunks.length >= 3 && hasOverlap) {
    results.point1 = true;
    console.log(
      '  ✓ [CHECK 1 PASSED]: Chunks are tokenizer-aware, bounded, and properly overlapping.\n',
    );
  } else {
    throw new Error('Check 1 Failed: Overlap between consecutive chunks not detected.');
  }

  // ------------------------------------------------------------------
  // Point 2: Embeddings successfully generated and stored in ChromaDB
  // ------------------------------------------------------------------
  console.log(
    '▶ [CHECK 2/5] Embeddings generated and stored in Vector Store (ChromaDB-compatible)...',
  );
  const collection = vectorStore.getOrCreateCollection('insightforge_research');

  const testTexts = [
    'Vector similarity indexing using high-dimensional Euclidean and cosine spaces.',
    'Approximate nearest neighbor search algorithms for low latency retrieval.',
  ];

  const embeddings = await EmbeddingService.embedBatch(testTexts);
  console.log(`  - Embeddings generated: ${embeddings.length}`);
  console.log(`  - Dimension of vector 0: ${embeddings[0].length}`);

  const itemIds = [`test_vec_1_${Date.now()}`, `test_vec_2_${Date.now()}`];
  await collection.add({
    ids: itemIds,
    embeddings,
    metadatas: [
      {
        sessionId,
        source: 'vector_math.txt',
        sourceType: 'text',
        chunkIndex: 0,
        totalChunks: 2,
        tokenCount: 15,
        originalText: testTexts[0],
      },
      {
        sessionId,
        source: 'vector_math.txt',
        sourceType: 'text',
        chunkIndex: 1,
        totalChunks: 2,
        tokenCount: 15,
        originalText: testTexts[1],
      },
    ],
    documents: testTexts,
  });

  const storedItems = await collection.get({ ids: itemIds });
  console.log(`  - Retrieved stored items count: ${storedItems.length}`);
  console.log(`  - First stored item ID: ${storedItems[0]?.id}`);
  console.log(`  - First stored item embedding length: ${storedItems[0]?.embedding?.length}`);

  if (
    embeddings.length === 2 &&
    embeddings[0].length === 384 &&
    storedItems.length === 2 &&
    storedItems[0].embedding.length === 384
  ) {
    results.point2 = true;
    console.log(
      '  ✓ [CHECK 2 PASSED]: 384-dim MiniLM embeddings generated and persisted in vector store.\n',
    );
  } else {
    throw new Error('Check 2 Failed: Embeddings generation or vector store persistence failed.');
  }

  // ------------------------------------------------------------------
  // Point 3: Hybrid retrieval (vector + keyword) returns relevant results
  // ------------------------------------------------------------------
  console.log('▶ [CHECK 3/5] Hybrid retrieval (vector + keyword) ranking...');
  // Ingest three distinct candidate topics
  await IngestionPipeline.ingestRawText(
    sessionId,
    'Topological quantum surface codes achieve fault-tolerant thresholds near 1 percent using planar lattice surgery and syndrome extraction.',
    'quantum_paper.txt',
    'Quantum Surface Codes',
  );

  await IngestionPipeline.ingestRawText(
    sessionId,
    'State space models such as Mamba exhibit linear time complexity for million-base-pair genomic DNA sequence modeling.',
    'genomics_paper.txt',
    'Genomics Mamba Paper',
  );

  await IngestionPipeline.ingestRawText(
    sessionId,
    'Deep neural network model quantization converts 32-bit floating point weights into 8-bit integers to accelerate inference on edge devices.',
    'quantization_paper.txt',
    'Neural Network Quantization',
  );

  // Search for quantum topic
  const hybridQuantum = await hybridSearch({
    sessionId,
    query: 'fault tolerant lattice surgery surface code threshold',
    topK: 2,
  });

  console.log(`  - Hybrid search query: "fault tolerant lattice surgery surface code threshold"`);
  console.log(
    `    Rank 1: "${hybridQuantum[0]?.source}" | Score: ${hybridQuantum[0]?.score.toFixed(4)}`,
  );
  console.log(
    `    Rank 2: "${hybridQuantum[1]?.source}" | Score: ${hybridQuantum[1]?.score.toFixed(4)}`,
  );

  // Search for edge quantization topic
  const hybridQuantize = await hybridSearch({
    sessionId,
    query: 'neural network 8-bit integer quantization edge inference',
    topK: 2,
  });

  console.log(
    `  - Hybrid search query: "neural network 8-bit integer quantization edge inference"`,
  );
  console.log(
    `    Rank 1: "${hybridQuantize[0]?.source}" | Score: ${hybridQuantize[0]?.score.toFixed(4)}`,
  );

  if (
    hybridQuantum[0]?.source === 'quantum_paper.txt' &&
    hybridQuantize[0]?.source === 'quantization_paper.txt'
  ) {
    results.point3 = true;
    console.log(
      '  ✓ [CHECK 3 PASSED]: Hybrid search accurately fused vector & BM25 keyword rankings.\n',
    );
  } else {
    throw new Error('Check 3 Failed: Hybrid search ranked irrelevant documents at the top.');
  }

  // ------------------------------------------------------------------
  // Point 4: PDF upload + ingestion pipeline works end-to-end
  // ------------------------------------------------------------------
  console.log('▶ [CHECK 4/5] PDF upload + ingestion pipeline end-to-end...');
  const samplePdfLines = [
    'Benchmarking Autonomous Agent Task Routing in Distributed Systems',
    'Abstract: Multi-agent coordination protocols reduce task latency by 45 percent when using hierarchical delegation trees.',
    'Results demonstrate that consensus algorithms ensure consistency across heterogeneous tool servers.',
  ];
  const pdfBuffer = createSamplePdfBuffer(samplePdfLines);

  // 4A: Programmatic ingestion
  const pdfIngestResult = await IngestionPipeline.ingestPdf(
    sessionId,
    pdfBuffer,
    'agent_routing_benchmark.pdf',
  );
  console.log(`  - Programmatic PDF ingestion: ${pdfIngestResult.chunksCount} chunks created`);

  // 4B: HTTP Multipart upload test via Express endpoint POST /api/rag/upload-pdf
  const app = createApp();
  const httpUploadRes = await request(app)
    .post('/api/rag/upload-pdf')
    .field('sessionId', sessionId)
    .attach('file', pdfBuffer, 'uploaded_agent_benchmark.pdf');

  console.log(`  - HTTP POST /api/rag/upload-pdf status: ${httpUploadRes.status}`);
  console.log(`  - HTTP response: ${JSON.stringify(httpUploadRes.body.result)}`);

  if (
    pdfIngestResult.chunksCount > 0 &&
    httpUploadRes.status === 201 &&
    httpUploadRes.body.result.source === 'uploaded_agent_benchmark.pdf'
  ) {
    results.point4 = true;
    console.log(
      '  ✓ [CHECK 4 PASSED]: PDF extraction, chunking, embedding, and HTTP upload pipeline verified.\n',
    );
  } else {
    throw new Error('Check 4 Failed: PDF ingestion failed either programmatically or via HTTP.');
  }

  // ------------------------------------------------------------------
  // Point 5: retrieveContext returns chunks with correct metadata
  // ------------------------------------------------------------------
  console.log('▶ [CHECK 5/5] retrieveContext(sessionId, query, topK) metadata validation...');
  const retrieved = await retrieveContext(
    sessionId,
    'multi-agent task latency delegation trees',
    3,
  );

  console.log(`  - Chunks retrieved: ${retrieved.length}`);
  const topMatch = retrieved[0];

  console.log('  - Top match metadata inspection:');
  console.log(`    * text length:    ${topMatch?.text?.length} chars`);
  console.log(`    * source:         ${topMatch?.source}`);
  console.log(`    * sourceType:     ${topMatch?.sourceType}`);
  console.log(`    * chunkIndex:     ${topMatch?.chunkIndex}`);
  console.log(`    * totalChunks:    ${topMatch?.totalChunks}`);
  console.log(`    * score:          ${topMatch?.score}`);
  console.log(`    * vectorRank:     ${topMatch?.vectorRank}`);
  console.log(`    * bm25Rank:       ${topMatch?.bm25Rank}`);

  const metadataValid =
    topMatch &&
    typeof topMatch.text === 'string' &&
    topMatch.text.length > 0 &&
    typeof topMatch.source === 'string' &&
    ['pdf', 'web', 'text'].includes(topMatch.sourceType) &&
    typeof topMatch.chunkIndex === 'number' &&
    typeof topMatch.totalChunks === 'number' &&
    typeof topMatch.score === 'number' &&
    topMatch.score > 0;

  if (metadataValid) {
    results.point5 = true;
    console.log(
      '  ✓ [CHECK 5 PASSED]: retrieveContext returns valid chunks with rich source metadata.\n',
    );
  } else {
    throw new Error('Check 5 Failed: Retrieved chunk metadata is missing required fields.');
  }

  // Cleanup
  await collection.delete({ where: { sessionId } });
  console.log('[Cleanup] Test session vectors cleared.');

  console.log('================================================================');
  console.log('   ALL 5 RAG CHECKLIST REQUIREMENTS VERIFIED SUCCESSFULLY!      ');
  console.log('================================================================');
}

verifyChecklist().catch((err) => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
