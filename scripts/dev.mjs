import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const serverProc = spawn(process.execPath, [path.join(rootDir, 'server', 'index.mjs')], {
  cwd: rootDir,
  stdio: 'inherit',
});

const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const viteProc = spawn(process.execPath, [viteBin, '--host', '127.0.0.1'], {
  cwd: rootDir,
  stdio: 'inherit',
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!serverProc.killed) serverProc.kill();
  if (!viteProc.killed) viteProc.kill();
  process.exit(code);
}

serverProc.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

viteProc.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
