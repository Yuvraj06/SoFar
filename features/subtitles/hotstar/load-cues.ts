import { parseVtt } from '../vtt-parser';
import type { Cue } from '../types';
import { findSubtitleUrl } from './subtitle-url';

// Runs in the side panel (it has DOMParser and host permission to fetch from Hotstar).
// Returns null when the title has no English subtitles.
export async function loadHotstarCues(mpdUrl: string): Promise<Cue[] | null> {
  const mpdRes = await fetch(mpdUrl);
  if (!mpdRes.ok) throw new Error(`Manifest request failed (${mpdRes.status})`);
  const mpd = new DOMParser().parseFromString(await mpdRes.text(), 'application/xml');

  const vttUrl = findSubtitleUrl(mpd, mpdUrl);
  if (!vttUrl) return null;

  const vttRes = await fetch(vttUrl);
  if (!vttRes.ok) throw new Error(`Subtitle request failed (${vttRes.status})`);
  return parseVtt(await vttRes.text());
}
