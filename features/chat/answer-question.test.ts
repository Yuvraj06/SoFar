import { describe, expect, it } from 'vitest';
import type { Ask } from '../ai/failover';
import type { AiProvider, ChatMessage } from '../ai/types';
import { answerQuestion, type AnswerDeps } from './answer-question';
import { CHECK_FAILED_REPLY, FALLBACK_REPLY } from './prompt';

const cues = [
  { start: 10, end: 12, text: 'SEEN-LINE hello there' },
  { start: 500, end: 502, text: 'FUTURE-LINE the butler did it' },
];
const base = { question: 'who is he?', history: [], title: 'Show', cues, currentTime: 60 };

// A fake AI that replays a script and records every message it receives.
function scripted(replies: (string | Error)[]) {
  const seen: ChatMessage[][] = [];
  let i = 0;
  const provider: AiProvider = {
    async chat(messages) {
      seen.push(messages);
      const r = replies[i++];
      if (r instanceof Error) throw r;
      return r ?? '';
    },
  };
  // Pretend the AI has a huge transcript limit.
  const ask: Ask = (build, options) => provider.chat(build(1_000_000), options);
  return { ask, seen };
}
const deps = (ask: Ask, extra: Partial<AnswerDeps> = {}): AnswerDeps => ({ ask, getFacts: async () => '', ...extra });
const SAFE = '{"verdict":"safe","reason":"ok"}';
const UNSAFE = '{"verdict":"unsafe","reason":"reveals the ending"}';

describe('answerQuestion', () => {
  it('returns a safe draft using exactly 2 AI calls', async () => {
    const { ask, seen } = scripted(['Draft answer', SAFE]);
    expect(await answerQuestion(base, deps(ask))).toEqual({ text: 'Draft answer', blocked: false });
    expect(seen).toHaveLength(2);
  });

  it('NEVER sends future cues to any AI call (answer, checker, facts)', async () => {
    const { ask, seen } = scripted(['Draft', SAFE]);
    let factsInput = '';
    await answerQuestion(base, deps(ask, { getFacts: async (c) => ((factsInput = JSON.stringify(c)), '') }));
    const everything = seen.flat().map((m) => m.content).join('\n') + factsInput;
    expect(everything).toContain('SEEN-LINE');
    expect(everything).not.toContain('FUTURE-LINE');
  });

  it('puts facts and the last few seconds of dialogue in the prompt', async () => {
    const { ask, seen } = scripted(['Draft', SAFE]);
    await answerQuestion({ ...base, currentTime: 15 }, deps(ask, { getFacts: async () => 'Actor A as Hero' }));
    const system = seen[0]?.[0]?.content ?? '';
    expect(system).toContain('Actor A as Hero');
    expect(system).toContain('RIGHT NOW');
  });

  it('retries once with the checker reason, then returns the safe retry', async () => {
    const { ask, seen } = scripted(['Bad draft', UNSAFE, 'Good draft', SAFE]);
    const out = await answerQuestion(base, deps(ask));
    expect(out).toEqual({ text: 'Good draft', blocked: false });
    expect(seen[2]?.[0]?.content).toContain('reveals the ending');
  });

  it('falls back to "we do not know yet" when the retry is also unsafe', async () => {
    const { ask } = scripted(['Bad 1', UNSAFE, 'Bad 2', UNSAFE]);
    expect(await answerQuestion(base, deps(ask))).toEqual({ text: FALLBACK_REPLY, blocked: true });
  });

  it('fails closed when the checker errors or is unreadable', async () => {
    const failed = await answerQuestion(base, deps(scripted(['Draft', new Error('network')]).ask));
    expect(failed.blocked).toBe(true);
    expect(failed.text).toContain(CHECK_FAILED_REPLY);
    expect(failed.text).toContain('network');
    expect((await answerQuestion(base, deps(scripted(['Draft', 'lol fine']).ask))).text).toBe(FALLBACK_REPLY);
  });

  it('still answers when fact lookup fails', async () => {
    const { ask } = scripted(['Draft', SAFE]);
    const out = await answerQuestion(base, deps(ask, { getFacts: async () => Promise.reject(new Error('x')) }));
    expect(out.blocked).toBe(false);
  });

  it('drops history from the future after a rewind', async () => {
    const { ask, seen } = scripted(['Draft', SAFE]);
    const history = [
      { role: 'user' as const, content: 'LATE-Q', atTime: 900 },
      { role: 'assistant' as const, content: 'LATE-A', atTime: 900 },
    ];
    await answerQuestion({ ...base, history }, deps(ask));
    expect(seen[0]?.map((m) => m.content).join('\n')).not.toContain('LATE-');
  });

  it('gives each AI a transcript sized for its own limit', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ start: i, end: i + 1, text: `line number ${i}` }));
    const sizes: number[] = [];
    const ask: Ask = async (build) => {
      sizes.push(build(500)[0]?.content.length ?? 0, build(1_000_000)[0]?.content.length ?? 0);
      return SAFE;
    };
    await answerQuestion({ ...base, cues: many, currentTime: 199 }, deps(ask)).catch(() => {});
    expect(sizes[0]).toBeLessThan(sizes[1] ?? 0);
  });
});
