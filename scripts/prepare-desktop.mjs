import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'desktop-dist');

fs.mkdirSync(outDir, { recursive: true });

const pkg = {
  name: 'complete-a-musica-catalogo',
  productName: 'Complete a Musica - Catalogo',
  version: '1.0.0',
  main: 'main.cjs',
};

fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify(pkg, null, 2) + '\n',
  'utf8'
);

fs.copyFileSync(
  path.join(rootDir, 'electron', 'main.cjs'),
  path.join(outDir, 'main.cjs')
);
fs.copyFileSync(
  path.join(rootDir, 'electron', 'preload.cjs'),
  path.join(outDir, 'preload.cjs')
);

console.log('[prepare-desktop] Arquivos Electron preparados em desktop-dist/');
