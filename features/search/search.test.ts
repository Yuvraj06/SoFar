import { describe, expect, it } from 'vitest';
import { extractInteractionText } from './gemini-search';
import { earlierMovies, earlierSeasons, formatCredits, formatEarlier, tmdbRequest } from './tmdb';
import {
  buildFilterMessages,
  isNone,
  looksLikeLookupQuestion,
  looksLikePreviousQuestion,
  parsePlan,
  runWebPipeline,
} from './web-pipeline';
import type { AiProvider } from '../ai/types';

describe('tmdbRequest', () => {
  it('uses api_key for a v3 key and Bearer for a read token', () => {
    expect(tmdbRequest('/search/tv', { query: 'The Office' }, 'abc').url).toContain('api_key=abc');
    const t = tmdbRequest('/x', {}, 'eyJtoken');
    expect(t.url).not.toContain('eyJtoken');
    expect(t.headers.Authorization).toBe('Bearer eyJtoken');
  });
});

describe('formatCredits', () => {
  it('lists cast and key crew, never a plot', () => {
    const out = formatCredits('Info:', {
      cast: [{ name: 'Actor One', character: 'Hero' }],
      guest_stars: [{ name: 'Guest', character: 'Visitor' }],
      crew: [{ name: 'Dir', job: 'Director' }, { name: 'Cam', job: 'Camera' }],
    });
    expect(out).toContain('Actor One as Hero; Guest as Visitor');
    expect(out).toContain('Director: Dir');
    expect(out).not.toContain('Cam');
  });
  it('returns empty when there is nothing', () => {
    expect(formatCredits('Info:', {})).toBe('');
  });
});

describe('parsePlan', () => {
  it('reads a search plan', () => {
    expect(parsePlan('{"search":true,"query":"actor in The Office"}')).toEqual({ search: true, kind: 'fact', query: 'actor in The Office' });
    expect(parsePlan('{"search":true,"kind":"concept","query":"elves"}')).toEqual({ search: true, kind: 'concept', query: 'elves' });
    expect(parsePlan('{"search":true,"kind":"weird","query":"x"}').search).toBe(false);
  });
  it('does not search when unsure or unreadable', () => {
    expect(parsePlan('{"search":false,"query":""}').search).toBe(false);
    expect(parsePlan('nonsense').search).toBe(false);
    expect(parsePlan('{"search":true,"query":""}').search).toBe(false);
  });
});

describe('extractInteractionText', () => {
  it('prefers output_text', () => {
    expect(extractInteractionText({ output_text: ' hi ' })).toBe('hi');
  });
  it('falls back to model_output steps only', () => {
    const json = { steps: [{ type: 'model_thoughts', text: 'secret' }, { type: 'model_output', content: [{ text: 'fact' }] }] };
    expect(extractInteractionText(json)).toBe('fact');
  });
});

describe('looksLikeLookupQuestion', () => {
  it('lets fact, concept and earlier movie questions through', () => {
    expect(looksLikeLookupQuestion('Who plays Jim?')).toBe(true);
    expect(looksLikeLookupQuestion('what song is this')).toBe(true);
    expect(looksLikeLookupQuestion('what are elves?')).toBe(true);
    expect(looksLikeLookupQuestion('what does hab mean')).toBe(true);
    expect(looksLikeLookupQuestion('what happened in the last movie')).toBe(true);
  });
  it('ignores story questions', () => {
    expect(looksLikeLookupQuestion('why did he leave?')).toBe(false);
    expect(looksLikeLookupQuestion('what is he doing')).toBe(false);
    expect(looksLikeLookupQuestion('what is happening')).toBe(false);
    expect(looksLikeLookupQuestion('what is this')).toBe(false);
  });
  it('spots earlier movie questions', () => {
    expect(looksLikePreviousQuestion('recap the previous season')).toBe(true);
    expect(looksLikePreviousQuestion('who is he')).toBe(false);
  });
});

describe('earlier parts from TMDB', () => {
  it('keeps only movies released before the current one, oldest first', () => {
    const parts = [
      { title: 'Part 3', release_date: '2016-05-01' },
      { title: 'Part 1', release_date: '2008-05-01' },
      { title: 'Part 2', release_date: '2012-05-01' },
    ];
    expect(earlierMovies(parts, '2016-05-01')).toEqual([
      { title: 'Part 1', year: '2008' },
      { title: 'Part 2', year: '2012' },
    ]);
    expect(earlierMovies(parts, undefined)).toEqual([]);
  });
  it('keeps only earlier seasons and skips specials', () => {
    const seasons = [{ season_number: 0 }, { season_number: 2 }, { season_number: 1 }, { season_number: 3 }];
    expect(formatEarlier(earlierSeasons(seasons, 3, 'Show'))).toBe('Show season 1; Show season 2');
  });
});

describe('filter prompts', () => {
  it('uses a different rule for each kind of search', () => {
    const concept = buildFilterMessages({ title: 'T', kind: 'concept', rawFacts: 'x' })[0]?.content ?? '';
    const previous = buildFilterMessages({ title: 'T', kind: 'previous', rawFacts: 'x' })[0]?.content ?? '';
    expect(concept).toContain('general background about the idea');
    expect(previous).toContain('earlier movie or season');
    expect(previous).toContain('sequel');
  });
});

describe('runWebPipeline', () => {
  const fakeProvider = (replies: string[]): AiProvider & { calls: number } => {
    const p = {
      calls: 0,
      async chat() {
        return replies[p.calls++] ?? '';
      },
    };
    return p;
  };

  it('skips the search when the plan says no', async () => {
    let searched = false;
    const out = await runWebPipeline({
      title: 't', question: 'what song is this?', recentLines: '',
      provider: fakeProvider(['{"search":false,"query":""}']),
      search: async () => ((searched = true), 'x'),
    });
    expect(out).toBe('');
    expect(searched).toBe(false);
  });

  it('searches then filters, and returns only the filtered facts', async () => {
    const out = await runWebPipeline({
      title: 't', question: 'who plays Jim?', recentLines: '',
      provider: fakeProvider(['{"search":true,"query":"who plays Jim in t"}', '- Played by Actor']),
      search: async () => '- Played by Actor\n- Jim dies in the finale',
    });
    expect(out).toContain('Real world facts:');
    expect(out).toContain('- Played by Actor');
  });

  it('returns nothing when the filter keeps nothing', async () => {
    const out = await runWebPipeline({
      title: 't', question: 'who plays q', recentLines: '',
      provider: fakeProvider(['{"search":true,"query":"q"}', 'NONE']),
      search: async () => 'plot stuff',
    });
    expect(out).toBe('');
    expect(isNone(' none. ')).toBe(true);
  });

  it('runs a concept search and labels the result as general background', async () => {
    let seenKind = '';
    const out = await runWebPipeline({
      title: 't', question: 'what are elves?', recentLines: '',
      provider: fakeProvider(['{"search":true,"kind":"concept","query":"elves"}', '- Long lived beings of folklore']),
      search: async (kind) => ((seenKind = kind), '- Long lived beings of folklore'),
    });
    expect(seenKind).toBe('concept');
    expect(out).toContain('General background');
  });

  it('labels an earlier movie recap so the answer cannot mix it up with this movie', async () => {
    const out = await runWebPipeline({
      title: 'Part 2', question: 'what happened in the last movie', recentLines: '', earlier: 'Part 1 (2008)',
      provider: fakeProvider(['{"search":true,"kind":"previous","query":"plot of Part 1 (2008)"}', '- The hero wins']),
      search: async () => '- The hero wins',
    });
    expect(out).toContain('EARLIER part of the series (plot of Part 1 (2008))');
  });
});
