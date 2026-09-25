import { BM25SearchResult, ChunkMetadata } from './types.js';

export interface BM25Document {
  id: string;
  document: string;
  metadata: ChunkMetadata;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'if',
  'in',
  'into',
  'is',
  'it',
  'no',
  'not',
  'of',
  'on',
  'or',
  'such',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'will',
  'with',
]);

export class BM25SearchEngine {
  private k1: number;
  private b: number;

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Performs BM25 keyword search over a corpus of documents
   */
  public search(query: string, corpus: BM25Document[], topK = 10): BM25SearchResult[] {
    if (corpus.length === 0) {
      return [];
    }

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const N = corpus.length;

    // 1. Tokenize corpus and calculate document lengths
    const docTokensList: string[][] = [];
    const docTermFreqs: Map<string, number>[] = [];
    let totalDocLen = 0;

    for (const doc of corpus) {
      const tokens = this.tokenize(doc.document);
      docTokensList.push(tokens);
      totalDocLen += tokens.length;

      const tf = new Map<string, number>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
      }
      docTermFreqs.push(tf);
    }

    const avgdl = totalDocLen / N || 1;

    // 2. Calculate Document Frequency (DF) for query terms
    const dfMap = new Map<string, number>();
    for (const qTerm of queryTokens) {
      let df = 0;
      for (const tf of docTermFreqs) {
        if (tf.has(qTerm)) {
          df++;
        }
      }
      dfMap.set(qTerm, df);
    }

    // 3. Compute BM25 scores for each document
    const results: BM25SearchResult[] = [];

    for (let i = 0; i < N; i++) {
      const doc = corpus[i];
      const tf = docTermFreqs[i];
      const docLen = docTokensList[i].length;
      let score = 0;

      for (const qTerm of queryTokens) {
        const f = tf.get(qTerm) || 0;
        if (f > 0) {
          const df = dfMap.get(qTerm) || 0;
          // Standard Robertson-Spärck Jones IDF
          const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1.0);
          // Term weight
          const numerator = f * (this.k1 + 1);
          const denominator = f + this.k1 * (1 - this.b + this.b * (docLen / avgdl));
          score += idf * (numerator / denominator);
        }
      }

      if (score > 0) {
        results.push({
          id: doc.id,
          document: doc.document,
          metadata: doc.metadata,
          bm25Score: score,
        });
      }
    }

    // Sort descending by score
    results.sort((a, b) => b.bm25Score - a.bm25Score);
    return results.slice(0, topK);
  }

  public tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  }
}

export const bm25Engine = new BM25SearchEngine();
