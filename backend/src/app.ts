import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './errors/AppError.js';

export const createApp = (): Application => {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: [config.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Welcome Root Endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'InsightForge-AI Backend API',
      version: '0.1.0',
      status: 'active',
      endpoints: {
        health: '/api/health',
        sessions: '/api/sessions',
      },
    });
  });

  // Routes
  app.use('/api', apiRouter);

  // 404 Catch-All Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' not found`));
  });

  // Centralized Error-Handling Middleware
  app.use(errorHandler);

  return app;
};
