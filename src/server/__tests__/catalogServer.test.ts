// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalSongKey as clientCanonicalSongKey } from '../../engine/normalize';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore ESM helper module
import { createCatalogServer } from '../../../server/catalogServer.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore ESM helper module
import { canonicalSongKey as serverCanonicalSongKey } from '../../../server/catalogUtils.mjs';

const ADMIN_KEY = 'test-secret-admin-key-123';

describe('Catalog API Server & Duplicate Prevention', () => {
  let tmpDir: string;
  let catalogPath: string;
  let server: ReturnType<typeof createCatalogServer>;
  let baseUrl: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cam-catalog-test-'));
    catalogPath = path.join(tmpDir, 'catalog.json');
    await fs.writeFile(
      catalogPath,
      JSON.stringify([
        {
          id: 'legiaourbana::tempoperdido',
          artist: 'Legião Urbana',
          track: 'Tempo Perdido',
          lang: 'pt',
          tags: ['pt', 'rock_pop'],
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      'utf8'
    );

    server = createCatalogServer({
      catalogPath,
      adminKey: ADMIN_KEY,
      staticDir: null,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral server port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces identical canonical keys in client TypeScript and server ESM utilities', () => {
    const samples: Array<[string, string]> = [
      ['Legião Urbana', 'Tempo Perdido'],
      ['legiao urbana', 'TEMPO PERDIDO - Remastered 2011'],
      ['Queen', "Don't Stop Me Now (2011 Remaster)"],
      ['Chitãozinho & Xororó', 'Evidências (Ao Vivo)'],
    ];

    for (const [artist, track] of samples) {
      expect(serverCanonicalSongKey(artist, track)).toBe(
        clientCanonicalSongKey(artist, track)
      );
    }
  });

  it('allows GET /api/catalog without authentication', async () => {
    const res = await fetch(`${baseUrl}/api/catalog`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tracks: unknown[]; total: number };
    expect(data.total).toBe(1);
    expect(data.tracks).toHaveLength(1);
  });

  it('rejects POST /api/catalog without valid admin key (401)', async () => {
    const resMissing = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: 'Cazuza',
        track: 'Exagerado',
        lang: 'pt',
        tags: ['pt', 'rock_pop'],
      }),
    });
    expect(resMissing.status).toBe(401);

    const resWrong = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key',
      },
      body: JSON.stringify({
        artist: 'Cazuza',
        track: 'Exagerado',
        lang: 'pt',
        tags: ['pt', 'rock_pop'],
      }),
    });
    expect(resWrong.status).toBe(401);
  });

  it('adds a new song with valid key and rejects exact, accent/case, and remaster duplicates with 409', async () => {
    const createRes = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        artist: 'Gilberto Gil',
        track: 'Aquele Abraço',
        lang: 'pt',
        tags: ['pt', 'classics'],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { total: number; track: { id: string } };
    expect(created.total).toBe(2);

    // Exact duplicate
    const dupExact = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        artist: 'Legião Urbana',
        track: 'Tempo Perdido',
        lang: 'pt',
        tags: ['pt'],
      }),
    });
    expect(dupExact.status).toBe(409);

    // Case / accent / cedilla duplicate
    const dupAccent = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        artist: 'legiao urbana',
        track: 'TEMPO PERDIDO',
        lang: 'pt',
        tags: ['pt'],
      }),
    });
    expect(dupAccent.status).toBe(409);

    // Remaster suffix duplicate
    const dupRemaster = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        artist: 'Legião Urbana',
        track: 'Tempo Perdido - Remastered 2011',
        lang: 'pt',
        tags: ['pt'],
      }),
    });
    expect(dupRemaster.status).toBe(409);

    const listRes = await fetch(`${baseUrl}/api/catalog`);
    const listData = (await listRes.json()) as { total: number };
    expect(listData.total).toBe(2);
  });

  it('requires auth for DELETE /api/catalog/:id and deletes when authorized', async () => {
    const unauthDel = await fetch(
      `${baseUrl}/api/catalog/legiaourbana::tempoperdido`,
      { method: 'DELETE' }
    );
    expect(unauthDel.status).toBe(401);

    const authDel = await fetch(
      `${baseUrl}/api/catalog/legiaourbana::tempoperdido`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      }
    );
    expect(authDel.status).toBe(200);
    const body = (await authDel.json()) as { removed: boolean; total: number };
    expect(body.removed).toBe(true);
    expect(body.total).toBe(0);
  });
});
