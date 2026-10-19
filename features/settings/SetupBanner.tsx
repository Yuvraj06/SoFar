import './settings.css';
import { isReady } from './storage';
import { useSettings } from './use-settings';

// Shown in the side panel until the chosen provider has a key.
export function SetupBanner() {
  const settings = useSettings();
  if (!settings || isReady(settings)) return null;
  return (
    <div className="banner">
      <p style={{ margin: '0 0 8px' }}>Add an AI key to start chatting.</p>
      <button type="button" onClick={() => browser.runtime.openOptionsPage()}>
        Set up your key
      </button>
    </div>
  );
}
