import { AiError, postJson } from '../ai/http';

// What kind of lookup is this?
// fact     = real world facts (actors, places, music)
// concept  = what a word or idea means in general (elves, a rover)
// previous = recap of an EARLIER movie or season of the same series
export type SearchKind = 'fact' | 'concept' | 'previous';

const RULES: Record<SearchKind, string> = {
  fact: `Search the web and answer with short factual bullet points about the real world only:
people (who played whom), places, music, production and release facts.
Do not include plot, story events, endings, deaths, twists, or anything about what happens later in the story.
If you can only find plot information, reply with exactly: NONE`,
  concept: `Explain in 3 to 5 short bullet points what the term or idea means in general:
its common meaning, origin or typical traits in mythology, history, science or popular culture.
Do not describe any specific movie, show, book or game, and do not mention any plot.
If you cannot answer in general terms, reply with exactly: NONE`,
  previous: `Summarize the plot of the specific earlier movie or season named in the query in up to 8 short bullet points, in order.
Only talk about that part. Do not mention any later movie, sequel, season, or anything that happens after it.
If you cannot find it, reply with exactly: NONE`,
};

export function searchRules(kind: SearchKind): string {
  return RULES[kind];
}

// The Interactions API reply is nested. We collect every "text" under steps of type model_output.
export function extractInteractionText(json: unknown): string {
  const data = json as { output_text?: unknown; steps?: unknown };
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();

  const texts: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === 'string') texts.push(obj.text);
      Object.values(obj).forEach(walk);
    }
  };
  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      if ((step as { type?: string })?.type === 'model_output') walk(step);
    }
  }
  return texts.join('').trim();
}

// Runs a Google Search grounded Gemini call. The raw result is NOT trusted yet:
// the web pipeline filters it before anything reaches the answer step.
export async function groundedSearch(
  apiKey: string,
  model: string,
  kind: SearchKind,
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const json = await postJson(
    'Gemini search',
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    { 'x-goog-api-key': apiKey },
    {
      model,
      input: query,
      system_instruction: RULES[kind],
      tools: [{ type: 'google_search' }],
      store: false, // do not keep this interaction on Google's side
    },
    fetchFn,
  );
  const text = extractInteractionText(json);
  if (!text) throw new AiError('Web search returned nothing.');
  return text;
}
