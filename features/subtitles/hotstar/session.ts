import { mpdStorageKey, type GetPlaybackRequest, type PlaybackInfo } from '../../../shared/messages';
import type { Cue } from '../types';
import { loadHotstarCues } from './load-cues';
import { parseTitle, type ParsedTitle } from './title';

export type Snapshot =
  | { status: 'idle'; message: string }
  | { status: 'loading'; mpdUrl: string; title: ParsedTitle }
  | { status: 'no-subtitles'; mpdUrl: string; title: ParsedTitle }
  | { status: 'error'; message: string }
  | { status: 'ready'; mpdUrl: string; title: ParsedTitle; currentTime: number; cues: Cue[] };

// Subtitles for the title that is open now. A new .mpd URL (new title) resets it.
let cache: { mpdUrl: string; cues: Cue[] | null; error?: string; loading: boolean } | null = null;

// Looks at the active tab and returns the title, the playback time RIGHT NOW,
// and ALL cues. Callers must cut the cues with cutAtTime before using them.
export async function getSnapshot(): Promise<Snapshot> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { status: 'idle', message: 'No active tab.' };

  const key = mpdStorageKey(tab.id);
  const mpdUrl = (await browser.storage.session.get(key))[key] as string | undefined;
  if (!mpdUrl) return { status: 'idle', message: 'Open a Hotstar title and press play.' };

  let playback: PlaybackInfo | null = null;
  try {
    const request: GetPlaybackRequest = { type: 'get-playback' };
    playback = await browser.tabs.sendMessage(tab.id, request);
  } catch {
    // content script not ready on this page yet
  }
  if (!playback) return { status: 'idle', message: 'Waiting for the video to load...' };
  const title = parseTitle(playback.pageTitle);

  if (!cache || cache.mpdUrl !== mpdUrl) {
    const mine = { mpdUrl, cues: null as Cue[] | null, error: undefined as string | undefined, loading: true };
    cache = mine;
    loadHotstarCues(mpdUrl)
      .then((cues) => (mine.cues = cues))
      .catch((e) => (mine.error = String(e.message ?? e)))
      .finally(() => (mine.loading = false));
  }
  if (cache.loading) return { status: 'loading', mpdUrl, title };
  if (cache.error) return { status: 'error', message: cache.error };
  if (!cache.cues) return { status: 'no-subtitles', mpdUrl, title };
  return { status: 'ready', mpdUrl, title, currentTime: playback.currentTime, cues: cache.cues };
}
