import { describe, expect, it } from 'vitest';
import { buildGeminiBody, createGeminiProvider, parseGeminiResponse } from './gemini';
import { buildGroqBody, parseGroqResponse } from './groq';
import { friendlyMessage } from './http';

describe('gemini', () => {
  it('moves system messages to systemInstruction and maps assistant to model', () => {
    const body = buildGeminiBody(
      [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      { temperature: 0.2, json: true },
    );
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'rules' }] });
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model']);
    expect(body.generationConfig).toEqual({ temperature: 0.2, responseMimeType: 'application/json' });
  });
  it('reads the answer text and skips thought parts', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'Hi ' }, { text: 'there' }] } }] };
    expect(parseGeminiResponse(json)).toBe('Hi there');
  });
  it('throws on blocked or empty replies', () => {
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/blocked/);
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow(/empty/);
  });
  it('sends the key in a header and never in the URL', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
    }) as unknown as typeof fetch;
    const out = await createGeminiProvider('SECRET', 'm1', fake).chat([{ role: 'user', content: 'x' }]);
    expect(out).toBe('ok');
    expect(seen?.url).not.toContain('SECRET');
    expect(seen?.headers['x-goog-api-key']).toBe('SECRET');
  });
});

describe('groq', () => {
  it('builds an OpenAI style body', () => {
    const body = buildGroqBody('m', [{ role: 'user', content: 'hi' }], { json: true, temperature: 0 });
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
  });
  it('reads the reply', () => {
    expect(parseGroqResponse({ choices: [{ message: { content: ' yo ' } }] })).toBe('yo');
    expect(() => parseGroqResponse({ choices: [] })).toThrow(/empty/);
  });
});

describe('friendlyMessage', () => {
  it('explains common failures', () => {
    expect(friendlyMessage('Groq', 429, '')).toMatch(/rate limit/);
    expect(friendlyMessage('Groq', 413, '')).toMatch(/too much text/);
    expect(friendlyMessage('Gemini', 404, '')).toMatch(/model name/);
  });
});
