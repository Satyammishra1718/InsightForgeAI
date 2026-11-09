import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first, fallback to local backend .env if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  mongoUri: string;
  redisUrl: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  mcpWebSearchUrl: string;
  mcpDocRetrievalUrl: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/insightforge',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  mcpWebSearchUrl: process.env.MCP_WEB_SEARCH_URL || 'http://localhost:4001/sse',
  mcpDocRetrievalUrl: process.env.MCP_DOC_RETRIEVAL_URL || 'http://localhost:4002/sse',
};
