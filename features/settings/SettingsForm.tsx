import { useEffect, useState } from 'react';
import './settings.css';
import { KeyTester } from './KeyTester';
import { loadSettings, saveSettings } from './storage';
import { DEFAULT_SETTINGS, type ProviderId, type Settings } from './types';

const PROVIDERS: { id: ProviderId; name: string; keyUrl: string }[] = [
  { id: 'gemini', name: 'Gemini', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', name: 'Groq', keyUrl: 'https://console.groq.com/keys' },
];

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  function update(next: Settings) {
    setSettings(next);
    setSaved(false);
  }

  async function save() {
    await saveSettings(settings);
    setSaved(true);
  }

  if (!loaded) return null;

  return (
    <div className="settings">
      <h1>SoFar settings</h1>
      <p className="hint">Keys are stored only in this browser. They are sent only to their own provider.</p>

      <div className="modes">
        {(
          [
            ['auto', 'Auto: fastest first, falls back to the other if one is busy'],
            ['gemini', 'Gemini only'],
            ['groq', 'Groq only'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="row">
            <input
              type="radio"
              name="provider"
              checked={settings.provider === value}
              onChange={() => update({ ...settings, provider: value })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="cards">
        {PROVIDERS.map((p) => {
          const inUse = settings.provider === 'auto' ? settings[p.id].apiKey.trim() !== '' : settings.provider === p.id;
          return (
          <section key={p.id} className={`card ${inUse ? 'active' : ''}`}>
            <div className="card-head">
              {p.name}
              {inUse && <span className="tag">in use</span>}
            </div>
            <label className="field">
              API key
              <input
                type="password"
                autoComplete="off"
                value={settings[p.id].apiKey}
                onChange={(e) => update({ ...settings, [p.id]: { ...settings[p.id], apiKey: e.target.value } })}
              />
            </label>
            <label className="field">
              Model
              <input
                type="text"
                value={settings[p.id].model}
                onChange={(e) => update({ ...settings, [p.id]: { ...settings[p.id], model: e.target.value } })}
              />
            </label>
            <KeyTester target={p.id} apiKey={settings[p.id].apiKey} />
            <a className="hint" href={p.keyUrl} target="_blank" rel="noreferrer">
              Get a free {p.name} key
            </a>
          </section>
          );
        })}
      </div>

      <section className="card extra">
        <div className="card-head">Extra info (optional)</div>
        <p className="hint">Helps with questions like who is that actor or where is this filmed.</p>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.webSearch}
            onChange={(e) => update({ ...settings, webSearch: e.target.checked })}
          />
          Use web search for facts (needs a Gemini key)
        </label>
        <label className="field">
          TMDB API key
          <input
            type="password"
            autoComplete="off"
            value={settings.tmdbApiKey}
            onChange={(e) => update({ ...settings, tmdbApiKey: e.target.value })}
          />
        </label>
        <KeyTester target="tmdb" apiKey={settings.tmdbApiKey} />
        <a className="hint" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
          Get a free TMDB key
        </a>
      </section>

      <div className="actions">
        <button type="button" className="primary" onClick={save}>
          Save
        </button>
        {saved && <span className="status ok">Saved</span>}
      </div>
    </div>
  );
}
