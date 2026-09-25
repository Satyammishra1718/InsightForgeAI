export type SourceType = 'pdf' | 'web' | 'text';

export interface ChunkMetadata {
  sessionId: string;
  source: string;
  sourceType: SourceType;
  title?: string;
  chunkIndex: number;
  totalChunks: number;
  tokenCount: number;
  originalText: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface DocumentChunk {
  id: string;
  sessionId: string;
  text: string;
  tokens: number;
  metadata: ChunkMetadata;
}

export interface WebSnippetInput {
  title: string;
  url: string;
  snippet: string;
}

export interface VectorSearchResult {
  id: string;
  document: string;
  metadata: ChunkMetadata;
  similarity: number; // 0 to 1
  distance?: number;
}

export interface BM25SearchResult {
  id: string;
  document: string;
  metadata: ChunkMetadata;
  bm25Score: number;
}

export interface RetrievedContext {
  id: string;
  text: string;
  source: string;
  sourceType: SourceType;
  title?: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
  vectorRank?: number;
  bm25Rank?: number;
  rrfScore?: number;
}

export interface IngestionResult {
  source: string;
  sourceType: SourceType;
  chunksCount: number;
  totalTokens: number;
  chunkIds: string[];
}
