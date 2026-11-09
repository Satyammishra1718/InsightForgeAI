import { isDatabaseConnected, getDatabaseInfo, DatabaseMode } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  database: 'connected' | 'disconnected';
  databaseMode: DatabaseMode;
  databaseUri?: string;
  services: {
    mongodb: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
  timestamp: string;
  uptime: number;
  environment: string;
}

async function checkRedis(timeoutMs = 1000): Promise<'connected' | 'disconnected'> {
  try {
    const client = await getRedisClient();
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return pong === 'PONG' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

export class HealthService {
  public static async getHealth(): Promise<HealthStatus> {
    const dbInfo = getDatabaseInfo();
    const mongodb = isDatabaseConnected() ? 'connected' : 'disconnected';
    const redis = await checkRedis();
    return {
      // Redis backs the job queue, cache and live progress; Mongo stores sessions.
      // Either being down means the API is up but cannot do its job.
      status: mongodb === 'connected' && redis === 'connected' ? 'ok' : 'degraded',
      database: mongodb,
      databaseMode: dbInfo.mode,
      // Never expose credentials embedded in a connection string.
      databaseUri: dbInfo.uri ? dbInfo.uri.replace(/\/\/[^@/]*@/, '//<credentials>@') : dbInfo.uri,
      services: { mongodb, redis },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
