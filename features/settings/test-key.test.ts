import { describe, expect, it } from 'vitest';
import { buildTestRequest, interpretStatus } from './test-key';

describe('buildTestRequest', () => {
  it('puts the Gemini key in a header, not the URL', () => {
    const r = buildTestRequest('gemini', ' abc ');
    expect(r.url).not.toContain('abc');
    expect(r.headers['x-goog-api-key']).toBe('abc');
  });
  it('uses a Bearer header for Groq', () => {
    expect(buildTestRequest('groq', 'k').headers.Authorization).toBe('Bearer k');
  });
  it('uses Bearer for a TMDB read token and a marker for a v3 key', () => {
    expect(buildTestRequest('tmdb', 'eyJabc').headers.Authorization).toBe('Bearer eyJabc');
    expect(buildTestRequest('tmdb', 'plainkey').headers['x-tmdb-key']).toBe('plainkey');
  });
});

describe('interpretStatus', () => {
  it('maps common statuses', () => {
    expect(interpretStatus(200).ok).toBe(true);
    expect(interpretStatus(401).ok).toBe(false);
    expect(interpretStatus(400).message).toMatch(/rejected/);
    expect(interpretStatus(429).message).toMatch(/rate limited/);
    expect(interpretStatus(500).message).toMatch(/500/);
  });
});
