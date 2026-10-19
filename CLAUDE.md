# CLAUDE.md

## What we are building

A Chrome extension: a spoiler-free AI chatbot for movies and shows.

- The user watches something on a streaming site.
- They open a chat in the Chrome side panel and ask questions.
- The AI only knows what has happened **up to the current playback time**.
- If the answer is later in the movie, it says something like "We don't know that yet" or "The movie hasn't told us that so far."

Origin: the user Googled a question mid-movie and got spoiled. This extension must never do that.

## About the user (read this first)

- The user is a beginner at software development. Explain things simply.
- Give step-by-step instructions for anything they must do themselves (installing, running, testing).
- **Before building any new part or making a change, ask first.** Propose 2 to 3 approaches with pros and cons of each, then wait for their pick.
- For any UI or design work, show 3 to 4 genuinely different versions to choose from before going deep on one.
- Writing style for explanations: short sentences, one idea per line, bullets over paragraphs. Plain casual wording is fine.
- Never use em dashes or en dashes in anything you write (code comments, docs, messages).

## Decisions already made

| Topic | Decision |
|---|---|
| Framework | WXT, React template, TypeScript, Manifest V3 |
| Browser | Chrome first |
| Sites | Hotstar (JioHotstar) first, then Netflix, then Prime Video |
| How we get the story text | Download the full subtitle file, then cut it at the current playback time |
| What counts as "seen" | The current playback time only. Rewind = the AI knows less. Keep it simple. |
| Chat UI | Chrome side panel (it is fine that it hides in fullscreen) |
| AI providers | Gemini and Groq, user picks one. Each user brings their own API key. |
| Spoiler safety | Strict system prompt + a separate spoiler checker step |
| Movie title | Sent to the AI (needed for search). Not hidden. |
| Extra info search | TMDB for cast/characters/crew + our own "search, filter, then answer" web pipeline |

## Project structure (vertical slices)

Group code by feature, not by type, so several people can work in parallel without conflicts. Each slice owns its own components, logic, types and tests.

```
entrypoints/
  background.ts          # thin: wires slices together, message routing
  sidepanel/             # thin: mounts the chat slice
  hotstar.content.ts     # thin: mounts the hotstar subtitle reader
  options/               # thin: mounts the settings slice
features/
  subtitles/             # get subtitles + playback time, per site
    hotstar/
    netflix/             # later
    prime/               # later
    vtt-parser.ts
    cut-at-time.ts
  chat/                  # side panel chat UI and conversation state
  ai/                    # provider interface + gemini + groq adapters
  search/                # TMDB client + filtered web search pipeline
  spoiler-check/         # checker step that reviews answers
  settings/              # API keys, provider choice, options page UI
shared/                  # only truly shared things (message types, storage helpers)
```

Rules:
- Entrypoints stay thin. Real logic lives in `features/`.
- Slices talk through clearly typed messages or small exported functions, not by reaching into each other's internals.
- A site-specific subtitle reader must expose the same interface so new sites plug in easily, for example: `getSubtitleCues(): Promise<Cue[]>`, `getCurrentTime(): number`, `getTitle(): string`.

## Hotstar findings (verified live in Chrome, Oct 2026)

Tested on a JioHotstar episode playing at `hotstar.com/in/shows/.../watch`.

- Streaming is **DASH**. Video and audio are Widevine DRM protected. We do not touch them.
- The page loads a manifest file ending in `.mpd` from `ak-mediavod.hotstar.com`. The URL carries an `hdnea=` token query string.
- The manifest has a **text AdaptationSet**: `contentType="text"`, `mimeType="text/vtt"`, `lang="en"`, `label="English"`, Role `subtitle`. It is **not** DRM protected.
- It is **one single .vtt file for the whole title**, not segments. The test episode had about 694 cues covering the full runtime.
- URL resolution: the Period has `<BaseURL>dash/</BaseURL>` and the subtitle Representation has `<BaseURL>../subtitle.vtt</BaseURL>`. Resolve each BaseURL relative to the previous one, starting from the .mpd URL. In practice this lands on `subtitle.vtt` in the same folder as the .mpd. Always resolve properly with `new URL()`; do not hardcode the path.
- Fetching the .vtt worked both with and without the `hdnea` token. Keep the token anyway to be safe.
- The video element is a normal `<video>`. `video.currentTime` and `video.duration` are readable. The video's `textTracks` list was empty (the player renders subtitles itself), so we cannot rely on `textTracks`.
- The title is in `document.title`, for example `Watch The Office S5 Episode 19 on JioHotstar`. Parse the show/movie name, season and episode from it.
- Hotstar is a single page app. When the user moves to another title, a new .mpd loads. Detect this and reset the subtitle cache.
- Some titles may have no subtitles, or only non English ones. Handle that gracefully and tell the user in the chat.

Open implementation choice (ask the user, give pros and cons): how to discover the .mpd URL.
- Background `chrome.webRequest.onCompleted` listening for `*.mpd` on Hotstar hosts.
- Reading `performance.getEntriesByType('resource')` from a script running in the page's main world.
- Hooking `fetch`/`XMLHttpRequest` in the main world.

## The spoiler-safety rules (most important part)

1. **Future subtitles never leave the extension.** Only cues with `start <= currentTime` may be sent to any API, search query, or checker.
2. Cut the transcript at the moment the user presses send, not when the panel opened.
3. Send the transcript with timestamps so the AI can reason about "when" things happened.
4. The system prompt must say, in effect:
   - You are watching alongside the user. You only know what is in the transcript so far plus filtered search facts.
   - Do not use your own memory of this movie or show, even if you recognise it.
   - If the answer is not in what has been shown, say so in a friendly way ("We don't know that yet").
   - Never hint, foreshadow, or say things like "you'll find out later" or "keep watching, it matters".
5. **Spoiler checker step:** after the main answer is generated, a second AI call receives the transcript so far, the question, and the draft answer. It returns a verdict (safe or unsafe) with a short reason. If unsafe, replace the answer with a safe "we don't know yet" style reply (or regenerate once, then fall back).
6. Never include episode summaries, synopses or reviews in the context unless they cover only what was already watched.

## Extra info search (TMDB + filtered web pipeline)

Purpose: answer things the subtitles do not say (who is that actor, where is this set, what song is this) without leaking plot.

- **TMDB**: cast, character names, crew, setting basics. The user supplies a free TMDB API key in settings. Avoid plot overview fields beyond what is safe.
- **Web pipeline**:
  1. The AI writes a narrow factual search query (no plot words).
  2. The extension runs the search.
  3. A filter step strips anything about plot, endings, deaths, twists, or future events.
  4. Only cleaned facts go to the main answer step.
  5. The spoiler checker still reviews the final answer.
- Open decision (ask the user with pros and cons): which search source to use for step 2, for example Gemini with Google Search grounding used only inside the filter step, Groq's built-in search capable models, or a separate search API with its own user key.

## AI providers

- Build one small provider interface in `features/ai/` (for example `chat(messages, options)`), with a Gemini adapter and a Groq adapter.
- Groq's API is OpenAI compatible.
- Do not hardcode model names from memory. Check the current Gemini and Groq docs before choosing default models, and make the model configurable in settings.
- A full movie's subtitles is roughly 20k to 30k tokens. Gemini handles this easily. Check Groq model context limits; if a model is too small, trim older dialogue or summarise only the already watched part.

## Settings and privacy

- API keys (Gemini, Groq, TMDB) are stored in `chrome.storage.local` only. Never sync them, never log them, never send them anywhere except their own provider.
- No backend server. Everything runs in the extension.
- Request the narrowest host permissions needed (Hotstar hosts, the AI provider APIs, TMDB, the search API).

## Build order (milestones)

Do one at a time. Ask the user before starting each one.

1. **Hello extension**: WXT React project runs with `npm run dev`; an empty side panel opens.
2. **Hotstar subtitle reader**: detect the .mpd, download and parse the .vtt, read current time and title. Show a debug view in the side panel ("Title, 37 lines seen so far").
3. **Settings page**: provider choice, API key fields, a "Test key" button.
4. **Basic chat**: ask a question, send the cut transcript to Gemini, show the answer.
5. **Groq adapter**.
6. **Spoiler checker**.
7. **TMDB facts**.
8. **Filtered web search pipeline**.
9. **Netflix reader**, then **Prime reader** (investigate each site first, like Hotstar above).

## How to work in this repo

- Explain what you are about to do in a few bullets before doing it.
- After each milestone, tell the user exactly how to test it by hand (which page, what to click, what they should see).
- Keep files small and readable. Add short comments where a beginner would get lost.
- Write unit tests for pure logic (VTT parsing, cutting at time, URL resolution, title parsing).
- Commands the user will run: `npm install`, `npm run dev`, `npm run build`.
