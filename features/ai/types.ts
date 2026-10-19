export type ChatImage = { mimeType: string; data: string }; // data is base64

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  image?: ChatImage; // a screenshot, on user messages only
};

export type ChatOptions = {
  temperature?: number;
  json?: boolean; // ask the model to reply with JSON only
  signal?: AbortSignal; // lets us cancel the slower provider in a race
};

// Every AI provider (Gemini, Groq) looks like this to the rest of the app.
// The key and model are baked in when the provider is created.
export interface AiProvider {
  vision?: boolean; // true if this provider can look at images
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
