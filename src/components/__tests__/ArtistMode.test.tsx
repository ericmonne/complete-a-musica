import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';

const INITIAL_LYRICS = [
  'One two three four five six seven eight nine ten',
  'Eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen',
  'Nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive.',
].join('\n');

const DJAVAN_LYRICS = [
  'O amor inteiro floresce devagar no fundo do meu peito,',
  'Trazendo calma, brilho e luz para cada novo amanhecer,',
  'Quando a brisa suave do mar encontra o horizonte azul.',
].join('\n');

describe('Artist / Band Live Draw Mode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/catalog')) {
        if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
          throw new Error('POST /api/catalog should never be called from the web game');
        }
        return {
          ok: true,
          json: async () => ({
            tracks: [
              {
                id: 'queen::dontstopmenow',
                artist: 'Queen',
                track: "Don't Stop Me Now",
                lang: 'en',
                tags: ['en', 'rock_pop'],
              },
            ],
            total: 1,
          }),
        };
      }

      if (url.includes('artist_name=Djavan')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 55501,
              artistName: 'Djavan',
              trackName: 'Oceano Secreto',
              instrumental: false,
              plainLyrics: DJAVAN_LYRICS,
            },
          ],
        };
      }

      if (url.includes('ArtistaDesconhecidoXYZ')) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      return {
        ok: true,
        json: async () => [
          {
            id: 1001,
            artistName: 'Queen',
            trackName: "Don't Stop Me Now",
            instrumental: false,
            plainLyrics: INITIAL_LYRICS,
          },
        ],
      };
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('draws a song live by artist without adding it to the base catalog and keeps title hidden', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/Digite uma palavra da música/i);

    const artistInput = screen.getByLabelText(/Nome do artista ou banda/i);
    await user.type(artistInput, 'Djavan');
    await user.click(screen.getByRole('button', { name: /Sortear Artista/i }));

    await waitFor(() => {
      expect(screen.getByText(/Modo Artista:/i)).toBeInTheDocument();
    });

    // LRCLIB was queried with artist_name=Djavan
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('artist_name=Djavan'))).toBe(true);

    // Zero POST calls to /api/catalog
    const postCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes('/api/catalog') &&
        ((c[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'POST'
    );
    expect(postCalls).toHaveLength(0);

    // Artist is shown, song title stays hidden
    expect(screen.getAllByText('Djavan').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Oceano Secreto/i)).not.toBeInTheDocument();
    expect(document.title).toBe('Complete a Música');
  });

  it('shows an error alert and preserves active game when artist has no playable lyrics', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/Digite uma palavra da música/i);

    const artistInput = screen.getByLabelText(/Nome do artista ou banda/i);
    await user.type(artistInput, 'ArtistaDesconhecidoXYZ');
    await user.click(screen.getByRole('button', { name: /Sortear Artista/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/ArtistaDesconhecidoXYZ/i);

    // Active game input remains enabled so user didn't lose their active round
    expect(screen.getByLabelText(/Digite uma palavra da música/i)).toBeEnabled();
  });
});
