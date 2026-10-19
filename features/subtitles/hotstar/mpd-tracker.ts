import { mpdStorageKey } from '../../../shared/messages';

// Runs in the background. Remembers the newest .mpd URL for every tab.
// We use storage.session because the background worker can go to sleep.
export function trackMpdRequests() {
  browser.webRequest.onCompleted.addListener(
    (details) => {
      if (details.tabId < 0) return; // not from a tab
      if (!new URL(details.url).pathname.endsWith('.mpd')) return;
      browser.storage.session.set({ [mpdStorageKey(details.tabId)]: details.url });
    },
    { urls: ['*://*.hotstar.com/*.mpd*'] },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    browser.storage.session.remove(mpdStorageKey(tabId));
  });
}
