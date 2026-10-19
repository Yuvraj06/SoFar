// A small error type whose message is safe to show to the user.
// SECURITY: messages never include the API key.
export class AiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AiError';
  }
}

export function friendlyMessage(label: string, status: number, detail: string): string {
  const extra = detail ? ` (${detail.slice(0, 200)})` : '';
  if (status === 401 || status === 403) return `${label} rejected your API key. Check it in settings.${extra}`;
  if (status === 404) return `${label} could not find that model. Check the model name in settings.${extra}`;
  if (status === 413) return `That is too much text for this ${label} model or plan. Try Gemini or a bigger model.${extra}`;
  if (status === 429) return `${label} rate limit reached. Wait a bit and try again.${extra}`;
  if (status >= 500) return `${label} is having trouble right now. Try again soon.${extra}`;
  return `${label} said no (${status}). Check your key and model name in settings.${extra}`;
}

// POST some JSON and return the parsed JSON reply.
export async function postJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new AiError(`Could not reach ${label}. Check your internet.`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err?.error?.message ?? '';
    } catch {
      // ignore: body was not JSON
    }
    throw new AiError(friendlyMessage(label, res.status, detail), res.status);
  }
  return res.json();
}
