// Messages sent between the side panel and the content script.

// What the content script reports about the video that is playing.
export type PlaybackInfo = {
  currentTime: number; // seconds
  duration: number; // seconds
  pageTitle: string; // raw document.title
};

export type GetPlaybackRequest = { type: 'get-playback' };

// Background saves the manifest URL of each tab under this key (chrome.storage.session).
export const mpdStorageKey = (tabId: number) => `mpd:${tabId}`;
