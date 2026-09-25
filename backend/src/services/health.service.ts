import { isDatabaseConnected } from '../config/database.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  database: 'connected' | 'disconnected';
  timestamp: string;
  uptime: number;
  environment: string;
}

export class HealthService {
  public static getHealth(): HealthStatus {
    const dbConnected = isDatabaseConnected();
    return {
      status: 'ok',
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
