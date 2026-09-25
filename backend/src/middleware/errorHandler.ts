import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // If response has already started sending
  if (res.headersSent) {
    return _next(err);
  }

  // 1. Handled AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // 2. Malformed JSON Body Parse Error (e.g. from express.json)
  if (err instanceof SyntaxError && ('body' in err || 'status' in err)) {
    res.status(400).json({
      error: {
        message: 'Malformed JSON payload in request body',
        code: 'INVALID_JSON',
      },
    });
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const issues =
      (err as unknown as { issues?: Array<{ path?: (string | number)[]; message: string }> })
        .issues || [];
    const formattedMessage =
      issues.length > 0
        ? issues
            .map((e) =>
              e.path && e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message,
            )
            .join(', ')
        : err.message;

    res.status(400).json({
      error: {
        message: formattedMessage,
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  // 3. Mongoose Cast Error (e.g. invalid ObjectId format)
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        message: `Invalid ID format for field '${err.path}'`,
        code: 'INVALID_ID',
      },
    });
    return;
  }

  // 4. Mongoose Schema Validation Error
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');

    res.status(400).json({
      error: {
        message: messages,
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  // 5. Unhandled / generic server errors
  console.error('[UnhandledError]', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}
