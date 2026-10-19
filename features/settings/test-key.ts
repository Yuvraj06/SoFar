// "Test key" button logic. Each check calls a cheap "list" endpoint,
// so we do not need to know any model name.

export type KeyTarget = 'gemini' | 'groq' | 'tmdb';

export type TestRequest = { url: string; headers: Record<string, string> };

export function buildTestRequest(target: KeyTarget, rawKey: string): TestRequest {
  const key = rawKey.trim();
  switch (target) {
    case 'gemini':
      // Key goes in a header, not in the URL, so it never shows up in logs.
      return { url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': key } };
    case 'groq':
      return { url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: `Bearer ${key}` } };
    case 'tmdb':
      // TMDB has two kinds of credentials. The long "read access token" starts with eyJ.
      return key.startsWith('eyJ')
        ? { url: 'https://api.themoviedb.org/3/authentication', headers: { Authorization: `Bearer ${key}` } }
        : { url: 'https://api.themoviedb.org/3/authentication', headers: { 'x-tmdb-key': key } };
  }
}

export type TestResult = { ok: boolean; message: string };

export function interpretStatus(status: number): TestResult {
  if (status >= 200 && status < 300) return { ok: true, message: 'Key works' };
  if (status === 400 || status === 401 || status === 403) return { ok: false, message: 'Key was rejected' };
  if (status === 429) return { ok: false, message: 'Key is valid but rate limited, try again soon' };
  return { ok: false, message: `Unexpected response (${status})` };
}

export async function testKey(target: KeyTarget, key: string): Promise<TestResult> {
  if (!key.trim()) return { ok: false, message: 'Enter a key first' };
  const { url, headers } = buildTestRequest(target, key);
  try {
    // TMDB v3 keys go in the query string (that is how TMDB wants them).
    const finalUrl = headers['x-tmdb-key'] ? `${url}?api_key=${encodeURIComponent(key.trim())}` : url;
    const { 'x-tmdb-key': _drop, ...realHeaders } = headers;
    const res = await fetch(finalUrl, { headers: realHeaders });
    return interpretStatus(res.status);
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your internet.' };
  }
}
