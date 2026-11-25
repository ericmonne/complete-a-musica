import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogServer } from './catalogServer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, '.env'));

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const adminKey = process.env.CATALOG_ADMIN_KEY || '';
const catalogPath = path.join(rootDir, 'public', 'catalog.json');
const staticDir = path.join(rootDir, 'dist');

if (!adminKey) {
  console.warn(
    '[Catalog Server] AVISO: CATALOG_ADMIN_KEY não está definida no .env — rotas administrativas retornarão 401.'
  );
}

const server = createCatalogServer({ catalogPath, adminKey, staticDir });

server.listen(port, host, () => {
  console.log(`[Catalog Server] Rodando em http://${host}:${port}`);
});
