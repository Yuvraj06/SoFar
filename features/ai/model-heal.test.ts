import { describe, expect, it } from 'vitest';
import { AiError } from './http';
import { backupModelFor, parseModelList, pickModel, withModelHeal } from './model-heal';
import type { AiProvider } from './types';

const msg = [{ role: 'user' as const, content: 'x' }];
const failing = (message: string, status?: number): AiProvider => ({
  chat: async () => {
    throw new AiError(message, status);
  },
});

describe('model list helpers', () => {
  it('parses Groq and Gemini lists', () => {
    expect(parseModelList('groq', { data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
    expect(
      parseModelList('gemini', {
        models: [
          { name: 'models/gemini-x-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    ).toEqual(['gemini-x-flash']);
  });
  it('prefers known good models and skips non chat ones', () => {
    expect(pickModel('groq', ['whisper-large-v3', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b'])).toBe('openai/gpt-oss-120b');
    expect(pickModel('groq', ['whisper-large-v3', 'llama-9-big'])).toBe('llama-9-big');
    expect(pickModel('groq', ['whisper-large-v3'])).toBeNull();
  });
  it('suggests a lighter Gemini backup but none for Groq', () => {
    expect(backupModelFor('gemini', 'gemini-3.8-flash')).toBe('gemini-3.5-flash-lite');
    expect(backupModelFor('gemini', 'gemini-3.5-flash-lite')).toBe('gemini-3.8-flash');
    expect(backupModelFor('groq', 'x')).toBeNull();
  });
});

describe('withModelHeal', () => {
  const listFetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: 'good-llama' }] }))) as unknown as typeof fetch;

  it('switches to a working model after a 404 and remembers it', async () => {
    let fixed = '';
    const make = (m: string): AiProvider => (m === 'good-llama' ? { chat: async () => 'works' } : failing('no model', 404));
    const p = withModelHeal('groq', 'k', 'missing', make, (m) => (fixed = m), listFetch);
    expect(await p.chat(msg)).toBe('works');
    expect(fixed).toBe('good-llama');
  });
  it('passes other errors through untouched', async () => {
    const p = withModelHeal('groq', 'k', 'm', () => failing('rate', 429), undefined, listFetch);
    await expect(p.chat(msg)).rejects.toThrow('rate');
  });
});
