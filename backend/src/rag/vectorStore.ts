import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { ChunkMetadata, VectorSearchResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface VectorItem {
  id: string;
  embedding: number[];
  /** Model that produced `embedding`. Vectors from different models are never compared. */
  embeddingModel?: string;
  metadata: ChunkMetadata;
  document: string;
}

export interface CollectionQueryOptions {
  queryEmbeddings: number[][];
  /** Only compare against items embedded with this model. */
  embeddingModel?: string;
  nResults?: number;
  where?: Record<string, unknown>;
}

export class LocalCollection {
  public readonly name: string;
  private items: Map<string, VectorItem> = new Map();
  private filePath: string;

  constructor(name: string, storageDir: string) {
    this.name = name;
    this.filePath = path.join(storageDir, `${name}.json`);
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: VectorItem[] = JSON.parse(raw);
        for (const item of parsed) {
          this.items.set(item.id, item);
        }
      } catch (err) {
        console.warn(`[VectorStore] Could not load collection '${this.name}' from disk:`, err);
      }
    }
  }

  private saveToDisk(): void {
    // Unique temp name per write: a shared "<file>.tmp" let two processes (API server,
    // scripts, MCP doc-retrieval fallback) overwrite each other's half-written temp file.
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      const itemsArray = Array.from(this.items.values());
      fs.writeFileSync(tempPath, JSON.stringify(itemsArray, null, 2), 'utf-8');
      LocalCollection.replaceFile(tempPath, this.filePath);
    } catch (err) {
      console.error(`[VectorStore] Failed to persist collection '${this.name}' to disk:`, err);
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // best effort cleanup
      }
    }
  }

  /**
   * Atomically replace target with source. On Windows, rename fails with EPERM/EBUSY/EACCES
   * while another process, an antivirus scanner or OneDrive sync briefly holds the target
   * open, so retry with backoff and finally fall back to a copy.
   */
  private static replaceFile(source: string, target: string): void {
    const transient = new Set(['EPERM', 'EBUSY', 'EACCES']);
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        fs.renameSync(source, target);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (!transient.has(code)) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * 2 ** attempt);
      }
    }
    fs.copyFileSync(source, target);
    fs.rmSync(source, { force: true });
  }

  /**
   * Adds or updates items in the collection
   */
  public async add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas: ChunkMetadata[];
    documents: string[];
    embeddingModel?: string;
  }): Promise<void> {
    const { ids, embeddings, metadatas, documents, embeddingModel } = params;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const embedding = embeddings[i];
      const metadata = metadatas[i];
      const document = documents[i];

      this.items.set(id, {
        id,
        embedding,
        embeddingModel,
        metadata,
        document,
      });
    }

    this.saveToDisk();
  }

  /**
   * Queries collection using cosine similarity with optional metadata filtering
   */
  public async query(options: CollectionQueryOptions): Promise<VectorSearchResult[][]> {
    const { queryEmbeddings, nResults = 5, where, embeddingModel } = options;
    const queryDim = queryEmbeddings[0]?.length;
    // Comparing vectors from different embedding models (or dimensions) yields meaningless
    // scores, so restrict the search to items produced by the same model.
    const allItems = Array.from(this.items.values()).filter(
      (item) =>
        item.embedding.length === queryDim &&
        (!embeddingModel || !item.embeddingModel || item.embeddingModel === embeddingModel),
    );

    // Filter items if 'where' metadata filter is present
    const filteredItems = where
      ? allItems.filter((item) => {
          for (const [key, val] of Object.entries(where)) {
            if (item.metadata[key] !== val) {
              return false;
            }
          }
          return true;
        })
      : allItems;

    const resultsPerQuery: VectorSearchResult[][] = [];

    for (const queryVec of queryEmbeddings) {
      const scored = filteredItems.map((item) => {
        const similarity = this.cosineSimilarity(queryVec, item.embedding);
        return {
          id: item.id,
          document: item.document,
          metadata: item.metadata,
          similarity,
          distance: 1 - similarity,
        };
      });

      // Sort descending by similarity
      scored.sort((a, b) => b.similarity - a.similarity);
      resultsPerQuery.push(scored.slice(0, nResults));
    }

    return resultsPerQuery;
  }

  /**
   * Retrieves items matching filter or ids
   */
  public async get(params?: {
    ids?: string[];
    where?: Record<string, unknown>;
  }): Promise<VectorItem[]> {
    let items = Array.from(this.items.values());

    if (params?.ids && params.ids.length > 0) {
      const idSet = new Set(params.ids);
      items = items.filter((item) => idSet.has(item.id));
    }

    if (params?.where) {
      items = items.filter((item) => {
        for (const [key, val] of Object.entries(params.where!)) {
          if (item.metadata[key] !== val) {
            return false;
          }
        }
        return true;
      });
    }

    return items;
  }

  /**
   * Deletes items matching filter or ids
   */
  public async delete(params: {
    ids?: string[];
    where?: Record<string, unknown>;
  }): Promise<number> {
    let deletedCount = 0;

    if (params.ids && params.ids.length > 0) {
      for (const id of params.ids) {
        if (this.items.delete(id)) {
          deletedCount++;
        }
      }
    } else if (params.where) {
      for (const [id, item] of Array.from(this.items.entries())) {
        let match = true;
        for (const [key, val] of Object.entries(params.where)) {
          if (item.metadata[key] !== val) {
            match = false;
            break;
          }
        }
        if (match) {
          this.items.delete(id);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      this.saveToDisk();
    }

    return deletedCount;
  }

  public count(where?: Record<string, unknown>): number {
    if (!where) return this.items.size;
    return Array.from(this.items.values()).filter((item) => {
      for (const [k, v] of Object.entries(where)) {
        if (item.metadata[k] !== v) return false;
      }
      return true;
    }).length;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(vecA.length, vecB.length);

    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Local Embedded ChromaDB-compatible Vector Store
 * Stores vector collections locally on disk without requiring any external server.
 */
export class LocalVectorStore {
  private static instance: LocalVectorStore | null = null;
  private collections: Map<string, LocalCollection> = new Map();
  private storageDir: string;

  constructor(customPath?: string) {
    const resolvedPath = customPath || config.vectorDbPath || './data/vector_db';
    this.storageDir = path.isAbsolute(resolvedPath)
      ? resolvedPath
      : path.resolve(__dirname, '../../../', resolvedPath);

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public static getInstance(): LocalVectorStore {
    if (!LocalVectorStore.instance) {
      LocalVectorStore.instance = new LocalVectorStore();
    }
    return LocalVectorStore.instance;
  }

  public getOrCreateCollection(name = 'insightforge_research'): LocalCollection {
    if (!this.collections.has(name)) {
      const col = new LocalCollection(name, this.storageDir);
      this.collections.set(name, col);
    }
    return this.collections.get(name)!;
  }

  public getStorageDirectory(): string {
    return this.storageDir;
  }
}

export const vectorStore = LocalVectorStore.getInstance();
