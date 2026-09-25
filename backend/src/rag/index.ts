import { hybridSearch, HybridSearchOptions } from './hybridSearch.js';
import { RetrievedContext } from './types.js';

export * from './types.js';
export * from './chunker.js';
export * from './embeddings.js';
export * from './vectorStore.js';
export * from './bm25.js';
export * from './hybridSearch.js';
export * from './ingestion.js';

/**
 * Main internal RAG retrieval function for Autonomous Agents (Part 4)
 * Returns the most relevant document chunks with their source metadata for a given query.
 *
 * @param sessionId - Research session ID to scope retrieval to
 * @param query - Search query or user research goal
 * @param topK - Number of top chunks to return (default: 5)
 * @returns Array of retrieved context chunks with relevance scores and metadata
 */
export async function retrieveContext(
  sessionId: string,
  query: string,
  topK = 5,
  options?: Partial<HybridSearchOptions>,
): Promise<RetrievedContext[]> {
  if (!sessionId || !query.trim()) {
    return [];
  }

  return await hybridSearch({
    sessionId,
    query,
    topK,
    ...options,
  });
}
