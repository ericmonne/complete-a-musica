import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogTrack } from '../../types/game';
import { DesktopApp } from '../DesktopApp';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../githubCatalogClient';

const INITIAL_CATALOG: CatalogTrack[] = [
  {
    id: 'legiaourbana::tempoperdido',
    artist: 'Legião Urbana',
    track: 'Tempo Perdido',
    lang: 'pt',
    tags: ['pt', 'rock_pop'],
    addedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('DesktopApp Catalog Manager', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('GitHub Pages Mode (default)', () => {
    let ghCatalog: CatalogTrack[];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem('cam-desktop-mode', 'github');
      localStorage.setItem('cam-desktop-gh-repo', 'user/complete-a-musica');
      localStorage.setItem('cam-desktop-gh-token', 'github_pat_valid');
      ghCatalog = [...INITIAL_CATALOG];

      fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();

        if (url === 'https://api.github.com/repos/user/complete-a-musica' && method === 'GET') {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              default_branch: 'master',
              permissions: { push: true },
            }),
          };
        }

        if (
          url.startsWith(
            'https://api.github.com/repos/user/complete-a-musica/contents/public/catalog.json'
          ) &&
          method === 'GET'
        ) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              sha: 'sha-1',
              content: encodeBase64Utf8(JSON.stringify(ghCatalog)),
            }),
          };
        }

        if (
          url ===
            'https://api.github.com/repos/user/complete-a-musica/contents/public/catalog.json' &&
          method === 'PUT'
        ) {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            content: string;
            branch: string;
          };
          ghCatalog = JSON.parse(decodeBase64Utf8(payload.content)) as CatalogTrack[];
          return {
            status: 200,
            ok: true,
            json: async () => ({ content: { sha: 'sha-2' } }),
          };
        }

        return { status: 404, ok: false, json: async () => ({}) };
      });

      vi.stubGlobal('fetch', fetchMock);
    });

    it('connects to GitHub, blocks duplicates, and commits new tracks via PUT', async () => {
      const user = userEvent.setup();
      render(<DesktopApp />);

      await waitFor(() => {
        expect(
          screen.getByText(/Conectado ao GitHub \(user\/complete-a-musica@master\) • 1 músicas/i)
        ).toBeInTheDocument();
      });
      expect(screen.getByText('Tempo Perdido')).toBeInTheDocument();

      const artistInput = screen.getByLabelText(/Artista \/ Banda/i);
      const trackInput = screen.getByLabelText(/Nome da Música/i);
      const addBtn = screen.getByRole('button', { name: /Adicionar Música/i });

      await user.type(artistInput, 'legiao urbana');
      await user.type(trackInput, 'TEMPO PERDIDO - Remastered 2011');
      expect(screen.getByRole('alert')).toHaveTextContent(/Duplicada!/i);
      expect(addBtn).toBeDisabled();

      await user.clear(artistInput);
      await user.clear(trackInput);
      await user.type(artistInput, 'Gilberto Gil');
      await user.type(trackInput, 'Aquele Abraço');
      expect(addBtn).toBeEnabled();

      await user.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('Aquele Abraço')).toBeInTheDocument();
      });

      const putCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/contents/public/catalog.json') &&
          ((call[1] as RequestInit)?.method ?? 'GET').toUpperCase() === 'PUT'
      );
      expect(putCall).toBeDefined();
      expect(ghCatalog).toHaveLength(2);
    });
  });

  describe('Local Server Mode', () => {
    let catalogStore: CatalogTrack[];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem('cam-desktop-mode', 'local');
      localStorage.setItem('cam-desktop-api-url', 'http://127.0.0.1:3001');
      localStorage.setItem('cam-desktop-admin-key', 'secret-key-abc');
      catalogStore = [...INITIAL_CATALOG];

      fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();

        if (url.endsWith('/api/auth/verify')) {
          const auth = (init?.headers as Record<string, string>)?.Authorization ?? '';
          if (auth !== 'Bearer secret-key-abc') {
            return { status: 401, ok: false, json: async () => ({ error: 'Invalid' }) };
          }
          return {
            status: 200,
            ok: true,
            json: async () => ({ ok: true, total: catalogStore.length }),
          };
        }

        if (url.endsWith('/api/catalog') && method === 'GET') {
          return {
            status: 200,
            ok: true,
            json: async () => ({ tracks: [...catalogStore], total: catalogStore.length }),
          };
        }

        if (url.endsWith('/api/catalog') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            artist: string;
            track: string;
            lang: 'pt' | 'en';
            tags: Array<'pt' | 'en' | 'rock_pop' | 'classics'>;
          };
          const created: CatalogTrack = {
            id: `${body.artist.toLowerCase()}::${body.track.toLowerCase()}`,
            artist: body.artist,
            track: body.track,
            lang: body.lang,
            tags: body.tags,
            addedAt: new Date().toISOString(),
          };
          catalogStore.push(created);
          return {
            status: 201,
            ok: true,
            json: async () => ({ track: created, total: catalogStore.length }),
          };
        }

        return { status: 404, ok: false, json: async () => ({}) };
      });

      vi.stubGlobal('fetch', fetchMock);
    });

    it('connects, blocks duplicate manual entries, and posts new tracks with Bearer token', async () => {
      const user = userEvent.setup();
      render(<DesktopApp />);

      await waitFor(() => {
        expect(screen.getByText(/Conectado e autenticado • 1 músicas/i)).toBeInTheDocument();
      });
      expect(screen.getByText('Tempo Perdido')).toBeInTheDocument();

      const artistInput = screen.getByLabelText(/Artista \/ Banda/i);
      const trackInput = screen.getByLabelText(/Nome da Música/i);
      const addBtn = screen.getByRole('button', { name: /Adicionar Música/i });

      await user.type(artistInput, 'legiao urbana');
      await user.type(trackInput, 'TEMPO PERDIDO - Remastered 2011');
      expect(screen.getByRole('alert')).toHaveTextContent(/Duplicada!/i);
      expect(addBtn).toBeDisabled();

      await user.clear(artistInput);
      await user.clear(trackInput);
      await user.type(artistInput, 'Gilberto Gil');
      await user.type(trackInput, 'Aquele Abraço');
      await user.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('Aquele Abraço')).toBeInTheDocument();
      });

      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).endsWith('/api/catalog') &&
          ((call[1] as RequestInit)?.method ?? 'GET').toUpperCase() === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(
        ((postCall?.[1] as RequestInit)?.headers as Record<string, string>)?.Authorization
      ).toBe('Bearer secret-key-abc');
    });
  });
});
