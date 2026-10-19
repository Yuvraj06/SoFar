import { describe, expect, it } from 'vitest';
import { parseVerdict } from './checker';

describe('parseVerdict', () => {
  it('reads safe and unsafe', () => {
    expect(parseVerdict('{"verdict":"safe","reason":"ok"}')).toEqual({ safe: true, reason: 'ok' });
    expect(parseVerdict('{"verdict":"unsafe","reason":"mentions a death"}')).toEqual({
      safe: false,
      reason: 'mentions a death',
    });
  });
  it('finds JSON inside extra text', () => {
    expect(parseVerdict('Sure! {"verdict":"safe","reason":""} done').safe).toBe(true);
  });
  it('fails closed on anything unreadable or unexpected', () => {
    expect(parseVerdict('looks fine to me').safe).toBe(false);
    expect(parseVerdict('{"verdict":"maybe"}').safe).toBe(false);
    expect(parseVerdict('{broken json}').safe).toBe(false);
    expect(parseVerdict('').safe).toBe(false);
  });
});
