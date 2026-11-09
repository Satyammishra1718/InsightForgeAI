import { Redis, RedisOptions } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let primaryClient: Redis | null = null;
let subscriberClient: Redis | null = null;
let localRedisProcess: ChildProcess | null = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6380';

function parseRedisOptions(urlStr: string): RedisOptions {
  try {
    const url = new URL(urlStr);
    return {
      host: url.hostname || '127.0.0.1',
      port: parseInt(url.port || '6380', 10),
      password: url.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 6380,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

export function getRedisConnectionOptions(): RedisOptions {
  return parseRedisOptions(REDIS_URL);
}

/**
 * BullMQ accepts plain ioredis options at runtime (it creates its own connections), but its
 * v6 typings only declare client instances. This narrow cast documents that interop.
 */
export function getBullMQConnection(): ConnectionOptions {
  return parseRedisOptions(REDIS_URL) as unknown as ConnectionOptions;
}

/**
 * Ensures a Redis instance is available. If the configured Redis is not running
 * and local portable redis-server.exe is found, it automatically starts it.
 */
export async function ensureRedisServer(): Promise<void> {
  const options = parseRedisOptions(REDIS_URL);

  // Fast probe to check if already running
  try {
    const probe = new Redis({
      ...options,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // don't retry on initial probe
    });
    // A refused connection is the expected outcome when Redis isn't running yet; handle it
    // here so ioredis doesn't log an "Unhandled error event" stack trace.
    probe.on('error', () => undefined);

    await probe.ping();
    await probe.quit();
    console.log(`[Redis] Connected to active Redis server at ${options.host}:${options.port}`);
    return;
  } catch {
    console.log(`[Redis] Server not running at ${options.host}:${options.port}. Checking local binary fallback...`);
  }

  // Check for local redis-server.exe (Windows portable binary in redis-bin)
  const candidatePaths = [
    path.resolve(__dirname, '../../redis-bin/redis-server.exe'),
    path.resolve(__dirname, '../../../redis-bin/redis-server.exe'),
    path.resolve(process.cwd(), 'redis-bin/redis-server.exe'),
    path.resolve(process.cwd(), 'backend/redis-bin/redis-server.exe'),
  ];

  const exePath = candidatePaths.find((p) => fs.existsSync(p));
  if (exePath && !localRedisProcess) {
    console.log(`[Redis] Spawning local embedded Redis server: ${exePath}`);
    localRedisProcess = spawn(exePath, ['--port', String(options.port || 6380), '--bind', '127.0.0.1'], {
      stdio: 'ignore',
      detached: false,
    });

    localRedisProcess.on('error', (e) => {
      console.warn(`[Redis] Failed to spawn local redis-server:`, e.message);
    });

    // Wait for Redis server to accept connections
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const testClient = new Redis({
          ...options,
          connectTimeout: 500,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        });
        testClient.on('error', () => undefined);
        await testClient.ping();
        await testClient.quit();
        console.log(`[Redis] Embedded Redis server started successfully on port ${options.port}`);
        return;
      } catch {
        // keep waiting
      }
    }
  }
}

/**
 * Creates a new dedicated Redis connection with BullMQ-compatible settings.
 */
export function createRedisClient(): Redis {
  const options = parseRedisOptions(REDIS_URL);
  return new Redis(options);
}

/**
 * Returns a shared primary Redis client for general caching / key-value operations.
 */
export async function getRedisClient(): Promise<Redis> {
  if (!primaryClient) {
    await ensureRedisServer();
    primaryClient = createRedisClient();
  }
  return primaryClient;
}

/**
 * Returns a dedicated Redis subscriber connection for WebSocket pub/sub.
 */
export async function getRedisSubscriber(): Promise<Redis> {
  if (!subscriberClient) {
    await ensureRedisServer();
    subscriberClient = createRedisClient();
  }
  return subscriberClient;
}

/**
 * Gracefully shuts down all Redis clients and child processes.
 */
export async function closeRedis(): Promise<void> {
  if (primaryClient) {
    await primaryClient.quit().catch(() => null);
    primaryClient = null;
  }
  if (subscriberClient) {
    await subscriberClient.quit().catch(() => null);
    subscriberClient = null;
  }
  if (localRedisProcess) {
    try {
      localRedisProcess.kill();
    } catch {
      // ignore
    }
    localRedisProcess = null;
  }
  console.log('[Redis] All Redis connections and local processes closed.');
}
