import { AiError, postJson } from './http';
import type { AiProvider, ChatMessage, ChatOptions } from './types';

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

export function buildGeminiBody(messages: ChatMessage[], options: ChatOptions = {}) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.content },
        ...(m.image ? [{ inlineData: { mimeType: m.image.mimeType, data: m.image.data } }] : []),
      ],
    }));

  const generationConfig: Record<string, unknown> = {};
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options.json) generationConfig.responseMimeType = 'application/json';

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig,
  };
}

export function parseGeminiResponse(json: unknown): string {
  const res = json as GeminiResponse;
  const block = res?.promptFeedback?.blockReason;
  if (block) throw new AiError(`Gemini blocked the request (${block}).`);
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) throw new AiError('Gemini sent back an empty answer. Try again.');
  return text;
}

export function createGeminiProvider(apiKey: string, model: string, fetchFn: typeof fetch = fetch): AiProvider {
  return {
    vision: true,
    async chat(messages, options) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const json = await postJson('Gemini', url, { 'x-goog-api-key': apiKey }, buildGeminiBody(messages, options), fetchFn, options?.signal);
      return parseGeminiResponse(json);
    },
  };
}
