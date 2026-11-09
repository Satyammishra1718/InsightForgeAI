#!/usr/bin/env node
/**
 * Run an executable from agent-service/venv without activating the virtualenv.
 *
 *   node scripts/venv.mjs [--cwd <dir>] <executable> [args...]
 *
 * Examples:
 *   node scripts/venv.mjs --cwd agent-service python -m uvicorn app.main:app --port 8000
 *   node scripts/venv.mjs chroma run --path data/chroma --port 8001
 *
 * Special command `setup` creates the venv (if missing) and installs requirements.txt.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venv = path.join(root, 'agent-service', 'venv');
const isWin = process.platform === 'win32';
const binDir = path.join(venv, isWin ? 'Scripts' : 'bin');
const exe = (name) => path.join(binDir, isWin ? `${name}.exe` : name);

let args = process.argv.slice(2);
let cwd = root;
if (args[0] === '--cwd') {
  cwd = path.resolve(root, args[1]);
  args = args.slice(2);
}

if (args[0] === 'setup') {
  if (!existsSync(exe('python'))) {
    const sysPython = isWin ? 'python' : 'python3';
    console.log(`[venv] Creating virtualenv at ${venv} with ${sysPython}...`);
    const made = spawnSync(sysPython, ['-m', 'venv', venv], { stdio: 'inherit' });
    if (made.status !== 0) process.exit(made.status ?? 1);
  }
  const req = path.join(root, 'agent-service', 'requirements.txt');
  const pip = spawnSync(exe('python'), ['-m', 'pip', 'install', '-r', req], { stdio: 'inherit' });
  process.exit(pip.status ?? 1);
}

const [name, ...rest] = args;
if (!name) {
  console.error('usage: node scripts/venv.mjs [--cwd <dir>] <executable> [args...]');
  process.exit(2);
}
const bin = exe(name);
if (!existsSync(bin)) {
  console.error(`[venv] ${bin} not found. Run "npm run setup:python" first.`);
  process.exit(1);
}

// Unbuffered output: under `npm run dev` stdout is a pipe, and Python (including uvicorn's
// reloader subprocess) would otherwise hold log lines in a buffer instead of streaming them.
const child = spawn(bin, rest, { cwd, stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1' } });
const forward = (sig) => () => child.kill(sig);
process.on('SIGINT', forward('SIGINT'));
process.on('SIGTERM', forward('SIGTERM'));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
