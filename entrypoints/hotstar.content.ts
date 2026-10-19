import { readPlayback } from '../features/subtitles/hotstar/playback-reader';
import type { GetPlaybackRequest } from '../shared/messages';

export default defineContentScript({
  matches: ['*://*.hotstar.com/*'],
  main() {
    // The side panel asks, we answer with the current video time and page title.
    browser.runtime.onMessage.addListener((message: GetPlaybackRequest, _sender, sendResponse) => {
      if (message?.type === 'get-playback') sendResponse(readPlayback());
    });
  },
});
