import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service.js';
import { CreateSessionInput, ListSessionsQuery } from '../validators/session.validator.js';

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
