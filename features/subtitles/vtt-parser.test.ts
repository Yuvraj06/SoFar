import { describe, expect, it } from 'vitest';
import { parseVtt } from './vtt-parser';

describe('parseVtt', () => {
  it('parses cues, ids, settings and tags', () => {
    const vtt = `WEBVTT

NOTE a comment

1
00:00:01.000 --> 00:00:03.500 align:start
Hello <i>there</i>

00:01:02.000 --> 01:00:04.250
Line one
Line two
`;
    expect(parseVtt(vtt)).toEqual([
      { start: 1, end: 3.5, text: 'Hello there' },
      { start: 62, end: 3604.25, text: 'Line one\nLine two' },
    ]);
  });

  it('handles windows line endings and short timestamps', () => {
    const cues = parseVtt('WEBVTT\r\n\r\n01:05.000 --> 01:07.000\r\nHi\r\n');
    expect(cues).toEqual([{ start: 65, end: 67, text: 'Hi' }]);
  });

  it('returns nothing for empty input', () => {
    expect(parseVtt('WEBVTT\n')).toEqual([]);
  });
});
