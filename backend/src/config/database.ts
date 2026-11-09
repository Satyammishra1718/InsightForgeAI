import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from './index.js';

export type DatabaseMode = 'atlas' | 'local' | 'embedded' | 'disconnected';

interface DatabaseInfo {
  connected: boolean;
  mode: DatabaseMode;
  uri: string;
}

let isConnected = false;
let databaseMode: DatabaseMode = 'disconnected';
let activeUri = '';
let embeddedServer: MongoMemoryServer | null = null;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ConnectOptions {
  /**
   * Keep the embedded MongoDB's data on disk (MONGODB_DATA_DIR, default data/mongo) so research
   * history survives restarts. Only the long-running server should set this: one data directory
   * can't be shared by two mongod processes, so test scripts use a throwaway in-memory instance.
   */
  persistEmbedded?: boolean;
}

/**
 * Connect to MongoDB with intelligent dual-mode support:
 * 1. Checks if offline/embedded mode is forced via FORCE_LOCAL_DB / MONGODB_OFFLINE.
 * 2. Attempts to connect to primary MONGODB_URI (e.g. Atlas / remote) with a fast 3-second probe.
 * 3. If primary connection fails (common on restricted college/corporate WiFi blocking port 27017),
 *    automatically spins up a local embedded MongoDB instance.
 */
export async function connectDatabase(
  customUri?: string,
  options: ConnectOptions = {},
): Promise<typeof mongoose> {
  const targetUri = customUri || config.mongoUri;

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Setup connection event loggers once
  mongoose.connection.removeAllListeners('connected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log(`[MongoDB] Active database connection confirmed (${databaseMode} mode).`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error event:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    databaseMode = 'disconnected';
    console.warn('[MongoDB] Connection disconnected.');
  });

  // Check if forced embedded mode is requested
  const forceEmbedded =
    process.env.FORCE_LOCAL_DB === 'true' || process.env.MONGODB_OFFLINE === 'true';

  if (!forceEmbedded && targetUri) {
    try {
      console.log(
        `[MongoDB] Probing primary database connection (${targetUri.replace(/\/\/.*@/, '//<credentials>@')})...`,
      );
      const conn = await mongoose.connect(targetUri, {
        serverSelectionTimeoutMS: 3000, // 3-second fast probe for quick failover
        autoIndex: true,
      });

      isConnected = true;
      databaseMode =
        targetUri.includes('mongodb+srv') || targetUri.includes('mongodb.net') ? 'atlas' : 'local';
      activeUri = targetUri;

      console.log(
        `[MongoDB] Successfully connected to primary MongoDB (${databaseMode.toUpperCase()})!`,
      );
      return conn;
    } catch (primaryError) {
      const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
      console.warn(
        `[MongoDB] Primary connection unreachable (${errorMsg}).\n` +
          `[MongoDB] College WiFi or firewall is blocking outgoing port 27017 or DNS SRV.\n` +
          `[MongoDB] Initiating automatic seamless fallback to local embedded MongoDB instance...`,
      );
    }
  }

  // Fallback: Start embedded local MongoDB instance
  return await startEmbeddedDatabase(options.persistEmbedded ?? false);
}

/**
 * Starts a local embedded MongoDB server
 */
async function startEmbeddedDatabase(persist: boolean): Promise<typeof mongoose> {
  try {
    if (!embeddedServer) {
      if (persist) {
        const dbPath = path.resolve(REPO_ROOT, process.env.MONGODB_DATA_DIR || 'data/mongo');
        fs.mkdirSync(dbPath, { recursive: true });
        console.log(`[MongoDB] Starting local embedded MongoDB instance (data: ${dbPath})...`);
        embeddedServer = await MongoMemoryServer.create({
          instance: { dbPath, storageEngine: 'wiredTiger' },
        });
      } else {
        console.log('[MongoDB] Starting local embedded MongoDB instance (in-memory)...');
        embeddedServer = await MongoMemoryServer.create();
      }
    }

    const embeddedUri = embeddedServer.getUri();
    activeUri = embeddedUri;
    databaseMode = 'embedded';

    const conn = await mongoose.connect(embeddedUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    isConnected = true;
    console.log(
      `[MongoDB] Embedded local MongoDB successfully running and connected at ${embeddedUri}`,
    );

    return conn;
  } catch (embeddedError) {
    const msg = embeddedError instanceof Error ? embeddedError.message : String(embeddedError);
    console.error(`[MongoDB] Critical: Failed to start embedded local MongoDB: ${msg}`);
    isConnected = false;
    databaseMode = 'disconnected';
    throw embeddedError;
  }
}

/**
 * Disconnects Mongoose and stops embedded database if running
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    databaseMode = 'disconnected';
  }

  if (embeddedServer) {
    await embeddedServer.stop();
    embeddedServer = null;
    console.log('[MongoDB] Embedded database server stopped.');
  }

  console.log('[MongoDB] All database resources released.');
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getDatabaseInfo(): DatabaseInfo {
  return {
    connected: isDatabaseConnected(),
    mode: databaseMode,
    uri: activeUri.replace(/\/\/.*@/, '//<credentials>@'),
  };
}
