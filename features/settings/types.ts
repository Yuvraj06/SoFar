export type ProviderId = 'gemini' | 'groq';

export type ProviderSettings = {
  apiKey: string;
  model: string;
};

export type Settings = {
  provider: ProviderId | 'auto'; // 'auto' = use every provider that has a key and take the faster answer
  gemini: ProviderSettings;
  groq: ProviderSettings;
  tmdbApiKey: string;
  webSearch: boolean; // look up real world facts on the web (needs a Gemini key)
};

// Default models come from the Gemini and Groq docs (checked Oct 2026).
// Users can change them in settings, so these are only starting points.
export const DEFAULT_SETTINGS: Settings = {
  provider: 'auto',
  gemini: { apiKey: '', model: 'gemini-3.8-flash' },
  groq: { apiKey: '', model: 'openai/gpt-oss-120b' },
  tmdbApiKey: '',
  webSearch: true,
};
