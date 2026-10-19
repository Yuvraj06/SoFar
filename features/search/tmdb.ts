import { formatTitle, type ParsedTitle } from '../subtitles/hotstar/title';

const BASE = 'https://api.themoviedb.org/3';

export function tmdbRequest(path: string, params: Record<string, string>, key: string) {
  const url = new URL(BASE + path);
  const headers: Record<string, string> = {};
  // TMDB has two kinds of credentials. The long "read access token" starts with eyJ.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.href, headers };
}

type Person = { name?: string; character?: string; job?: string };
export type Credits = { cast?: Person[]; guest_stars?: Person[]; crew?: Person[] };

// Turns TMDB credits into a few plain lines. We never include plot summaries.
export function formatCredits(label: string, credits: Credits, maxCast = 30): string {
  const actors = [...(credits.cast ?? []), ...(credits.guest_stars ?? [])]
    .filter((p) => p.name)
    .slice(0, maxCast)
    .map((p) => (p.character ? `${p.name} as ${p.character}` : p.name));
  const wanted = ['Director', 'Writer', 'Screenplay', 'Creator'];
  const crew = (credits.crew ?? [])
    .filter((p) => p.name && p.job && wanted.includes(p.job))
    .slice(0, 6)
    .map((p) => `${p.job}: ${p.name}`);
  const lines = [`${label}`];
  if (actors.length) lines.push(`Cast: ${actors.join('; ')}`);
  if (crew.length) lines.push(crew.join('; '));
  return lines.length > 1 ? lines.join('\n') : '';
}

async function getJson<T>(fetchFn: typeof fetch, key: string, path: string, params: Record<string, string> = {}) {
  const { url, headers } = tmdbRequest(path, params, key);
  const res = await fetchFn(url, { headers });
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  return (await res.json()) as T;
}

type SearchResult = { results?: { id: number }[] };

// Cast and crew for the title. For a TV episode we ask for THAT episode's credits,
// so we do not list actors who only show up in later seasons.
export async function fetchTmdbFacts(key: string, title: ParsedTitle, fetchFn: typeof fetch = fetch): Promise<string> {
  const label = `TMDB info for ${formatTitle(title)}:`;

  if (title.season !== undefined) {
    const found = await getJson<SearchResult>(fetchFn, key, '/search/tv', { query: title.name });
    const id = found.results?.[0]?.id;
    if (id === undefined) return '';
    const path =
      title.episode !== undefined
        ? `/tv/${id}/season/${title.season}/episode/${title.episode}/credits`
        : `/tv/${id}/season/${title.season}/credits`;
    return formatCredits(label, await getJson<Credits>(fetchFn, key, path));
  }

  const movie = await getJson<SearchResult>(fetchFn, key, '/search/movie', { query: title.name });
  const movieId = movie.results?.[0]?.id;
  if (movieId !== undefined) {
    return formatCredits(label, await getJson<Credits>(fetchFn, key, `/movie/${movieId}/credits`));
  }
  return '';
}

// ---- Earlier parts of the series (earlier movies or earlier seasons) ----

export type EarlierPart = { title: string; year?: string };

type CollectionPart = { title?: string; release_date?: string };

// Movies from the same collection that came out BEFORE the current one, oldest first.
export function earlierMovies(parts: CollectionPart[], currentDate: string | undefined): EarlierPart[] {
  if (!currentDate) return [];
  return parts
    .filter((p) => p.title && p.release_date && p.release_date < currentDate)
    .sort((a, b) => (a.release_date as string).localeCompare(b.release_date as string))
    .map((p) => ({ title: p.title as string, year: (p.release_date as string).slice(0, 4) }));
}

// Seasons of the show before the current season (season 0 is "specials", we skip it).
export function earlierSeasons(
  seasons: { season_number?: number }[],
  currentSeason: number,
  showName: string,
): EarlierPart[] {
  return seasons
    .filter((s) => s.season_number !== undefined && s.season_number >= 1 && s.season_number < currentSeason)
    .sort((a, b) => (a.season_number as number) - (b.season_number as number))
    .map((s) => ({ title: `${showName} season ${s.season_number}` }));
}

export function formatEarlier(parts: EarlierPart[]): string {
  return parts.map((p) => (p.year ? `${p.title} (${p.year})` : p.title)).join('; ');
}

// Finds earlier movies or seasons. Titles only, no plot text is fetched here.
export async function fetchEarlierParts(key: string, title: ParsedTitle, fetchFn: typeof fetch = fetch): Promise<EarlierPart[]> {
  if (title.season !== undefined) {
    const found = await getJson<SearchResult>(fetchFn, key, '/search/tv', { query: title.name });
    const id = found.results?.[0]?.id;
    if (id === undefined) return [];
    const show = await getJson<{ seasons?: { season_number?: number }[] }>(fetchFn, key, `/tv/${id}`);
    return earlierSeasons(show.seasons ?? [], title.season, title.name);
  }

  const found = await getJson<SearchResult>(fetchFn, key, '/search/movie', { query: title.name });
  const id = found.results?.[0]?.id;
  if (id === undefined) return [];
  const movie = await getJson<{ release_date?: string; belongs_to_collection?: { id: number } | null }>(
    fetchFn,
    key,
    `/movie/${id}`,
  );
  const collectionId = movie.belongs_to_collection?.id;
  if (collectionId === undefined) return [];
  const collection = await getJson<{ parts?: CollectionPart[] }>(fetchFn, key, `/collection/${collectionId}`);
  return earlierMovies(collection.parts ?? [], movie.release_date);
}
