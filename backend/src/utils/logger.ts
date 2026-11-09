import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'insightforge-backend',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Creates a child logger with a bound sessionId for distributed trace correlation
 */
export function createSessionLogger(sessionId: string, extra: Record<string, unknown> = {}) {
  return logger.child({ sessionId, ...extra });
}
