import type { ProviderId, Settings } from '../settings/types';
import { createAsk, type Ask, type Candidate } from './failover';
import { createGeminiProvider } from './gemini';
import { createGroqProvider } from './groq';
import { backupModelFor, withModelHeal } from './model-heal';
import type { AiProvider } from './types';

export type { AiProvider, ChatMessage, ChatOptions } from './types';
export type { Ask } from './failover';
export { AiError } from './http';

// How much transcript text (in characters) each AI gets. About 4 characters is 1 token.
// Gemini can take a whole movie. Groq free plans allow about 8000 tokens PER MINUTE,
// and one question sends the transcript twice (answer + spoiler check), so Groq stays small.
const TRANSCRIPT_LIMITS: Record<ProviderId, number> = { gemini: 600_000, groq: 8_000 };

// Which providers can answer: the chosen one, or (auto) every one that has a key.
export function activeProviderIds(settings: Settings): ProviderId[] {
  const all: ProviderId[] = ['gemini', 'groq'];
  if (settings.provider !== 'auto') return [settings.provider];
  return all.filter((id) => settings[id].apiKey.trim().length > 0);
}

// Builds the "ask" function the chat uses. It tries the best AI first and falls back if that one fails.
export function createAskFromSettings(
  settings: Settings,
  onModelFixed?: (id: ProviderId, model: string) => void,
): { ask: Ask; asProvider: AiProvider } {
  const make = (id: ProviderId, apiKey: string) => (model: string) =>
    id === 'gemini' ? createGeminiProvider(apiKey, model) : createGroqProvider(apiKey, model);

  const candidates: Candidate[] = [];
  for (const id of activeProviderIds(settings)) {
    const apiKey = settings[id].apiKey.trim();
    const model = settings[id].model.trim();
    const build = make(id, apiKey);
    candidates.push({
      id,
      transcriptLimit: TRANSCRIPT_LIMITS[id],
      provider: withModelHeal(id, apiKey, model, build, (fixed) => onModelFixed?.(id, fixed)),
    });
    // If the main Gemini model is overloaded, a lighter Gemini model is the next choice.
    const backup = backupModelFor(id, model);
    if (backup) {
      candidates.push({ id: `${id}-backup`, transcriptLimit: TRANSCRIPT_LIMITS[id], provider: build(backup), backup: true });
    }
  }

  const ask = createAsk(candidates);
  // For steps that have no big transcript (search planning, fact filtering).
  const asProvider: AiProvider = {
    vision: candidates.some((c) => c.provider.vision),
    chat: (messages, options) => ask(() => messages, { ...options, needsVision: messages.some((m) => m.image) }),
  };
  return { ask, asProvider };
}
