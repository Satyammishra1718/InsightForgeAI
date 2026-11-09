import { EmbeddingService } from './embeddings.js';
import { vectorStore } from './vectorStore.js';
import { bm25Engine } from './bm25.js';
import { RetrievedContext, ChunkMetadata } from './types.js';

export interface HybridSearchOptions {
  sessionId: string;
  query: string;
  topK?: number;
  collectionName?: string;
  vectorWeight?: number;
  bm25Weight?: number;
  rrfConstant?: number;
}

/**
 * Hybrid retrieval combining vector semantic similarity with BM25 keyword search,
 * merged and re-ranked using Reciprocal Rank Fusion (RRF).
 */
export async function hybridSearch(options: HybridSearchOptions): Promise<RetrievedContext[]> {
  const {
    sessionId,
    query,
    topK = 5,
    collectionName = 'insightforge_research',
    vectorWeight = 0.6,
    bm25Weight = 0.4,
    rrfConstant = 60,
  } = options;

  const collection = vectorStore.getOrCreateCollection(collectionName);

  // 1. Scope retrieval strictly to this session's documents. Falling back to the whole
  // collection leaked other sessions' uploads into unrelated reports and let stale
  // seed documents be cited as if they were evidence for this query.
  if (!sessionId) {
    return [];
  }
  const { embedding: queryEmbedding, model: embeddingModel } =
    await EmbeddingService.embedTextWithModel(query);
  const whereFilter: Record<string, unknown> = { sessionId };
  // Only documents embedded with the query's model are searchable in the same vector space.
  const sessionDocs = await collection.get({ where: whereFilter, embeddingModel });

  if (sessionDocs.length === 0) {
    return [];
  }

  // 2. Vector Semantic Similarity Search (ChromaDB HNSW, cosine)
  const candidateLimit = Math.max(topK * 3, 10);

  const vectorQueryResults = await collection.query({
    queryEmbeddings: [queryEmbedding],
    embeddingModel,
    nResults: candidateLimit,
    where: whereFilter,
  });

  const vectorMatches = vectorQueryResults[0] || [];

  // Map of vector ranks (1-indexed)
  const vectorRankMap = new Map<string, { rank: number; score: number }>();
  vectorMatches.forEach((match, idx) => {
    vectorRankMap.set(match.id, { rank: idx + 1, score: match.similarity });
  });

  // 3. BM25 Keyword Search
  const bm25Candidates = sessionDocs.map((item) => ({
    id: item.id,
    document: item.document,
    metadata: item.metadata as ChunkMetadata,
  }));

  const bm25Matches = bm25Engine.search(query, bm25Candidates, candidateLimit);

  // Map of BM25 ranks (1-indexed)
  const bm25RankMap = new Map<string, { rank: number; score: number }>();
  bm25Matches.forEach((match, idx) => {
    bm25RankMap.set(match.id, { rank: idx + 1, score: match.bm25Score });
  });

  // 4. Reciprocal Rank Fusion (RRF)
  // Gather all unique document IDs that appeared in either vector or BM25
  const allDocIds = new Set<string>([
    ...Array.from(vectorRankMap.keys()),
    ...Array.from(bm25RankMap.keys()),
  ]);

  // Document map for fast lookup
  const docItemMap = new Map(sessionDocs.map((d) => [d.id, d]));

  const fusedResults: RetrievedContext[] = [];

  for (const id of allDocIds) {
    const docItem = docItemMap.get(id);
    if (!docItem) continue;

    const vecInfo = vectorRankMap.get(id);
    const bm25Info = bm25RankMap.get(id);

    const vecRrf = vecInfo ? vectorWeight / (rrfConstant + vecInfo.rank) : 0;
    const bm25Rrf = bm25Info ? bm25Weight / (rrfConstant + bm25Info.rank) : 0;
    const totalRrf = vecRrf + bm25Rrf;

    fusedResults.push({
      id: docItem.id,
      text: docItem.document,
      source: docItem.metadata.source,
      sourceType: docItem.metadata.sourceType,
      title: docItem.metadata.title,
      chunkIndex: docItem.metadata.chunkIndex,
      totalChunks: docItem.metadata.totalChunks,
      score: totalRrf,
      rrfScore: totalRrf,
      vectorRank: vecInfo?.rank,
      bm25Rank: bm25Info?.rank,
    });
  }

  // 5. Sort descending by RRF score
  fusedResults.sort((a, b) => b.score - a.score);

  return fusedResults.slice(0, topK);
}
