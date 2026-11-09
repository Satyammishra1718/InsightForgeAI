import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import { EmbeddingService, HASH_EMBEDDING_MODEL } from '../rag/embeddings.js';

export interface CachedReportResult {
  hit: boolean;
  similarity?: number;
  matchedQuery?: string;
  report?: {
    title: string;
    content: string;
    sources: Array<{ title: string; url: string; snippet?: string }>;
  };
}

interface CacheEntry {
  query: string;
  embedding: number[];
  embeddingModel?: string;
  report: {
    title: string;
    content: string;
    sources: Array<{ title: string; url: string; snippet?: string }>;
  };
  createdAt: string;
}

const CACHE_INDEX_KEY = 'semantic_cache:index';
const DEFAULT_TTL_SECONDS = 86400; // 24 hours
const DEFAULT_SIMILARITY_THRESHOLD = 0.80;
// Hashed n-gram vectors measure word overlap, not meaning: "X vs Y reads" and
// "X vs Y writes" score very high. Only near-identical queries may hit in that mode.
const LOCAL_EMBEDDING_THRESHOLD = 0.97;

/**
 * Computes cosine similarity between two L2-normalized vectors (dot product).
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
}

export class SemanticCacheService {
  /**
   * Checks whether a semantically similar query was already answered recently.
   *
   * @param query - User query to look up
   * @param threshold - Minimum cosine similarity (default: 0.80 for model embeddings)
   */
  public static async checkSemanticCache(
    query: string,
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
  ): Promise<CachedReportResult> {
    try {
      const redis = await getRedisClient();
      const keys = await redis.smembers(CACHE_INDEX_KEY);
      if (!keys || keys.length === 0) {
        return { hit: false };
      }

      // Generate embedding for current query
      const { embedding: queryEmbedding, model } = await EmbeddingService.embedTextWithModel(query);
      const effectiveThreshold =
        model === HASH_EMBEDDING_MODEL ? Math.max(threshold, LOCAL_EMBEDDING_THRESHOLD) : threshold;

      let bestMatch: CacheEntry | null = null;
      let highestSimilarity = -1;

      for (const key of keys) {
        const raw = await redis.get(key);
        if (!raw) {
          // Stale key, remove from index set
          await redis.srem(CACHE_INDEX_KEY, key);
          continue;
        }

        try {
          const entry = JSON.parse(raw) as CacheEntry;
          // Skip entries embedded with a different model: their vectors are not comparable.
          if ((entry.embeddingModel ?? HASH_EMBEDDING_MODEL) !== model) continue;
          const sim = cosineSimilarity(queryEmbedding, entry.embedding);
          if (sim > highestSimilarity) {
            highestSimilarity = sim;
            bestMatch = entry;
          }
        } catch {
          // ignore corrupted entry
        }
      }

      if (bestMatch && highestSimilarity >= effectiveThreshold) {
        console.log(
          `[SemanticCache] HIT! Query '${query}' matched cached query '${bestMatch.query}' with similarity ${(highestSimilarity * 100).toFixed(1)}%`,
        );
        return {
          hit: true,
          similarity: highestSimilarity,
          matchedQuery: bestMatch.query,
          report: bestMatch.report,
        };
      }

      return { hit: false, similarity: highestSimilarity };
    } catch (err) {
      console.warn('[SemanticCache] Cache check failed, proceeding without cache:', err);
      return { hit: false };
    }
  }

  /**
   * Stores a completed research report in the Redis semantic cache.
   */
  public static async setSemanticCache(
    query: string,
    report: {
      title: string;
      content: string;
      sources: Array<{ title: string; url: string; snippet?: string }>;
    },
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    try {
      const redis = await getRedisClient();
      const { embedding: queryEmbedding, model } = await EmbeddingService.embedTextWithModel(query);
      const queryHash = hashQuery(query);
      const key = `semantic_cache:entry:${queryHash}`;

      const entry: CacheEntry = {
        query,
        embedding: queryEmbedding,
        embeddingModel: model,
        report,
        createdAt: new Date().toISOString(),
      };

      await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
      await redis.sadd(CACHE_INDEX_KEY, key);
      console.log(`[SemanticCache] Stored query '${query}' in Redis cache (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      console.warn('[SemanticCache] Failed to store report in cache:', err);
    }
  }
}
