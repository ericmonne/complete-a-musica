import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';

const MOCK_LYRICS = [
  'A coração!',
  "You're here, amor.",
  "He's in my mind today,",
  'Every single dream will shine bright,',
  'And we all sing this sweet song forever now?',
].join('\n');

const MOCK_LRCLIB_RESPONSE = [
  {
    id: 999001,
    trackName: 'Música Secreta Teste',
    artistName: 'Banda Oculta Teste',
    instrumental: false,
    plainLyrics: MOCK_LYRICS,
  },
];

function mockFetchSuccess() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MOCK_LRCLIB_RESPONSE,
  });
}

describe('Complete a Música App integration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal('fetch', mockFetchSuccess());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hides song title, artist, and answer text on initial load while showing punctuation', async () => {
    render(<App />);

    const input = await screen.findByLabelText(/Digite uma palavra da música/i);
    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Espanhol' })).toBeInTheDocument();

    // Title and artist must not be exposed
    expect(screen.queryByText(/Música Secreta Teste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Banda Oculta Teste/i)).not.toBeInTheDocument();
    expect(document.title).toBe('Complete a Música');

    // Answer words must not be present in the DOM while hidden
    const board = screen.getByLabelText('Letra da música');
    expect(board.textContent).not.toMatch(/coração/i);
    expect(board.textContent).not.toMatch(/forever/i);

    // Punctuation and apostrophes must be visible
    expect(board.textContent).toContain('!');
    expect(board.textContent).toContain(',');
    expect(board.textContent).toContain('.');
    expect(board.textContent).toContain("'");
    expect(board.textContent).toContain('?');
  });

  it('keeps wrong words in the input box and clears on valid words including 1-letter and unaccented words', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = (await screen.findByLabelText(
      /Digite uma palavra da música/i
    )) as HTMLInputElement;

    // Wrong word stays in input box
    await user.type(input, 'errado');
    expect(input.value).toBe('errado');

    // Clear manually
    await user.clear(input);
    expect(input.value).toBe('');

    // 1-letter word 'a' reveals and clears the input
    await user.type(input, 'a');
    expect(input.value).toBe('');
    const board = screen.getByLabelText('Letra da música');
    expect(board.textContent).toContain('A');

    // Now typing 'amor' starting with 'a' must NOT clear on 'a' since 'a' is already revealed
    await user.type(input, 'amor');
    expect(input.value).toBe('');
    expect(board.textContent).toContain('amor');

    // Unaccented 'coracao' matches 'coração'
    await user.type(input, 'coracao');
    expect(input.value).toBe('');
    expect(board.textContent).toContain('coração');
  });

  it('handles contractions piece by piece ("You\'re" -> "you" + "are", "He\'s" -> "he" + "is")', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = (await screen.findByLabelText(
      /Digite uma palavra da música/i
    )) as HTMLInputElement;
    const board = screen.getByLabelText('Letra da música');

    // Reveal 'a' first so typing 'are' doesn't match 'a' mid-word, or verify full flow
    await user.type(input, 'a');
    expect(input.value).toBe('');

    await user.type(input, 'you');
    expect(input.value).toBe('');
    expect(board.textContent).toContain('You');
    expect(board.textContent).not.toContain('re');

    await user.type(input, 'are');
    expect(input.value).toBe('');
    expect(board.textContent).toContain("You're");

    await user.type(input, 'he');
    expect(input.value).toBe('');
    expect(board.textContent).toContain('He');

    await user.type(input, 'is');
    expect(input.value).toBe('');
    expect(board.textContent).toContain("He's");
  });

  it('reveals only the artist when requesting a hint', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/Digite uma palavra da música/i);

    const hintBtn = screen.getByRole('button', { name: /Pedir Dica/i });
    await user.click(hintBtn);

    expect(screen.getByText('Banda Oculta Teste')).toBeInTheDocument();
    expect(screen.queryByText(/Música Secreta Teste/i)).not.toBeInTheDocument();
    expect(document.title).toBe('Complete a Música');
  });

  it('reveals missed words, title, and artist on give up confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/Digite uma palavra da música/i);

    await user.click(screen.getByRole('button', { name: /^Desistir$/i }));
    await user.click(screen.getByRole('button', { name: /Confirmar desistência\?/i }));

    expect(screen.getAllByText(/Música Secreta Teste/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Banda Oculta Teste/).length).toBeGreaterThan(0);

    const board = screen.getByLabelText('Letra da música');
    expect(board.textContent).toContain('coração');
    expect(board.textContent).toContain('forever');
  });

  it('shows "Concluído" banner and reveals song info when all words are guessed', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = (await screen.findByLabelText(
      /Digite uma palavra da música/i
    )) as HTMLInputElement;

    const wordsToGuess = [
      'a',
      'coracao',
      'you',
      'are',
      'he',
      'here',
      'amor',
      'is',
      'in',
      'my',
      'mind',
      'today',
      'every',
      'sing',
      'single',
      'dream',
      'will',
      'shine',
      'bright',
      'and',
      'we',
      'all',
      'this',
      'sweet',
      'song',
      'forever',
      'now',
    ];

    for (const word of wordsToGuess) {
      await user.type(input, word);
    }

    await waitFor(() => {
      expect(screen.getByText(/Concluído! Você completou a letra toda!/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Música Secreta Teste/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Banda Oculta Teste/).length).toBeGreaterThan(0);
  });

  it('toggles between light and dark themes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/Digite uma palavra da música/i);
    expect(document.documentElement.dataset.theme).toBe('light');

    const toggleBtn = screen.getByRole('button', { name: /Alternar para modo/i });
    await user.click(toggleBtn);
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(toggleBtn);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
