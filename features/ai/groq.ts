import { AiError, postJson } from './http';
import type { AiProvider, ChatMessage, ChatOptions } from './types';

type GroqResponse = { choices?: { message?: { content?: string | null } }[] };

// Groq speaks the OpenAI format, so messages go through almost unchanged.
export function buildGroqBody(model: string, messages: ChatMessage[], options: ChatOptions = {}) {
  return {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    // JSON mode needs the word "JSON" in the prompt. Our checker prompts have it.
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
  };
}

export function parseGroqResponse(json: unknown): string {
  const text = (json as GroqResponse)?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError('Groq sent back an empty answer. Try again.');
  return text;
}

export function createGroqProvider(apiKey: string, model: string, fetchFn: typeof fetch = fetch): AiProvider {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const headers = { Authorization: `Bearer ${apiKey}` };
  return {
    async chat(messages, options) {
      try {
        return parseGroqResponse(
          await postJson('Groq', url, headers, buildGroqBody(model, messages, options), fetchFn, options?.signal),
        );
      } catch (e) {
        // Some models refuse JSON mode (400). Our prompts already ask for JSON, so retry without it.
        if (options?.json && e instanceof AiError && e.status === 400) {
          const plain = { ...options, json: false };
          return parseGroqResponse(
            await postJson('Groq', url, headers, buildGroqBody(model, messages, plain), fetchFn, options.signal),
          );
        }
        throw e;
      }
    },
  };
}
