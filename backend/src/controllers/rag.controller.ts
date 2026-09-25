import { Request, Response, NextFunction } from 'express';
import { IngestionPipeline, retrieveContext, WebSnippetInput } from '../rag/index.js';
import { BadRequestError } from '../errors/AppError.js';

export const uploadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = req.file;
    const sessionId = req.body.sessionId;

    if (!file) {
      throw new BadRequestError('PDF file is required in "file" field');
    }
    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }

    const result = await IngestionPipeline.ingestPdf(sessionId, file.buffer, file.originalname);
    res.status(201).json({
      message: 'PDF ingested and indexed successfully',
      result,
    });
  } catch (error) {
    next(error);
  }
};

export const ingestSnippets = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { sessionId, snippets } = req.body as {
      sessionId: string;
      snippets: WebSnippetInput[];
    };

    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }
    if (!Array.isArray(snippets) || snippets.length === 0) {
      throw new BadRequestError('snippets array is required');
    }

    const result = await IngestionPipeline.ingestWebSnippets(sessionId, snippets);
    res.status(201).json({
      message: 'Web snippets ingested and indexed successfully',
      result,
    });
  } catch (error) {
    next(error);
  }
};

export const ingestText = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { sessionId, text, sourceName, title } = req.body as {
      sessionId: string;
      text: string;
      sourceName: string;
      title?: string;
    };

    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }
    if (!text || !text.trim()) {
      throw new BadRequestError('text is required');
    }

    const result = await IngestionPipeline.ingestRawText(
      sessionId,
      text,
      sourceName || 'document',
      title,
    );

    res.status(201).json({
      message: 'Raw text ingested and indexed successfully',
      result,
    });
  } catch (error) {
    next(error);
  }
};

export const queryContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { sessionId, query, topK } = req.body as {
      sessionId: string;
      query: string;
      topK?: number;
    };

    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }
    if (!query || !query.trim()) {
      throw new BadRequestError('query is required');
    }

    const results = await retrieveContext(sessionId, query, topK || 5);
    res.status(200).json({
      sessionId,
      query,
      resultsCount: results.length,
      results,
    });
  } catch (error) {
    next(error);
  }
};
