import { isDatabaseConnected, getDatabaseInfo, DatabaseMode } from '../config/database.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  database: 'connected' | 'disconnected';
  databaseMode: DatabaseMode;
  databaseUri?: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

export class HealthService {
  public static getHealth(): HealthStatus {
    const dbInfo = getDatabaseInfo();
    const dbConnected = isDatabaseConnected();
    return {
      status: 'ok',
      database: dbConnected ? 'connected' : 'disconnected',
      databaseMode: dbInfo.mode,
      databaseUri: dbInfo.uri,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
