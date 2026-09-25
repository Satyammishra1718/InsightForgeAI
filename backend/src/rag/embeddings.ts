import OpenAI from 'openai';
import { config } from '../config/index.js';

export const EMBEDDING_DIMENSION = 1536;
export const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 64;

export class EmbeddingService {
  private static openaiClient: OpenAI | null = null;

  private static getClient(): OpenAI | null {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith('your_') || apiKey.trim() === '') {
      return null;
    }
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey });
    }
    return this.openaiClient;
  }

  /**
   * Generates embeddings for a single text string
   */
  public static async embedText(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  /**
   * Generates embeddings for an array of texts, batching requests for efficiency
   */
  public static async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const client = this.getClient();

    // If OpenAI API key is present, attempt batched API calls
    if (client) {
      try {
        const allEmbeddings: number[][] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
          const batch = texts.slice(i, i + BATCH_SIZE);
          const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: batch,
            encoding_format: 'float',
          });

          // Sort by index to maintain exact input order
          const sortedData = [...response.data].sort((a, b) => a.index - b.index);
          for (const item of sortedData) {
            allEmbeddings.push(item.embedding);
          }
        }

        return allEmbeddings;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[EmbeddingService] OpenAI embeddings API call failed (${msg}). Falling back to deterministic local embeddings.`,
        );
      }
    }

    // Offline / Local Deterministic Fallback
    return texts.map((t) => this.generateLocalEmbedding(t));
  }

  /**
   * Deterministic local embedding generator (1536 dimensions, L2-normalized).
   * Generates a stable semantic vector representation using token n-grams and term frequency hashing.
   */
  public static generateLocalEmbedding(text: string): number[] {
    const vector = new Float64Array(EMBEDDING_DIMENSION);
    const normalizedText = text.toLowerCase().trim();
    const words = normalizedText.split(/\W+/).filter(Boolean);

    // 1. Unigram and Bigram hashing
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const h1 = this.hashString(word) % EMBEDDING_DIMENSION;
      vector[Math.abs(h1)] += 1.0;

      // Bigram
      if (i < words.length - 1) {
        const bigram = `${word}_${words[i + 1]}`;
        const h2 = this.hashString(bigram) % EMBEDDING_DIMENSION;
        vector[Math.abs(h2)] += 1.5;
      }

      // Character trigrams for morphological similarity
      for (let j = 0; j < word.length - 2; j++) {
        const trigram = word.slice(j, j + 3);
        const h3 = this.hashString(trigram) % EMBEDDING_DIMENSION;
        vector[Math.abs(h3)] += 0.3;
      }
    }

    // 2. L2 Normalization (unit vector)
    let sumSquares = 0;
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      sumSquares += vector[i] * vector[i];
    }

    const norm = Math.sqrt(sumSquares);
    const result: number[] = new Array(EMBEDDING_DIMENSION);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      result[i] = norm > 0 ? vector[i] / norm : 0;
    }

    return result;
  }

  /**
   * FNV-1a 32-bit hash algorithm
   */
  private static hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
