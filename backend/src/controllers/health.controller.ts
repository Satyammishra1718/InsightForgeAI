import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service.js';

export const getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await HealthService.getHealth();
    res.status(200).json(health);
  } catch (error) {
    next(error);
  }
};
