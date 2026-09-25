import { Request, Response } from 'express';
import { HealthService } from '../services/health.service.js';

export const getHealth = (_req: Request, res: Response): void => {
  const health = HealthService.getHealth();
  res.status(200).json(health);
};
