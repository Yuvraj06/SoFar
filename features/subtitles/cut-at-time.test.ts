import { describe, expect, it } from 'vitest';
import { cutAtTime } from './cut-at-time';

const cues = [
  { start: 0, end: 2, text: 'a' },
  { start: 10, end: 12, text: 'b' },
  { start: 20, end: 22, text: 'c' },
];

describe('cutAtTime', () => {
  it('keeps only cues that have started', () => {
    expect(cutAtTime(cues, 15).map((c) => c.text)).toEqual(['a', 'b']);
  });
  it('includes a cue starting exactly now', () => {
    expect(cutAtTime(cues, 10).map((c) => c.text)).toEqual(['a', 'b']);
  });
  it('rewinding gives less', () => {
    expect(cutAtTime(cues, 5).map((c) => c.text)).toEqual(['a']);
  });
  it('never leaks future cues', () => {
    expect(cutAtTime(cues, -1)).toEqual([]);
  });
});
