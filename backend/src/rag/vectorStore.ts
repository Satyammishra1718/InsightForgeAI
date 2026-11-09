import type { Collection, Metadata, Where } from 'chromadb';
import { getChromaClient, ensureChromaServer } from '../config/chroma.js';
import { EMBEDDING_DIMENSIONS, MINILM_EMBEDDING_MODEL } from './embeddings.js';
import { ChunkMetadata, VectorSearchResult } from './types.js';

/**
 * ChromaDB-backed vector store.
 *
 * A logical collection (e.g. "insightforge_research") maps to one physical Chroma collection
 * per embedding model ("insightforge_research__all-MiniLM-L6-v2"). Chroma fixes a collection's
 * vector dimension on first insert, and vectors from different models must never be compared,
 * so partitioning by model keeps queries correct when the embedding provider changes.
 * Similarity search uses Chroma's HNSW index in cosine space.
 */

export interface VectorItem {
  id: string;
  embedding: number[];
  /** Model that produced `embedding`. */
  embeddingModel?: string;
  metadata: ChunkMetadata;
  document: string;
}

export interface CollectionQueryOptions {
  queryEmbeddings: number[][];
  /** Model that produced the query embeddings; selects the matching physical collection. */
  embeddingModel?: string;
  nResults?: number;
  where?: Record<string, unknown>;
}

const ADD_BATCH_SIZE = 256;
const KNOWN_MODELS = Object.keys(EMBEDDING_DIMENSIONS);

function physicalName(logical: string, model: string): string {
  return `${logical}__${model}`.replace(/[^a-zA-Z0-9._-]/g, '-');
}

/** Chroma metadata values must be string | number | boolean; drop or stringify the rest. */
function toChromaMetadata(meta: ChunkMetadata, embeddingModel: string): Metadata {
  const out: Metadata = { embeddingModel };
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : JSON.stringify(v);
  }
  return out;
}

function fromChromaMetadata(meta: Metadata | null | undefined): ChunkMetadata {
  const rest: Record<string, unknown> = { ...(meta ?? {}) };
  delete rest.embeddingModel;
  return rest as ChunkMetadata;
}

/** Translate a flat equality filter into Chroma's where syntax. */
function toWhere(where?: Record<string, unknown>): Where | undefined {
  const entries = Object.entries(where ?? {}).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return undefined;
  const clauses = entries.map(([k, v]) => ({ [k]: v })) as Where[];
  return clauses.length === 1 ? clauses[0] : ({ $and: clauses } as Where);
}

export class ChromaCollection {
  private physical = new Map<string, Collection>();

  constructor(public readonly name: string) {}

  private async collectionFor(model: string, create: boolean): Promise<Collection | null> {
    const cached = this.physical.get(model);
    if (cached) return cached;
    await ensureChromaServer();
    const client = getChromaClient();
    const name = physicalName(this.name, model);
    try {
      const col = create
        ? await client.getOrCreateCollection({
            name,
            metadata: { 'hnsw:space': 'cosine', embeddingModel: model },
            embeddingFunction: null,
          })
        : await client.getCollection({ name });
      this.physical.set(model, col);
      return col;
    } catch (err) {
      if (create) throw err;
      return null; // collection for this model doesn't exist yet
    }
  }

  private async existingCollections(): Promise<Array<[string, Collection]>> {
    const out: Array<[string, Collection]> = [];
    for (const model of KNOWN_MODELS) {
      const col = await this.collectionFor(model, false);
      if (col) out.push([model, col]);
    }
    return out;
  }

  /** Adds or updates items (upsert). */
  public async add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas: ChunkMetadata[];
    documents: string[];
    embeddingModel?: string;
  }): Promise<void> {
    const model = params.embeddingModel ?? MINILM_EMBEDDING_MODEL;
    const col = (await this.collectionFor(model, true))!;
    for (let i = 0; i < params.ids.length; i += ADD_BATCH_SIZE) {
      const end = i + ADD_BATCH_SIZE;
      await col.upsert({
        ids: params.ids.slice(i, end),
        embeddings: params.embeddings.slice(i, end),
        documents: params.documents.slice(i, end),
        metadatas: params.metadatas.slice(i, end).map((m) => toChromaMetadata(m, model)),
      });
    }
  }

  /** Nearest-neighbour search (cosine) within the collection for the query's embedding model. */
  public async query(options: CollectionQueryOptions): Promise<VectorSearchResult[][]> {
    const { queryEmbeddings, nResults = 5, where } = options;
    const col = await this.collectionFor(options.embeddingModel ?? MINILM_EMBEDDING_MODEL, false);
    if (!col || queryEmbeddings.length === 0) return queryEmbeddings.map(() => []);

    const res = await col.query({
      queryEmbeddings,
      nResults,
      where: toWhere(where),
      include: ['documents', 'metadatas', 'distances'],
    });

    return res.ids.map((ids, q) =>
      ids.map((id, i) => {
        const distance = res.distances?.[q]?.[i] ?? 1;
        return {
          id,
          document: res.documents?.[q]?.[i] ?? '',
          metadata: fromChromaMetadata(res.metadatas?.[q]?.[i]),
          // Chroma cosine distance = 1 - cosine similarity
          similarity: 1 - distance,
          distance,
        };
      }),
    );
  }

  /** Retrieves items by ids and/or metadata filter. */
  public async get(params?: {
    ids?: string[];
    where?: Record<string, unknown>;
    embeddingModel?: string;
    includeEmbeddings?: boolean;
  }): Promise<VectorItem[]> {
    const targets = params?.embeddingModel
      ? await Promise.all([this.collectionFor(params.embeddingModel, false)]).then((c) =>
          c[0] ? ([[params.embeddingModel!, c[0]]] as Array<[string, Collection]>) : [],
        )
      : await this.existingCollections();

    const items: VectorItem[] = [];
    for (const [model, col] of targets) {
      const res = await col.get({
        ids: params?.ids && params.ids.length > 0 ? params.ids : undefined,
        where: toWhere(params?.where),
        include: params?.includeEmbeddings
          ? ['documents', 'metadatas', 'embeddings']
          : ['documents', 'metadatas'],
      });
      res.ids.forEach((id, i) => {
        items.push({
          id,
          embedding: (res.embeddings?.[i] as number[] | undefined) ?? [],
          embeddingModel: model,
          metadata: fromChromaMetadata(res.metadatas?.[i]),
          document: res.documents?.[i] ?? '',
        });
      });
    }
    return items;
  }

  /** Deletes items matching ids or a metadata filter, across all embedding models. */
  public async delete(params: { ids?: string[]; where?: Record<string, unknown> }): Promise<number> {
    const hasIds = !!params.ids && params.ids.length > 0;
    const where = toWhere(params.where);
    if (!hasIds && !where) return 0; // never wipe a whole collection by accident

    let deleted = 0;
    for (const [, col] of await this.existingCollections()) {
      const matching = await col.get({ ids: hasIds ? params.ids : undefined, where, include: [] });
      if (matching.ids.length > 0) {
        await col.delete({ ids: matching.ids });
        deleted += matching.ids.length;
      }
    }
    return deleted;
  }

  public async count(where?: Record<string, unknown>): Promise<number> {
    let total = 0;
    for (const [, col] of await this.existingCollections()) {
      total += where ? (await col.get({ where: toWhere(where), include: [] })).ids.length : await col.count();
    }
    return total;
  }
}

export class ChromaVectorStore {
  private collections = new Map<string, ChromaCollection>();

  public getOrCreateCollection(name = 'insightforge_research'): ChromaCollection {
    let col = this.collections.get(name);
    if (!col) {
      col = new ChromaCollection(name);
      this.collections.set(name, col);
    }
    return col;
  }
}

export const vectorStore = new ChromaVectorStore();
