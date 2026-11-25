import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogTrack } from '../../types/game';
import {
  addTrackToGitHubCatalog,
  decodeBase64Utf8,
  DuplicateCatalogError,
  encodeBase64Utf8,
  GitHubAuthError,
  parseGitHubRepo,
  removeTrackFromGitHubCatalog,
  verifyAndFetchGitHubCatalog,
} from '../githubCatalogClient';

const SAMPLE_TRACKS: CatalogTrack[] = [
  {
    id: 'legiaourbana::tempoperdido',
    artist: 'Legião Urbana',
    track: 'Tempo Perdido',
    lang: 'pt',
    tags: ['pt', 'rock_pop'],
    addedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('githubCatalogClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses GitHub repositories across slug, HTTPS, and SSH formats', () => {
    expect(parseGitHubRepo('usuario/complete-a-musica')).toEqual({
      owner: 'usuario',
      repo: 'complete-a-musica',
    });
    expect(parseGitHubRepo('https://github.com/usuario/complete-a-musica/')).toEqual({
      owner: 'usuario',
      repo: 'complete-a-musica',
    });
    expect(parseGitHubRepo('https://github.com/usuario/complete-a-musica.git')).toEqual({
      owner: 'usuario',
      repo: 'complete-a-musica',
    });
    expect(parseGitHubRepo('git@github.com:usuario/complete-a-musica.git')).toEqual({
      owner: 'usuario',
      repo: 'complete-a-musica',
    });
    expect(parseGitHubRepo('invalid')).toBeNull();
  });

  it('encodes and decodes UTF-8 Base64 preserving Portuguese accents and cedillas', () => {
    const text = 'Legião Urbana — Coração, Águas de Março & É Preciso Saber Viver';
    const encoded = encodeBase64Utf8(text);
    expect(decodeBase64Utf8(encoded)).toBe(text);
  });

  it('verifies token permissions and decodes public/catalog.json', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/repos/user/repo')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: 'master',
            permissions: { push: true },
          }),
        };
      }
      if (url.includes('/contents/public/catalog.json')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            sha: 'sha-123',
            content: encodeBase64Utf8(JSON.stringify(SAMPLE_TRACKS)),
          }),
        };
      }
      return { status: 404, ok: false, json: async () => ({}) };
    });

    vi.stubGlobal('fetch', fetchMock);

    const snap = await verifyAndFetchGitHubCatalog({
      repoInput: 'user/repo',
      token: 'ghp_valid',
    });

    expect(snap.branch).toBe('master');
    expect(snap.sha).toBe('sha-123');
    expect(snap.tracks).toHaveLength(1);
    expect(snap.tracks[0].artist).toBe('Legião Urbana');
  });

  it('rejects read-only tokens with GitHubAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          default_branch: 'main',
          permissions: { push: false },
        }),
      })
    );

    await expect(
      verifyAndFetchGitHubCatalog({
        repoInput: 'user/repo',
        token: 'ghp_readonly',
      })
    ).rejects.toThrow(GitHubAuthError);
  });

  it('blocks duplicates without calling PUT and retries once on 409 SHA conflict', async () => {
    let putCalls = 0;
    let currentSha = 'sha-v1';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.endsWith('/repos/user/repo') && method === 'GET') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: 'master',
            permissions: { push: true },
          }),
        };
      }

      if (url.includes('/contents/public/catalog.json') && method === 'GET') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            sha: currentSha,
            content: encodeBase64Utf8(JSON.stringify(SAMPLE_TRACKS)),
          }),
        };
      }

      if (url.includes('/contents/public/catalog.json') && method === 'PUT') {
        putCalls++;
        if (putCalls === 1) {
          currentSha = 'sha-v2';
          return {
            status: 409,
            ok: false,
            json: async () => ({ message: 'Conflict' }),
          };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({ content: { sha: 'sha-v3' } }),
        };
      }

      return { status: 404, ok: false, json: async () => ({}) };
    });

    vi.stubGlobal('fetch', fetchMock);

    // Duplicate check must throw without calling PUT
    await expect(
      addTrackToGitHubCatalog({
        repoInput: 'user/repo',
        token: 'ghp_valid',
        payload: {
          artist: 'legiao urbana',
          track: 'Tempo Perdido - Remastered 2011',
          lang: 'pt',
          tags: ['pt', 'rock_pop'],
        },
      })
    ).rejects.toThrow(DuplicateCatalogError);
    expect(putCalls).toBe(0);

    // Adding a brand-new song retries on 409 and succeeds on second PUT
    const result = await addTrackToGitHubCatalog({
      repoInput: 'user/repo',
      token: 'ghp_valid',
      payload: {
        artist: 'Gilberto Gil',
        track: 'Aquele Abraço',
        lang: 'pt',
        tags: ['pt', 'classics'],
      },
    });

    expect(putCalls).toBe(2);
    expect(result.tracks).toHaveLength(2);
    expect(result.track.track).toBe('Aquele Abraço');

    // Removing a track calls PUT with filtered array
    const removed = await removeTrackFromGitHubCatalog({
      repoInput: 'user/repo',
      token: 'ghp_valid',
      id: 'legiaourbana::tempoperdido',
    });
    expect(removed.tracks).toHaveLength(0);
  });
});
