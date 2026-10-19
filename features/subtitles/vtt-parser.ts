import type { Cue } from './types';

// "00:01:02.500" or "01:02.500" -> seconds
function parseTimestamp(s: string): number {
  const parts = s.trim().replace(',', '.').split(':').map(Number);
  if (parts.some(Number.isNaN)) return NaN;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

// Turns the text of a .vtt file into a list of cues.
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  // Cues are separated by blank lines.
  const blocks = vtt.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    const timeIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeIndex === -1) continue; // header, NOTE, STYLE blocks have no timing line

    const [startText = '', rest = ''] = (lines[timeIndex] ?? '').split('-->');
    const endText = rest.trim().split(/\s+/)[0] ?? ''; // drop settings like "align:start"
    const start = parseTimestamp(startText);
    const end = parseTimestamp(endText);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const text = lines
      .slice(timeIndex + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '') // remove tags like <i> and <c.yellow>
      .trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}
