import type { AiProvider } from '../ai/types';
import type { Settings } from '../settings/types';
import { formatTimestamp } from '../chat/prompt';
import type { Cue } from '../subtitles/types';
import { formatTitle, type ParsedTitle } from '../subtitles/hotstar/title';
import { groundedSearch, searchRules, type SearchKind } from './gemini-search';
import { fetchEarlierParts, fetchTmdbFacts, formatEarlier } from './tmdb';
import { looksLikePreviousQuestion, runWebPipeline } from './web-pipeline';

// TMDB answers do not change while you watch, so we ask once per title.
function cached<T>(store: Map<string, Promise<T>>, id: string, make: () => Promise<T>): Promise<T> {
  let job = store.get(id);
  if (!job) {
    job = make();
    store.set(id, job);
    job.catch(() => store.delete(id)); // do not cache failures
  }
  return job;
}
const castCache = new Map<string, Promise<string>>();
const earlierCache = new Map<string, Promise<string>>();

// Collects extra facts from TMDB and the filtered web search.
// Extra facts are a bonus: if anything fails, we just continue without them.
export async function gatherFacts(args: {
  settings: Settings;
  provider: AiProvider;
  title: ParsedTitle;
  question: string;
  recentSeenCues: Cue[]; // already cut at the current time
}): Promise<string> {
  const { settings, provider, title, question, recentSeenCues } = args;
  const tmdbKey = settings.tmdbApiKey.trim();
  const geminiKey = settings.gemini.apiKey.trim();
  const id = formatTitle(title);

  const jobs: Promise<string>[] = [];
  if (tmdbKey) jobs.push(cached(castCache, id, () => fetchTmdbFacts(tmdbKey, title)));

  if (settings.webSearch) {
    jobs.push(
      (async () => {
        // Earlier movies or seasons are only looked up when the viewer asks about them.
        const earlier =
          tmdbKey && looksLikePreviousQuestion(question)
            ? await cached(earlierCache, id, async () => formatEarlier(await fetchEarlierParts(tmdbKey, title))).catch(() => '')
            : '';

        // Gemini can search the web. Without a Gemini key we can still explain general ideas
        // from the AI's own knowledge (still filtered). Earlier movies need real search.
        const search = (kind: SearchKind, query: string): Promise<string> => {
          if (geminiKey) return groundedSearch(geminiKey, settings.gemini.model.trim(), kind, query);
          if (kind === 'concept') {
            return provider.chat(
              [
                { role: 'system', content: searchRules('concept') },
                { role: 'user', content: query },
              ],
              { temperature: 0 },
            );
          }
          return Promise.reject(new Error('This kind of search needs a Gemini key.'));
        };

        return runWebPipeline({
          title: id,
          question,
          recentLines: recentSeenCues.map((c) => `[${formatTimestamp(c.start)}] ${c.text}`).join('\n'),
          earlier,
          provider,
          search,
        });
      })(),
    );
  }

  const results = await Promise.allSettled(jobs);
  return results
    .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    .join('\n\n');
}
