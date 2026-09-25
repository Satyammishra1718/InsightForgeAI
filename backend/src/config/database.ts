import mongoose from 'mongoose';
import { config } from './index.js';

let isConnected = false;

export async function connectDatabase(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || config.mongoUri;

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log(`[MongoDB] Successfully connected to database: ${mongoose.connection.name}`);
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[MongoDB] Disconnected from database');
    });

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    isConnected = true;
    console.log(
      `[MongoDB] Startup connection established: ${uri.replace(/\/\/.*@/, '//<credentials>@')}`,
    );
    return conn;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[MongoDB] Graceful error handler: Failed to connect to MongoDB at ${uri}: ${message}`,
    );
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Disconnected successfully');
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
