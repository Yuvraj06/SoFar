import { describe, expect, it } from 'vitest';
import { buildAnswerMessages, formatTimestamp, formatTranscript, selectHistory } from './prompt';

describe('formatTimestamp', () => {
  it('formats minutes and hours', () => {
    expect(formatTimestamp(75)).toBe('01:15');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(-4)).toBe('00:00');
  });
});

describe('formatTranscript', () => {
  const cues = [
    { start: 1, end: 2, text: 'first' },
    { start: 65, end: 66, text: 'second\nline' },
  ];
  it('adds timestamps and joins multi line cues', () => {
    expect(formatTranscript(cues, 1000)).toBe('[00:01] first\n[01:05] second line');
  });
  it('drops the OLDEST lines when too long', () => {
    const out = formatTranscript(cues, 25);
    expect(out).toContain('second line');
    expect(out).not.toContain('first');
    expect(out).toContain('Earlier dialogue left out');
  });
  it('says so when nothing was said yet', () => {
    expect(formatTranscript([], 100)).toMatch(/nothing has been said/);
  });
});

describe('selectHistory (rewind rule)', () => {
  const history = [
    { role: 'user' as const, content: 'q1', atTime: 100 },
    { role: 'assistant' as const, content: 'a1', atTime: 100 },
    { role: 'user' as const, content: 'q2', atTime: 900 },
    { role: 'assistant' as const, content: 'a2', atTime: 900 },
  ];
  it('keeps everything when time moved forward', () => {
    expect(selectHistory(history, 1000)).toHaveLength(4);
  });
  it('forgets turns from the future after a rewind', () => {
    expect(selectHistory(history, 500).map((m) => m.content)).toEqual(['q1', 'a1']);
  });
});

describe('buildAnswerMessages', () => {
  it('puts rules, transcript and facts in the system message and the question last', () => {
    const msgs = buildAnswerMessages({
      title: 'Show S1 E1',
      currentTime: 65,
      transcript: '[00:01] hello',
      facts: 'Cast: A as B',
      history: [],
      question: 'who?',
    });
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain('Do not use your own memory');
    expect(msgs[0]?.content).toContain('[00:01] hello');
    expect(msgs[0]?.content).toContain('Cast: A as B');
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'who?' });
  });
  it('adds the checker rejection reason on a retry', () => {
    const msgs = buildAnswerMessages({
      title: 't', currentTime: 0, transcript: '', facts: '', history: [], question: 'q', rejection: 'mentioned a death',
    });
    expect(msgs[0]?.content).toContain('mentioned a death');
  });
});

describe('recentLines and screenshots', () => {
  const seen = [
    { start: 10, end: 12, text: 'old line' },
    { start: 95, end: 97, text: 'Watney, status?' },
  ];
  it('only keeps the last few seconds', async () => {
    const { recentLines } = await import('./prompt');
    expect(recentLines(seen, 100)).toBe('[01:35] Watney, status?');
  });
  it('attaches the screenshot to the last user message and mentions it', () => {
    const image = { mimeType: 'image/jpeg', data: 'AAA' };
    const msgs = buildAnswerMessages({
      title: 't', currentTime: 100, transcript: '', facts: '', nowLines: 'x', image, history: [], question: 'who is this?',
    });
    expect(msgs.at(-1)?.image).toEqual(image);
    expect(msgs[0]?.content).toContain('SCREENSHOT');
    expect(msgs[0]?.content).toContain('RIGHT NOW');
  });
});

describe('progress fitting rules', () => {
  it('tells the AI to fit general background and earlier recaps to the viewer progress', () => {
    const [system] = buildAnswerMessages({
      title: 't', currentTime: 0, transcript: '', facts: 'General background: x', history: [], question: 'q',
    });
    expect(system?.content).toContain('what elves are');
    expect(system?.content).toContain('earlier movie or season');
    expect(system?.content).toContain('Never connect it to what happens later');
  });
});
