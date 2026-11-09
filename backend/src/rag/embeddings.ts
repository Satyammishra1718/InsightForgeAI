import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Embedding providers, in order of preference:
 *
 * 1. `local` (default): sentence-transformers all-MiniLM-L6-v2 run in-process via
 *    transformers.js / ONNX Runtime. 384-dim, L2-normalised, no API key, no per-call cost.
 * 2. `openai` (opt-in with EMBEDDING_PROVIDER=openai): text-embedding-3-small, 1536-dim.
 * 3. Hashed n-gram vectors: last-resort fallback if the chosen provider fails. These measure
 *    word overlap, not meaning, and are tagged so callers can treat them accordingly.
 *
 * Every result reports which model produced it. Vectors from different models live in
 * different spaces and must never be compared; the vector store and semantic cache use the
 * model tag to keep them apart.
 */
export const LOCAL_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MINILM_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const HASH_EMBEDDING_MODEL = 'local-hash-ngram';

export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  [MINILM_EMBEDDING_MODEL]: 384,
  [OPENAI_EMBEDDING_MODEL]: 1536,
  [HASH_EMBEDDING_MODEL]: 384,
};

/** Dimension of the default (local MiniLM) embeddings. */
export const EMBEDDING_DIMENSION = EMBEDDING_DIMENSIONS[MINILM_EMBEDDING_MODEL];

const OPENAI_BATCH_SIZE = 64;
const LOCAL_BATCH_SIZE = 32;

type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
}

export class EmbeddingService {
  private static openaiClient: OpenAI | null = null;
  private static extractorPromise: Promise<FeatureExtractor> | null = null;

  private static provider(): 'local' | 'openai' {
    return (process.env.EMBEDDING_PROVIDER || 'local').trim().toLowerCase() === 'openai'
      ? 'openai'
      : 'local';
  }

  private static getOpenAIClient(): OpenAI | null {
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
   * Lazily loads the ONNX MiniLM model once per process. The first call downloads ~90MB of
   * weights from the Hugging Face Hub into EMBEDDING_CACHE_DIR (default <repo>/data/models);
   * later starts load from disk.
   */
  private static getLocalExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir =
          process.env.EMBEDDING_CACHE_DIR || path.resolve(__dirname, '../../../data/models');
        const started = Date.now();
        const extractor = await pipeline('feature-extraction', LOCAL_MODEL_ID, { dtype: 'fp32' });
        console.log(
          `[EmbeddingService] Loaded local embedding model ${LOCAL_MODEL_ID} in ${Date.now() - started}ms`,
        );
        return extractor as unknown as FeatureExtractor;
      })();
      // Allow a later retry if loading failed (e.g. no network on first download).
      this.extractorPromise.catch(() => {
        this.extractorPromise = null;
      });
    }
    return this.extractorPromise;
  }

  /** Warm the local model at startup so the first user request doesn't pay the load time. */
  public static async warmUp(): Promise<void> {
    if (this.provider() !== 'local') return;
    try {
      await this.embedBatchWithModel(['warm up']);
    } catch {
      // embedBatchWithModel already logs and falls back
    }
  }

  /** Generates an embedding for a single text string. */
  public static async embedText(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  /** Generates embeddings for an array of texts. */
  public static async embedBatch(texts: string[]): Promise<number[][]> {
    return (await this.embedBatchWithModel(texts)).embeddings;
  }

  /** Embeds a single text and reports which model produced the vector. */
  public static async embedTextWithModel(
    text: string,
  ): Promise<{ embedding: number[]; model: string }> {
    const { embeddings, model } = await this.embedBatchWithModel([text]);
    return { embedding: embeddings[0], model };
  }

  public static async embedBatchWithModel(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], model: this.provider() === 'openai' ? OPENAI_EMBEDDING_MODEL : MINILM_EMBEDDING_MODEL };
    }

    if (this.provider() === 'openai') {
      const client = this.getOpenAIClient();
      if (client) {
        try {
          const all: number[][] = [];
          for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
            const response = await client.embeddings.create({
              model: OPENAI_EMBEDDING_MODEL,
              input: texts.slice(i, i + OPENAI_BATCH_SIZE),
              encoding_format: 'float',
            });
            // Sort by index to maintain exact input order
            for (const item of [...response.data].sort((a, b) => a.index - b.index)) {
              all.push(item.embedding);
            }
          }
          return { embeddings: all, model: OPENAI_EMBEDDING_MODEL };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[EmbeddingService] OpenAI embeddings failed (${msg}); trying local model.`);
        }
      } else {
        console.warn('[EmbeddingService] EMBEDDING_PROVIDER=openai but no valid OPENAI_API_KEY; using local model.');
      }
    }

    {
      try {
        const extractor = await this.getLocalExtractor();
        const all: number[][] = [];
        for (let i = 0; i < texts.length; i += LOCAL_BATCH_SIZE) {
          const output = await extractor(texts.slice(i, i + LOCAL_BATCH_SIZE), {
            pooling: 'mean',
            normalize: true,
          });
          all.push(...output.tolist());
        }
        return { embeddings: all, model: MINILM_EMBEDDING_MODEL };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[EmbeddingService] Local embedding model unavailable (${msg}). ` +
            'Falling back to hashed n-gram vectors (lexical only, not semantic).',
        );
      }
    }

    return {
      embeddings: texts.map((t) => this.generateLocalEmbedding(t)),
      model: HASH_EMBEDDING_MODEL,
    };
  }

  /**
   * Deterministic hashed n-gram embedding (384 dims, L2-normalised). Lexical only: used as a
   * last resort so the system degrades instead of failing when no model is available.
   */
  public static generateLocalEmbedding(text: string): number[] {
    const dim = EMBEDDING_DIMENSIONS[HASH_EMBEDDING_MODEL];
    const vector = new Float64Array(dim);
    const words = text.toLowerCase().trim().split(/\W+/).filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      vector[this.hashString(word) % dim] += 1.0;
      if (i < words.length - 1) {
        vector[this.hashString(`${word}_${words[i + 1]}`) % dim] += 1.5;
      }
      for (let j = 0; j < word.length - 2; j++) {
        vector[this.hashString(word.slice(j, j + 3)) % dim] += 0.3;
      }
    }

    let sumSquares = 0;
    for (let i = 0; i < dim; i++) sumSquares += vector[i] * vector[i];
    const norm = Math.sqrt(sumSquares);
    return Array.from(vector, (v) => (norm > 0 ? v / norm : 0));
  }

  /** FNV-1a 32-bit hash. */
  private static hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
