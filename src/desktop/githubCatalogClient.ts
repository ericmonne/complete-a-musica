import {
  ALL_FILTER_TAGS,
  LANGUAGE_TAGS,
} from '../engine/catalogFilter';
import {
  canonicalSongKey,
  normalizeWord,
  stripEditionSuffix,
} from '../engine/normalize';
import { CatalogTrack, FilterTag, SongLanguage } from '../types/game';

const GITHUB_API_BASE = 'https://api.github.com';
const CATALOG_FILE_PATH = 'public/catalog.json';
const ALLOWED_TAG_SET = new Set<string>(ALL_FILTER_TAGS);
const LANGUAGE_TAG_SET = new Set<string>(LANGUAGE_TAGS);

export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubNotFoundError';
  }
}

export class DuplicateCatalogError extends Error {
  public readonly existingTrack: CatalogTrack;

  constructor(existingTrack: CatalogTrack) {
    super(
      `Esta música já existe no catálogo: ${existingTrack.artist} — ${existingTrack.track}`
    );
    this.name = 'DuplicateCatalogError';
    this.existingTrack = existingTrack;
  }
}

export class GitHubCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubCatalogError';
  }
}

export interface GitHubCatalogSnapshot {
  tracks: CatalogTrack[];
  sha: string | null;
  branch: string;
  repoSlug: string;
}

export interface AddTrackInput {
  artist: string;
  track: string;
  lang: SongLanguage;
  tags: FilterTag[];
}

export interface UpdateTrackInput {
  lang: SongLanguage;
  tags: FilterTag[];
}

function normalizeTrackTags(lang: SongLanguage, rawTags: readonly FilterTag[]): FilterTag[] {
  const nonLang = rawTags.filter(
    (tag): tag is FilterTag =>
      ALLOWED_TAG_SET.has(tag) && !LANGUAGE_TAG_SET.has(tag)
  );
  return Array.from(new Set<FilterTag>([lang, ...nonLang]));
}

export function findDuplicateTrack(
  tracks: CatalogTrack[],
  artist: string,
  track: string
): CatalogTrack | undefined {
  const artistNorm = normalizeWord(artist);
  const trackNorm = normalizeWord(track);
  if (!artistNorm || !trackNorm) return undefined;

  const targetKey = canonicalSongKey(artist, track);
  const exactRawKey = `${artistNorm}::${trackNorm}`;

  return tracks.find(
    (item) =>
      item.id === targetKey ||
      canonicalSongKey(item.artist, item.track) === targetKey ||
      `${normalizeWord(item.artist)}::${normalizeWord(item.track)}` === exactRawKey
  );
}

/**
 * Parses GitHub repository references from `owner/repo`, HTTPS URLs, or SSH remotes.
 */
export function parseGitHubRepo(
  input: string
): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/i
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const slugMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slugMatch) {
    return { owner: slugMatch[1], repo: slugMatch[2] };
  }

  return null;
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function verifyAndFetchGitHubCatalog(params: {
  repoInput: string;
  branch?: string;
  token: string;
}): Promise<GitHubCatalogSnapshot> {
  const parsed = parseGitHubRepo(params.repoInput);
  if (!parsed) {
    throw new GitHubNotFoundError(
      'Formato de repositório inválido. Use "usuario/repositorio" ou a URL do GitHub.'
    );
  }

  const trimmedToken = params.token.trim();
  if (!trimmedToken) {
    throw new GitHubAuthError('Informe o Token do GitHub (PAT) para conectar.');
  }

  const { owner, repo } = parsed;
  const repoSlug = `${owner}/${repo}`;
  const headers = buildGitHubHeaders(trimmedToken);

  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (repoRes.status === 401) {
    throw new GitHubAuthError('Token do GitHub inválido ou expirado.');
  }
  if (repoRes.status === 403) {
    throw new GitHubAuthError(
      'Token sem permissão de acesso a este repositório.'
    );
  }
  if (repoRes.status === 404) {
    throw new GitHubNotFoundError(
      'Repositório não encontrado ou token sem acesso a ele.'
    );
  }
  if (!repoRes.ok) {
    throw new GitHubCatalogError(
      `Erro ao consultar repositório no GitHub (HTTP ${repoRes.status}).`
    );
  }

  const repoData = (await repoRes.json()) as {
    default_branch?: string;
    permissions?: { push?: boolean };
  };

  if (repoData.permissions && repoData.permissions.push === false) {
    throw new GitHubAuthError(
      'Este token tem apenas leitura. Habilite a permissão "Contents: Read and write" no token.'
    );
  }

  const resolvedBranch =
    params.branch?.trim() || repoData.default_branch || 'main';

  const contentsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${CATALOG_FILE_PATH}?ref=${encodeURIComponent(
    resolvedBranch
  )}`;

  const contentsRes = await fetch(contentsUrl, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (contentsRes.status === 404) {
    return {
      tracks: [],
      sha: null,
      branch: resolvedBranch,
      repoSlug,
    };
  }
  if (contentsRes.status === 401 || contentsRes.status === 403) {
    throw new GitHubAuthError(
      'Sem permissão para ler public/catalog.json com este token.'
    );
  }
  if (!contentsRes.ok) {
    throw new GitHubCatalogError(
      `Erro ao ler ${CATALOG_FILE_PATH} no GitHub (HTTP ${contentsRes.status}).`
    );
  }

  const fileData = (await contentsRes.json()) as {
    sha?: string;
    content?: string;
  };

  let tracks: CatalogTrack[] = [];
  if (typeof fileData.content === 'string' && fileData.content.trim().length > 0) {
    const decoded = decodeBase64Utf8(fileData.content);
    const parsedJson: unknown = JSON.parse(decoded);
    if (Array.isArray(parsedJson)) {
      tracks = parsedJson as CatalogTrack[];
    }
  }

  return {
    tracks,
    sha: fileData.sha ?? null,
    branch: resolvedBranch,
    repoSlug,
  };
}

async function runWithGitHubCatalogRetry<T>(
  params: { repoInput: string; branch?: string; token: string },
  transform: (
    snapshot: GitHubCatalogSnapshot
  ) => { nextTracks: CatalogTrack[]; commitMessage: string; resultValue: T }
): Promise<T & { tracks: CatalogTrack[]; branch: string; repoSlug: string }> {
  const parsed = parseGitHubRepo(params.repoInput);
  if (!parsed) {
    throw new GitHubNotFoundError('Repositório GitHub inválido.');
  }

  const { owner, repo } = parsed;
  const headers = {
    ...buildGitHubHeaders(params.token),
    'Content-Type': 'application/json',
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await verifyAndFetchGitHubCatalog(params);
    const { nextTracks, commitMessage, resultValue } = transform(snapshot);
    const encodedContent = encodeBase64Utf8(
      JSON.stringify(nextTracks, null, 2) + '\n'
    );

    const putRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${CATALOG_FILE_PATH}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          content: encodedContent,
          ...(snapshot.sha ? { sha: snapshot.sha } : {}),
          branch: snapshot.branch,
        }),
      }
    );

    if (putRes.status === 409 && attempt === 0) {
      continue;
    }

    if (putRes.status === 401 || putRes.status === 403) {
      throw new GitHubAuthError(
        'Token sem permissão de escrita em Contents (Read and write).'
      );
    }

    if (!putRes.ok) {
      const errBody = (await putRes.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new GitHubCatalogError(
        errBody.message || `Falha ao atualizar catálogo no GitHub (HTTP ${putRes.status}).`
      );
    }

    return {
      ...resultValue,
      tracks: nextTracks,
      branch: snapshot.branch,
      repoSlug: snapshot.repoSlug,
    };
  }

  throw new GitHubCatalogError(
    'Conflito de versão ao atualizar o catálogo no GitHub. Tente novamente.'
  );
}

export async function addTrackToGitHubCatalog(params: {
  repoInput: string;
  branch?: string;
  token: string;
  payload: AddTrackInput;
}): Promise<{
  track: CatalogTrack;
  tracks: CatalogTrack[];
  branch: string;
  repoSlug: string;
}> {
  const rawArtist = params.payload.artist.trim();
  const cleanedTrack = stripEditionSuffix(params.payload.track.trim());
  if (!normalizeWord(rawArtist) || !normalizeWord(cleanedTrack)) {
    throw new GitHubCatalogError(
      'Artista e nome da música devem conter letras ou números válidos.'
    );
  }

  return runWithGitHubCatalogRetry(params, (snapshot) => {
    const duplicate = findDuplicateTrack(
      snapshot.tracks,
      rawArtist,
      params.payload.track
    );
    if (duplicate) {
      throw new DuplicateCatalogError(duplicate);
    }

    const created: CatalogTrack = {
      id: canonicalSongKey(rawArtist, cleanedTrack),
      artist: rawArtist,
      track: cleanedTrack,
      lang: params.payload.lang,
      tags: normalizeTrackTags(params.payload.lang, params.payload.tags),
      addedAt: new Date().toISOString(),
    };

    return {
      nextTracks: [...snapshot.tracks, created],
      commitMessage: `chore(catalog): adicionar ${rawArtist} - ${cleanedTrack}`,
      resultValue: { track: created },
    };
  });
}

export async function updateTrackInGitHubCatalog(params: {
  repoInput: string;
  branch?: string;
  token: string;
  id: string;
  updates: UpdateTrackInput;
}): Promise<{
  track: CatalogTrack;
  tracks: CatalogTrack[];
  branch: string;
  repoSlug: string;
}> {
  return runWithGitHubCatalogRetry(params, (snapshot) => {
    const idx = snapshot.tracks.findIndex((t) => t.id === params.id);
    if (idx === -1) {
      throw new GitHubNotFoundError('Música não encontrada no catálogo.');
    }

    const target = snapshot.tracks[idx];
    const updated: CatalogTrack = {
      ...target,
      lang: params.updates.lang,
      tags: normalizeTrackTags(params.updates.lang, params.updates.tags),
    };

    const nextTracks = snapshot.tracks.map((item, i) =>
      i === idx ? updated : item
    );

    return {
      nextTracks,
      commitMessage: `chore(catalog): atualizar tags de ${target.artist} - ${target.track}`,
      resultValue: { track: updated },
    };
  });
}

export async function removeTrackFromGitHubCatalog(params: {
  repoInput: string;
  branch?: string;
  token: string;
  id: string;
}): Promise<{
  tracks: CatalogTrack[];
  branch: string;
  repoSlug: string;
}> {
  return runWithGitHubCatalogRetry(params, (snapshot) => {
    const target = snapshot.tracks.find((t) => t.id === params.id);
    if (!target) {
      throw new GitHubNotFoundError('Música não encontrada no catálogo.');
    }

    return {
      nextTracks: snapshot.tracks.filter((t) => t.id !== params.id),
      commitMessage: `chore(catalog): remover ${target.artist} - ${target.track}`,
      resultValue: {},
    };
  });
}
