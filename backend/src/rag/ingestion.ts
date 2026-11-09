import * as pdfParseModule from 'pdf-parse';
import { chunkText } from './chunker.js';
import { EmbeddingService } from './embeddings.js';
import { vectorStore } from './vectorStore.js';
import { IngestionResult, WebSnippetInput } from './types.js';

export class IngestionPipeline {
  /**
   * Ingests a PDF document: parses text -> chunks -> embeds -> stores in vector DB tagged by sessionId
   */
  public static async ingestPdf(
    sessionId: string,
    pdfBuffer: Buffer,
    filename: string,
    collectionName = 'insightforge_research',
  ): Promise<IngestionResult> {
    if (!sessionId) {
      throw new Error('sessionId is required for PDF ingestion');
    }
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer cannot be empty');
    }

    // 1. Extract text from PDF buffer
    let rawText = '';
    try {
      const anyModule = pdfParseModule as unknown as {
        PDFParse?: new (data: Uint8Array) => { getText: () => Promise<{ text: string }> };
        default?: (data: Buffer) => Promise<{ text: string }>;
      };

      if (anyModule.PDFParse) {
        const uint8 = new Uint8Array(pdfBuffer);
        const parser = new anyModule.PDFParse(uint8);
        const textResult = await parser.getText();
        rawText = typeof textResult === 'string' ? textResult : textResult.text || '';
      } else if (typeof anyModule.default === 'function') {
        const res = await anyModule.default(pdfBuffer);
        rawText = res.text || '';
      } else if (typeof pdfParseModule === 'function') {
        const res = await (pdfParseModule as unknown as (b: Buffer) => Promise<{ text: string }>)(
          pdfBuffer,
        );
        rawText = res.text || '';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to extract text from PDF: ${msg}`);
    }

    if (!rawText.trim()) {
      throw new Error('Extracted PDF text is empty');
    }

    // 2. Tokenizer-aware chunking (~500 tokens, ~50 overlap)
    const chunks = chunkText(rawText, {
      sessionId,
      source: filename,
      sourceType: 'pdf',
      title: filename.replace(/\.pdf$/i, ''),
    });

    if (chunks.length === 0) {
      throw new Error('No chunks generated from document text');
    }

    // 3. Batched Embedding Generation
    const chunkTexts = chunks.map((c) => c.text);
    const { embeddings, model: embeddingModel } = await EmbeddingService.embedBatchWithModel(chunkTexts);

    // 4. Store in Vector Database
    const collection = vectorStore.getOrCreateCollection(collectionName);
    await collection.add({
      ids: chunks.map((c) => c.id),
      embeddings,
      embeddingModel,
      metadatas: chunks.map((c) => c.metadata),
      documents: chunkTexts,
    });

    const totalTokens = chunks.reduce((acc, c) => acc + c.tokens, 0);

    return {
      source: filename,
      sourceType: 'pdf',
      chunksCount: chunks.length,
      totalTokens,
      chunkIds: chunks.map((c) => c.id),
    };
  }

  /**
   * Ingests a list of web search result snippets: chunks -> embeds -> stores in vector DB tagged by sessionId
   */
  public static async ingestWebSnippets(
    sessionId: string,
    snippets: WebSnippetInput[],
    collectionName = 'insightforge_research',
  ): Promise<IngestionResult> {
    if (!sessionId) {
      throw new Error('sessionId is required for web snippet ingestion');
    }
    if (!snippets || snippets.length === 0) {
      return {
        source: 'web_search',
        sourceType: 'web',
        chunksCount: 0,
        totalTokens: 0,
        chunkIds: [],
      };
    }

    const allChunks = [];

    // Chunk each snippet
    for (let i = 0; i < snippets.length; i++) {
      const item = snippets[i];
      const combinedText = `Title: ${item.title}\nURL: ${item.url}\n\n${item.snippet}`;

      const chunks = chunkText(combinedText, {
        sessionId,
        source: item.url,
        sourceType: 'web',
        title: item.title,
      });

      allChunks.push(...chunks);
    }

    if (allChunks.length === 0) {
      return {
        source: 'web_search',
        sourceType: 'web',
        chunksCount: 0,
        totalTokens: 0,
        chunkIds: [],
      };
    }

    // Batched embedding
    const chunkTexts = allChunks.map((c) => c.text);
    const { embeddings, model: embeddingModel } = await EmbeddingService.embedBatchWithModel(chunkTexts);

    // Store in Vector DB
    const collection = vectorStore.getOrCreateCollection(collectionName);
    await collection.add({
      ids: allChunks.map((c) => c.id),
      embeddings,
      embeddingModel,
      metadatas: allChunks.map((c) => c.metadata),
      documents: chunkTexts,
    });

    const totalTokens = allChunks.reduce((acc, c) => acc + c.tokens, 0);

    return {
      source: 'web_search',
      sourceType: 'web',
      chunksCount: allChunks.length,
      totalTokens,
      chunkIds: allChunks.map((c) => c.id),
    };
  }

  /**
   * Ingests raw text (e.g. documentation, articles, reference notes)
   */
  public static async ingestRawText(
    sessionId: string,
    text: string,
    sourceName: string,
    title?: string,
    collectionName = 'insightforge_research',
  ): Promise<IngestionResult> {
    if (!sessionId) {
      throw new Error('sessionId is required for text ingestion');
    }
    if (!text.trim()) {
      throw new Error('Raw text cannot be empty');
    }

    const chunks = chunkText(text, {
      sessionId,
      source: sourceName,
      sourceType: 'text',
      title: title || sourceName,
    });

    const chunkTexts = chunks.map((c) => c.text);
    const { embeddings, model: embeddingModel } = await EmbeddingService.embedBatchWithModel(chunkTexts);

    const collection = vectorStore.getOrCreateCollection(collectionName);
    await collection.add({
      ids: chunks.map((c) => c.id),
      embeddings,
      embeddingModel,
      metadatas: chunks.map((c) => c.metadata),
      documents: chunkTexts,
    });

    const totalTokens = chunks.reduce((acc, c) => acc + c.tokens, 0);

    return {
      source: sourceName,
      sourceType: 'text',
      chunksCount: chunks.length,
      totalTokens,
      chunkIds: chunks.map((c) => c.id),
    };
  }
}
