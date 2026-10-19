import { useEffect, useState } from 'react';
import { loadSettings } from './storage';
import type { Settings } from './types';

// Loads settings and keeps them fresh if they change in another window.
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    loadSettings().then(setSettings);
    const onChange = () => loadSettings().then(setSettings);
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return settings;
}
