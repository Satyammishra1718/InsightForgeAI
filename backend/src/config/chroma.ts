import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChromaClient } from 'chromadb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

let client: ChromaClient | null = null;
let chromaProcess: ChildProcess | null = null;
let ensurePromise: Promise<void> | null = null;

export function getChromaUrl(): URL {
  return new URL(process.env.CHROMA_URL || 'http://127.0.0.1:8001');
}

export function getChromaClient(): ChromaClient {
  if (!client) {
    const url = getChromaUrl();
    client = new ChromaClient({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      ssl: url.protocol === 'https:',
    });
  }
  return client;
}

export async function isChromaAlive(): Promise<boolean> {
  try {
    await getChromaClient().heartbeat();
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the `chroma` server CLI. Chroma's server ships with the Python `chromadb` package;
 * `npm run setup:python` installs it into agent-service/venv.
 */
function findChromaBinary(): string | null {
  const candidates = [
    process.env.CHROMA_BIN,
    path.join(REPO_ROOT, 'agent-service/venv/Scripts/chroma.exe'),
    path.join(REPO_ROOT, 'agent-service/venv/bin/chroma'),
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Ensures a ChromaDB server is reachable. If none is running at CHROMA_URL (and the URL is
 * local), starts one from the agent-service virtualenv, persisting to CHROMA_DATA_DIR.
 */
export function ensureChromaServer(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await isChromaAlive()) return;

      const url = getChromaUrl();
      const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
      const bin = isLocal ? findChromaBinary() : null;
      if (!bin) {
        throw new Error(
          `ChromaDB is not reachable at ${url.origin}. Start it with "npm run chroma" ` +
            '(after "npm run setup:python"), or point CHROMA_URL at a running server.',
        );
      }

      const dataDir = path.resolve(REPO_ROOT, process.env.CHROMA_DATA_DIR || 'data/chroma');
      console.log(`[Chroma] Starting local ChromaDB server on ${url.origin} (data: ${dataDir})`);
      chromaProcess = spawn(
        bin,
        ['run', '--path', dataDir, '--host', url.hostname, '--port', url.port || '8001'],
        { stdio: 'ignore', detached: false },
      );
      chromaProcess.on('error', (e) => console.warn('[Chroma] Failed to start server:', e.message));

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await isChromaAlive()) {
          console.log('[Chroma] Local ChromaDB server is ready.');
          return;
        }
      }
      throw new Error(`ChromaDB server did not become ready at ${url.origin}`);
    })();
    // Allow a later retry if startup failed.
    ensurePromise.catch(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}

export function stopChromaServer(): void {
  if (chromaProcess) {
    try {
      chromaProcess.kill();
    } catch {
      // ignore
    }
    chromaProcess = null;
  }
}
