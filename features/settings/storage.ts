import { DEFAULT_SETTINGS, type ProviderId, type Settings } from './types';

const KEY = 'settings';

// SECURITY: keys live in storage.local only. Never storage.sync, never logged.
export async function loadSettings(): Promise<Settings> {
  const saved = (await browser.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    gemini: { ...DEFAULT_SETTINGS.gemini, ...saved?.gemini },
    groq: { ...DEFAULT_SETTINGS.groq, ...saved?.groq },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

// True when the chosen provider has a key, so the chat can work.
export function isReady(settings: Settings): boolean {
  const has = (id: ProviderId) => settings[id].apiKey.trim().length > 0;
  return settings.provider === 'auto' ? has('gemini') || has('groq') : has(settings.provider);
}

// Used when a saved model turned out not to exist and we switched to a working one.
export async function saveProviderModel(id: ProviderId, model: string): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, [id]: { ...settings[id], model } });
}
