import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service.js';
import { CreateSessionInput, ListSessionsQuery } from '../validators/session.validator.js';
import { enqueueResearchJob } from '../queue/research.queue.js';
import { SemanticCacheService } from '../services/semanticCache.service.js';
import { Report, ResearchSession } from '../models/index.js';

export const createSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = req.body as CreateSessionInput;
    const session = await SessionService.createSession(input);
    res.status(201).json({
      session,
    });
  } catch (error) {
    next(error);
  }
};

export const listSessions = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = req.query as unknown as ListSessionsQuery;
    const result = await SessionService.listSessions(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getSessionById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const session = await SessionService.getSessionById(id);
    res.status(200).json({
      session,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const result = await SessionService.deleteSession(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/sessions/:id/run
 * Checks semantic cache first, otherwise enqueues asynchronous research job in BullMQ
 * and returns { status: "queued", jobId, sessionId } immediately.
 */
export const runSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const session = await SessionService.getSessionById(id);
    const cacheable = req.body?.cacheable !== false;

    // 1. Semantic Cache Check (in Node.js before enqueueing)
    if (cacheable) {
      const cacheResult = await SemanticCacheService.checkSemanticCache(session.query, 0.80);
      if (cacheResult.hit && cacheResult.report) {
        // Persist cached report for this session in MongoDB
        const reportDoc = await Report.findOneAndUpdate(
          { sessionId: id },
          {
            sessionId: id,
            content: cacheResult.report.content,
            sources: cacheResult.report.sources,
            createdAt: new Date(),
          },
          { upsert: true, returnDocument: 'after' },
        );

        // Update session status to completed
        const updatedSession = await ResearchSession.findByIdAndUpdate(
          id,
          { status: 'completed', updatedAt: new Date() },
          { returnDocument: 'after' },
        );

        res.status(200).json({
          message: 'Semantic cache hit! Returning cached research report.',
          status: 'completed',
          cached: true,
          similarity: cacheResult.similarity,
          matchedQuery: cacheResult.matchedQuery,
          session: updatedSession || session,
          report: reportDoc,
        });
        return;
      }
    }

    // 2. Enqueue Job in BullMQ
    const { jobId } = await enqueueResearchJob(id, session.query, cacheable);

    res.status(202).json({
      message: 'Research pipeline job successfully queued.',
      status: 'queued',
      jobId,
      sessionId: id,
    });
  } catch (error) {
    next(error);
  }
};
