import type { AiProvider, ChatMessage } from '../ai/types';
import type { SearchKind } from './gemini-search';

// Web pipeline: 1) plan a narrow query  2) search  3) filter out plot  4) hand over clean notes.
// The search never sees the transcript. The notes are about the IDEA or an EARLIER movie,
// and the answer step later fits them to how far the viewer has watched.

export type SearchPlan = { search: boolean; kind: SearchKind; query: string };

// Cheap word checks so most questions skip the planning AI call (saves time and rate limit).
const FACT_WORDS =
  /\b(who (plays|played|is playing|voices)|actor|actress|cast|played by|filmed|filming|shot in|location|song|music|soundtrack|score|director|directed|written by|release[d]?|based on|real)\b/i;
const CONCEPT_WORDS =
  /\b(what (?:does|do) .{1,40} mean|meaning of|explain|define|tell me about|what('s| is| are| was| were) (?!(?:he|she|they|it|this|that|happening|going|there|wrong|with|the (?:plan|point|problem|matter))\b))/i;
const PREVIOUS_WORDS =
  /\b((last|previous|earlier|prior|first|original) (movie|film|part|season|installment|one)|prequel|recap|before this (movie|film|season)|in the (first|last|previous) (movie|film|season))\b/i;

export function looksLikePreviousQuestion(question: string): boolean {
  return PREVIOUS_WORDS.test(question);
}

export function looksLikeLookupQuestion(question: string): boolean {
  return FACT_WORDS.test(question) || CONCEPT_WORDS.test(question) || PREVIOUS_WORDS.test(question);
}

const PLAN_RULES = `You help a spoiler free movie assistant decide if a web search is needed.
Allowed kinds of search:
- "fact": real world facts (who an actor is, where something was filmed, what song is playing, production trivia).
- "concept": the general meaning of a word, creature, object, place or idea (for example what elves are, what a rover is). Search for the idea in general, never for how this movie or show uses it.
- "previous": the viewer clearly asks what happened in an EARLIER movie or season of the same series.
Do NOT search for questions about events, characters, secrets or motives in the movie or show being watched now.
Write a short search query with no plot words and no guesses about the story. For "previous", name the exact earlier part (use the list of earlier parts when you can).
Reply with JSON only: {"search":true or false,"kind":"fact" or "concept" or "previous","query":"the search query, or empty"}`;

export function buildPlanMessages(args: {
  title: string;
  question: string;
  recentLines: string;
  earlier?: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: PLAN_RULES },
    {
      role: 'user',
      content:
        `Title: ${args.title}\nEarlier parts of this series: ${args.earlier || '(unknown)'}\n` +
        `Recent dialogue the viewer has already seen:\n${args.recentLines || '(none)'}\n\nViewer question: ${args.question}`,
    },
  ];
}

// FAIL SAFE: if we cannot read the plan, we simply do not search.
export function parsePlan(raw: string): SearchPlan {
  const none: SearchPlan = { search: false, kind: 'fact', query: '' };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return none;
  try {
    const data = JSON.parse(match[0]) as { search?: unknown; kind?: unknown; query?: unknown };
    const query = typeof data.query === 'string' ? data.query.trim() : '';
    const kind = data.kind ?? 'fact';
    if (data.search === true && query && query.length <= 200 && (kind === 'fact' || kind === 'concept' || kind === 'previous')) {
      return { search: true, kind, query };
    }
  } catch {
    // fall through
  }
  return none;
}

const FILTER_RULES: Record<SearchKind, string> = {
  fact: `Keep ONLY harmless real world facts (who played whom, filming places, music, production and release facts).
Remove every line that mentions or hints at plot, story events, endings, deaths, twists, character fates, or anything that happens later in the story.`,
  concept: `Keep ONLY general background about the idea itself (what it means, where it comes from, typical traits).
Remove every line about a specific movie, show, book or game (including the title below), any character, or any plot.`,
  previous: `Keep ONLY events of the earlier movie or season that the notes are about.
Remove every line that mentions the title below, any sequel or later movie or season, words like "later", "eventually" or "in the sequel", cast or trivia, or anything that happens after that earlier part.`,
};

export function buildFilterMessages(args: { title: string; kind: SearchKind; rawFacts: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        `You are a spoiler filter. You get raw web search notes.\n${FILTER_RULES[args.kind]}\n` +
        `Remove any line you are unsure about.\nReply with the kept lines as short bullet points. If nothing is left, reply with exactly: NONE`,
    },
    { role: 'user', content: `Title being watched now: ${args.title}\n\nRaw notes:\n${args.rawFacts}` },
  ];
}

export function isNone(text: string): boolean {
  return text.trim().toUpperCase().replace(/[^A-Z]/g, '') === 'NONE';
}

const LABELS: Record<SearchKind, (query: string) => string> = {
  fact: () => 'Real world facts:',
  concept: () => 'General background (about the idea, not this movie):',
  previous: (query) => `Recap of an EARLIER part of the series (${query}). It is not part of what the viewer is watching now:`,
};

export async function runWebPipeline(args: {
  title: string;
  question: string;
  recentLines: string;
  earlier?: string; // earlier movies or seasons, from TMDB
  provider: AiProvider; // writes the query and filters the result
  search: (kind: SearchKind, query: string) => Promise<string>;
}): Promise<string> {
  if (!looksLikeLookupQuestion(args.question)) return '';
  const planRaw = await args.provider.chat(buildPlanMessages(args), { temperature: 0, json: true });
  const plan = parsePlan(planRaw);
  if (!plan.search) return '';

  const raw = await args.search(plan.kind, plan.query);
  if (isNone(raw)) return '';

  const clean = await args.provider.chat(
    buildFilterMessages({ title: args.title, kind: plan.kind, rawFacts: raw }),
    { temperature: 0 },
  );
  return isNone(clean) ? '' : `${LABELS[plan.kind](plan.query)}\n${clean.trim()}`;
}
