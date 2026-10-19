import { describe, expect, it } from 'vitest';
import { createAsk, orderCandidates, type Candidate } from './failover';
import { AiError } from './http';
import type { AiProvider } from './types';

const ok = (text: string, vision = false): AiProvider => ({ vision, chat: async () => text });
const bad = (status?: number): AiProvider => ({
  chat: async () => {
    throw new AiError(`err${status}`, status);
  },
});
const cand = (id: string, provider: AiProvider, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  provider,
  transcriptLimit: 1000,
  ...extra,
});
const noWait = { sleep: async () => {}, now: () => 0 };
const build = () => [{ role: 'user' as const, content: 'x' }];

describe('createAsk', () => {
  it('only calls the first provider when it works', async () => {
    let secondCalled = false;
    const second: AiProvider = { chat: async () => ((secondCalled = true), 'b') };
    const ask = createAsk([cand('a', ok('A')), cand('b', second)], { ...noWait, health: new Map() });
    expect(await ask(build)).toBe('A');
    expect(secondCalled).toBe(false);
  });

  it('falls back to the next provider when one fails', async () => {
    const ask = createAsk([cand('a', bad(503)), cand('b', ok('B'))], { ...noWait, health: new Map() });
    expect(await ask(build)).toBe('B');
  });

  it('tries a failed provider last for the next minute', async () => {
    const health = new Map<string, { failedAt?: number; avgMs?: number }>();
    const ask = createAsk([cand('a', bad(429)), cand('b', ok('B'))], { ...noWait, health });
    await ask(build);
    const order = orderCandidates([cand('a', ok('A')), cand('b', ok('B'))], health, 1000).map((c) => c.id);
    expect(order).toEqual(['b', 'a']);
  });

  it('prefers the faster provider and puts backups last', () => {
    const health = new Map([['slow', { avgMs: 4000 }], ['fast', { avgMs: 500 }]]);
    const order = orderCandidates(
      [cand('slow', ok('')), cand('backup', ok(''), { backup: true }), cand('fast', ok(''))],
      health,
      0,
    ).map((c) => c.id);
    expect(order).toEqual(['fast', 'slow', 'backup']);
  });

  it('goes around once more when everything is busy, then reports all errors', async () => {
    let calls = 0;
    const flaky: AiProvider = {
      chat: async () => {
        calls++;
        if (calls === 1) throw new AiError('busy', 503);
        return 'second time';
      },
    };
    expect(await createAsk([cand('a', flaky)], { ...noWait, health: new Map() })(build)).toBe('second time');

    const ask = createAsk([cand('a', bad(503)), cand('b', bad(429))], { ...noWait, health: new Map() });
    await expect(ask(build)).rejects.toThrow(/err503.*err429/);
  });

  it('does not retry hard errors like a bad key', async () => {
    let calls = 0;
    const badKey: AiProvider = { chat: async () => (calls++, Promise.reject(new AiError('bad key', 401))) };
    await expect(createAsk([cand('a', badKey)], { ...noWait, health: new Map() })(build)).rejects.toThrow('bad key');
    expect(calls).toBe(1);
  });

  it('uses only vision providers for screenshots', async () => {
    const ask = createAsk([cand('groq', ok('no eyes')), cand('gemini', ok('sees', true))], {
      ...noWait,
      health: new Map(),
    });
    expect(await ask(build, { needsVision: true })).toBe('sees');
  });

  it('builds messages with each provider own transcript limit', async () => {
    const limits: number[] = [];
    const p: AiProvider = { chat: async () => 'ok' };
    const ask = createAsk([cand('a', p, { transcriptLimit: 123 })], { ...noWait, health: new Map() });
    await ask((limit) => (limits.push(limit), build()));
    expect(limits).toEqual([123]);
  });
});
