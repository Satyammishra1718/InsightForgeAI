import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service.js';
import { CreateSessionInput, ListSessionsQuery } from '../validators/session.validator.js';
import { runResearchPipeline } from '../agents/orchestrator.js';

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
 * Triggers the multi-agent research pipeline for an existing session
 */
export const runSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const session = await SessionService.getSessionById(id);

    const result = await runResearchPipeline(id, session.query);

    res.status(200).json({
      message: 'Research pipeline completed successfully',
      session: result.session,
      report: result.report,
      state: {
        sessionId: result.state.sessionId,
        originalQuery: result.state.originalQuery,
        subQuestions: result.state.subQuestions,
        researchFindings: result.state.researchFindings,
        verifiedClaims: result.state.verifiedClaims,
        finalReport: result.state.finalReport,
      },
    });
  } catch (error) {
    next(error);
  }
};
