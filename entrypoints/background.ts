import { trackMpdRequests } from '../features/subtitles/hotstar/mpd-tracker';

export default defineBackground(() => {
  // Clicking the extension icon in the toolbar opens the side panel.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  trackMpdRequests();
});
