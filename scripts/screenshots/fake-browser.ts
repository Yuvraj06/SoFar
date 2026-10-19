// A pretend Chrome, so the real SoFar screens can run inside a normal web page.
// Used only to make the README screenshots. Everything here is sample data:
// a made-up show and made-up AI replies.

const MPD_URL = 'https://ak-mediavod.hotstar.com/videos/night-train/master.mpd?hdnea=demo';
const PAGE_TITLE = 'Watch Night Train S1 Episode 3 on JioHotstar';
export const CURRENT_TIME = 1260; // 21:00

const MPD_XML = `<?xml version="1.0"?>
<MPD><Period><BaseURL>dash/</BaseURL>
  <AdaptationSet contentType="text" mimeType="text/vtt" lang="en">
    <Representation id="s"><BaseURL>../subtitle.vtt</BaseURL></Representation>
  </AdaptationSet>
</Period></MPD>`;

const LINES = [
  'We have until sunrise.', 'Keep your voice down.', 'The signal lamp is broken.', 'Who gave you that map?',
  'I told you not to come back.', 'The conductor knows something.', 'Check the next carriage.', 'Do you hear that?',
  'Mara, wait for me.', 'This ticket is not for tonight.', 'Nobody leaves the platform.', 'I have seen this coat before.',
];

function makeVtt(): string {
  const stamp = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);
  let out = 'WEBVTT\n\n';
  for (let i = 0; i < 520; i++) {
    const start = i * 5.4;
    out += `${stamp(start)} --> ${stamp(start + 3)}\n${LINES[i % LINES.length]}\n\n`;
  }
  return out;
}

// Canned AI replies. The question decides what comes back.
function aiReply(system: string, lastUser: string): string {
  if (system.includes('strict spoiler checker')) {
    const unsafe = /escapes|ends up/i.test(lastUser.split('DRAFT ANSWER:')[1] ?? '');
    return unsafe
      ? '{"verdict":"unsafe","reason":"It states how the story ends."}'
      : '{"verdict":"safe","reason":"Everything is supported by the transcript."}';
  }
  const q = lastUser.toLowerCase();
  if (q.includes('end')) return 'Mara escapes the train before it reaches the last station and ends up safe.';
  if (q.includes('who is this') || q.includes('speaking')) {
    return 'I can see a woman in a green coat by the carriage window. Someone just called out "Mara, wait for me", so it is probably Mara, but I cannot be sure from the picture alone.';
  }
  return 'So far, Mara and the conductor are on a night train that nobody is allowed to leave. They are looking for the broken signal lamp, and someone gave Mara a map she does not trust.';
}

export function installFakeBrowser(opts: { webSearch?: boolean } = {}) {
  const settings = {
    provider: 'auto',
    gemini: { apiKey: 'demo-key', model: 'gemini-3.8-flash' },
    groq: { apiKey: 'demo-key', model: 'openai/gpt-oss-120b' },
    tmdbApiKey: '',
    webSearch: opts.webSearch ?? false,
  };

  const g = globalThis as unknown as Record<string, unknown>;
  g.browser = {
    tabs: {
      query: async () => [{ id: 1, windowId: 1 }],
      sendMessage: async () => ({ currentTime: CURRENT_TIME, duration: 2800, pageTitle: PAGE_TITLE }),
      captureVisibleTab: async () => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        const ctx = c.getContext('2d')!;
        const grad = ctx.createLinearGradient(0, 0, 320, 180);
        grad.addColorStop(0, '#6b5a4a');
        grad.addColorStop(1, '#2b3a55');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 320, 180);
        return c.toDataURL('image/jpeg', 0.8);
      },
    },
    storage: {
      session: { get: async (key: string) => ({ [key]: MPD_URL }) },
      local: { get: async () => ({ settings }), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: { openOptionsPage: () => {} },
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.includes('.mpd')) return new Response(MPD_XML);
    if (url.includes('subtitle.vtt')) return new Response(makeVtt());
    if (url.includes(':generateContent')) {
      await new Promise((r) => setTimeout(r, 650)); // so the "thinking" states are visible
      const body = JSON.parse(String(init?.body)) as {
        systemInstruction?: { parts: { text: string }[] };
        contents: { parts: { text: string }[] }[];
      };
      const system = body.systemInstruction?.parts[0]?.text ?? '';
      const last = body.contents.at(-1)?.parts[0]?.text ?? '';
      const text = aiReply(system, last);
      return json({ candidates: [{ content: { parts: [{ text }] } }] });
    }
    if (url.includes('/v1beta/models') || url.includes('/openai/v1/models')) {
      return json({ data: [{ id: 'demo' }], models: [] });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
