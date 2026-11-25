import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { canonicalSongKey, normalizeWord, stripEditionSuffix } from './catalogUtils.mjs';

const ALLOWED_TAGS = new Set(['pt', 'en', 'es', 'rock_pop', 'classics']);
const MAX_BODY_BYTES = 64 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function setApiCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Key'
  );
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }
  const headerKey = req.headers['x-admin-key'];
  if (typeof headerKey === 'string') {
    return headerKey.trim();
  }
  return '';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createCatalogServer({ catalogPath, adminKey, staticDir }) {
  const resolvedCatalogPath = path.resolve(catalogPath);
  const resolvedStaticDir = staticDir ? path.resolve(staticDir) : null;
  let writeQueue = Promise.resolve();

  function withWriteLock(fn) {
    const run = writeQueue.then(fn, fn);
    writeQueue = run.catch(() => {});
    return run;
  }

  function isAuthorized(req) {
    if (!adminKey || typeof adminKey !== 'string' || adminKey.length === 0) {
      return false;
    }
    const token = extractToken(req);
    if (!token) {
      return false;
    }
    return crypto.timingSafeEqual(sha256(token), sha256(adminKey));
  }

  async function readCatalog() {
    try {
      const raw = await fs.readFile(resolvedCatalogPath, 'utf8');
      if (!raw.trim()) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async function writeCatalog(tracks) {
    await fs.mkdir(path.dirname(resolvedCatalogPath), { recursive: true });
    const tmpPath = `${resolvedCatalogPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    await fs.writeFile(tmpPath, JSON.stringify(tracks, null, 2) + '\n', 'utf8');
    await fs.rename(tmpPath, resolvedCatalogPath);
  }

  async function serveStatic(req, res, pathname) {
    if (!resolvedStaticDir || !fsSync.existsSync(resolvedStaticDir)) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = path.resolve(resolvedStaticDir, relativePath);
    if (!filePath.startsWith(resolvedStaticDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      filePath = path.join(resolvedStaticDir, 'index.html');
    }

    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = reqUrl.pathname;
      const method = (req.method || 'GET').toUpperCase();

      if (pathname.startsWith('/api')) {
        setApiCorsHeaders(res);

        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (method === 'GET' && pathname === '/api/health') {
          sendJson(res, 200, { ok: true });
          return;
        }

        if (method === 'GET' && pathname === '/api/catalog') {
          const tracks = await readCatalog();
          sendJson(res, 200, { tracks, total: tracks.length });
          return;
        }

        if (method === 'POST' && pathname === '/api/auth/verify') {
          if (!isAuthorized(req)) {
            sendJson(res, 401, { error: 'Chave de acesso inválida.' });
            return;
          }
          const tracks = await readCatalog();
          sendJson(res, 200, { ok: true, total: tracks.length });
          return;
        }

        if (method === 'POST' && pathname === '/api/catalog') {
          if (!isAuthorized(req)) {
            sendJson(res, 401, {
              error: 'Não autorizado. Use o aplicativo Desktop com uma chave válida.',
            });
            return;
          }

          let body;
          try {
            body = await readJsonBody(req);
          } catch (err) {
            if (err instanceof Error && err.message === 'PAYLOAD_TOO_LARGE') {
              sendJson(res, 413, { error: 'Payload muito grande.' });
              return;
            }
            sendJson(res, 400, { error: 'JSON inválido.' });
            return;
          }

          const rawArtist = typeof body.artist === 'string' ? body.artist.trim() : '';
          const rawTrack = typeof body.track === 'string' ? body.track.trim() : '';
          const lang =
            body.lang === 'pt' || body.lang === 'en' || body.lang === 'es'
              ? body.lang
              : null;

          if (!rawArtist || !rawTrack || !lang) {
            sendJson(res, 400, {
              error:
                'Campos obrigatórios inválidos: informe artista, música e idioma (pt/en/es).',
            });
            return;
          }

          const artistNorm = normalizeWord(rawArtist);
          const cleanedTrack = stripEditionSuffix(rawTrack);
          const trackNorm = normalizeWord(cleanedTrack);

          if (!artistNorm || !trackNorm) {
            sendJson(res, 400, {
              error: 'Artista e nome da música devem conter letras ou números válidos.',
            });
            return;
          }

          const rawTags = Array.isArray(body.tags) ? body.tags : [];
          const filteredTags = rawTags.filter(
            (tag) => typeof tag === 'string' && ALLOWED_TAGS.has(tag)
          );
          const tags = Array.from(new Set([lang, ...filteredTags]));

          const newKey = canonicalSongKey(rawArtist, cleanedTrack);
          const exactRawKey = `${artistNorm}::${normalizeWord(rawTrack)}`;

          const result = await withWriteLock(async () => {
            const tracks = await readCatalog();
            const existing = tracks.find(
              (item) =>
                item.id === newKey ||
                canonicalSongKey(item.artist, item.track) === newKey ||
                `${normalizeWord(item.artist)}::${normalizeWord(item.track)}` === exactRawKey
            );

            if (existing) {
              return { status: 409, existing };
            }

            const created = {
              id: newKey,
              artist: rawArtist,
              track: cleanedTrack,
              lang,
              tags,
              addedAt: new Date().toISOString(),
            };
            const nextTracks = [...tracks, created];
            await writeCatalog(nextTracks);
            return { status: 201, created, total: nextTracks.length };
          });

          if (result.status === 409) {
            sendJson(res, 409, {
              error: `Esta música já existe no catálogo: ${result.existing.artist} — ${result.existing.track}`,
              existingTrack: result.existing,
            });
            return;
          }

          sendJson(res, 201, { track: result.created, total: result.total });
          return;
        }

        if (method === 'DELETE' && pathname.startsWith('/api/catalog/')) {
          if (!isAuthorized(req)) {
            sendJson(res, 401, {
              error: 'Não autorizado. Use o aplicativo Desktop com uma chave válida.',
            });
            return;
          }

          const targetId = decodeURIComponent(pathname.slice('/api/catalog/'.length));
          if (!targetId) {
            sendJson(res, 400, { error: 'ID inválido.' });
            return;
          }

          const result = await withWriteLock(async () => {
            const tracks = await readCatalog();
            const idx = tracks.findIndex((item) => item.id === targetId);
            if (idx === -1) {
              return { status: 404 };
            }
            const nextTracks = tracks.filter((_, i) => i !== idx);
            await writeCatalog(nextTracks);
            return { status: 200, total: nextTracks.length };
          });

          if (result.status === 404) {
            sendJson(res, 404, { error: 'Música não encontrada no catálogo.' });
            return;
          }

          sendJson(res, 200, { removed: true, total: result.total });
          return;
        }

        sendJson(res, 404, { error: 'Rota da API não encontrada.' });
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        await serveStatic(req, res, pathname);
        return;
      }

      res.writeHead(405);
      res.end('Method Not Allowed');
    } catch (err) {
      console.error('Erro no servidor de catálogo:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Erro interno do servidor.' });
      } else {
        res.end();
      }
    }
  });

  return server;
}
