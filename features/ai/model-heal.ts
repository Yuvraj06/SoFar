import { AiError } from './http';
import type { AiProvider } from './types';

type Id = 'gemini' | 'groq';

const PREFERRED: Record<Id, string[]> = {
  gemini: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
};

// A lighter model to fall back on when the main one is overloaded (Gemini only).
export function backupModelFor(id: Id, model: string): string | null {
  return id === 'gemini' ? (PREFERRED.gemini.find((m) => m !== model) ?? null) : null;
}

// Reads the model names out of each provider's "list models" reply.
export function parseModelList(id: Id, json: unknown): string[] {
  if (id === 'groq') {
    const data = (json as { data?: { id?: string }[] })?.data ?? [];
    return data.flatMap((m) => (m.id ? [m.id] : []));
  }
  const models = (json as { models?: { name?: string; supportedGenerationMethods?: string[] }[] })?.models ?? [];
  return models
    .filter((m) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name as string).replace(/^models\//, ''));
}

// Picks the best chat model this key can use. Returns null if nothing fits.
export function pickModel(id: Id, available: string[]): string | null {
  const preferred = PREFERRED[id].find((m) => available.includes(m));
  if (preferred) return preferred;
  const skip = /whisper|tts|guard|safeguard|embed|image|audio|vision-preview|orpheus/i;
  const want = id === 'groq' ? /llama|gpt-oss|qwen/i : /flash/i;
  return available.find((m) => want.test(m) && !skip.test(m)) ?? null;
}

export async function listModels(id: Id, apiKey: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const res =
    id === 'groq'
      ? await fetchFn('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } })
      : await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
          headers: { 'x-goog-api-key': apiKey },
        });
  if (!res.ok) return [];
  return parseModelList(id, await res.json());
}

// If the saved model does not exist for this key (404), ask the key which models
// it can use, switch to a good one, remember it, and retry once.
export function withModelHeal(
  id: Id,
  apiKey: string,
  model: string,
  make: (model: string) => AiProvider,
  onFixed?: (newModel: string) => void,
  fetchFn: typeof fetch = fetch,
): AiProvider {
  let current = make(model);
  let tried = false;
  return {
    vision: current.vision,
    async chat(messages, options) {
      try {
        return await current.chat(messages, options);
      } catch (e) {
        if (!(e instanceof AiError) || e.status !== 404 || tried) throw e;
        tried = true;
        const picked = pickModel(id, await listModels(id, apiKey, fetchFn).catch(() => []));
        if (!picked || picked === model) throw e;
        current = make(picked);
        onFixed?.(picked);
        return current.chat(messages, options);
      }
    },
  };
}
