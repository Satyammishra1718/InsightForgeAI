import { encode, decode } from 'gpt-tokenizer';
import { DocumentChunk, SourceType } from './types.js';

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
  source: string;
  sourceType: SourceType;
  title?: string;
  sessionId: string;
}

/**
 * Splits raw document text into tokenizer-aware overlapping chunks
 * Default: ~500 tokens per chunk with ~50 token overlap
 */
export function chunkText(text: string, options: ChunkingOptions): DocumentChunk[] {
  const targetTokens = options.targetTokens || 500;
  const overlapTokens = options.overlapTokens || 50;

  if (overlapTokens >= targetTokens) {
    throw new Error('overlapTokens must be smaller than targetTokens');
  }

  const cleanText = text.trim();
  if (!cleanText) {
    return [];
  }

  // 1. Tokenize entire text using GPT BPE tokenizer
  const allTokens = encode(cleanText);
  const totalTokens = allTokens.length;

  if (totalTokens === 0) {
    return [];
  }

  // If text fits in a single chunk
  if (totalTokens <= targetTokens) {
    const chunkId = `${options.sessionId}_${slugify(options.source)}_chunk_0`;
    return [
      {
        id: chunkId,
        sessionId: options.sessionId,
        text: cleanText,
        tokens: totalTokens,
        metadata: {
          sessionId: options.sessionId,
          source: options.source,
          sourceType: options.sourceType,
          title: options.title || options.source,
          chunkIndex: 0,
          totalChunks: 1,
          tokenCount: totalTokens,
          originalText: cleanText,
          createdAt: new Date().toISOString(),
        },
      },
    ];
  }

  // 2. Sliding window over token indices
  const step = targetTokens - overlapTokens;
  const chunks: DocumentChunk[] = [];
  let tokenStart = 0;
  let chunkIndex = 0;

  // Pre-calculate approximate total chunks
  const totalChunksEst = Math.ceil((totalTokens - overlapTokens) / step);

  while (tokenStart < totalTokens) {
    const tokenEnd = Math.min(tokenStart + targetTokens, totalTokens);
    const tokenSlice = allTokens.slice(tokenStart, tokenEnd);
    const chunkTextStr = decode(tokenSlice).trim();

    if (chunkTextStr.length > 0) {
      const chunkId = `${options.sessionId}_${slugify(options.source)}_chunk_${chunkIndex}`;
      chunks.push({
        id: chunkId,
        sessionId: options.sessionId,
        text: chunkTextStr,
        tokens: tokenSlice.length,
        metadata: {
          sessionId: options.sessionId,
          source: options.source,
          sourceType: options.sourceType,
          title: options.title || options.source,
          chunkIndex,
          totalChunks: totalChunksEst,
          tokenCount: tokenSlice.length,
          originalText: chunkTextStr,
          createdAt: new Date().toISOString(),
        },
      });
      chunkIndex++;
    }

    // Advance window
    tokenStart += step;

    // Prevent infinite loop if step is 0 or end reached
    if (tokenEnd >= totalTokens) {
      break;
    }
  }

  // Update actual totalChunks in metadata
  const actualTotal = chunks.length;
  chunks.forEach((c) => {
    c.metadata.totalChunks = actualTotal;
  });

  return chunks;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 30);
}
