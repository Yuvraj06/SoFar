import { describe, expect, it } from 'vitest';
import { averageBrightness, isMostlyBlack } from './capture-screen';
import { looksVisual } from './visual';

describe('looksVisual', () => {
  it('detects questions about the screen', () => {
    for (const q of ['who is this person', 'which person is speaking rn', 'what is he wearing?', 'where is this place']) {
      expect(looksVisual(q)).toBe(true);
    }
  });
  it('ignores story questions', () => {
    expect(looksVisual('why did they leave the base?')).toBe(false);
    expect(looksVisual('what did Watney say earlier')).toBe(false);
  });
});

describe('black frame detection', () => {
  it('flags an all black image and keeps a normal one', () => {
    const black = new Uint8ClampedArray(4 * 100);
    const bright = new Uint8ClampedArray(4 * 100).fill(120);
    expect(isMostlyBlack(black)).toBe(true);
    expect(isMostlyBlack(bright)).toBe(false);
    expect(averageBrightness(bright)).toBe(120);
  });
});
