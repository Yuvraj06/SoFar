import type { ChatImage, ChatMessage } from '../ai/types';
import type { Cue } from '../subtitles/types';

// 75 -> "01:15", 3725 -> "1:02:05"
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// One line per cue with its time. If the text is too long, the OLDEST lines are dropped.
export function formatTranscript(cues: Cue[], maxChars: number): string {
  const lines = cues.map((c) => `[${formatTimestamp(c.start)}] ${c.text.replace(/\s*\n\s*/g, ' ')}`);
  let total = lines.reduce((sum, l) => sum + l.length + 1, 0);
  let drop = 0;
  while (total > maxChars && drop < lines.length) {
    total -= (lines[drop]?.length ?? 0) + 1;
    drop++;
  }
  if (lines.length === 0) return '(nothing has been said yet)';
  const kept = lines.slice(drop).join('\n');
  return drop > 0 ? `[Earlier dialogue left out to fit the size limit]\n${kept}` : kept;
}

// A past chat message and the playback time when it happened.
export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  atTime: number;
};

// Rewind rule: if the viewer jumped back, forget turns from "the future".
// An old answer may contain things the viewer has now un-watched.
export function selectHistory(history: ChatTurn[], currentTime: number, maxTurns = 6): ChatMessage[] {
  return history
    .filter((t) => t.atTime <= currentTime)
    .slice(-maxTurns)
    .map((t) => ({ role: t.role, content: t.content }));
}

export const FALLBACK_REPLY = "We don't know that yet. The story hasn't told us that so far.";
export const CHECK_FAILED_REPLY = "I couldn't double check that answer for spoilers, so I'm not showing it. Please try again.";

const RULES = `You are watching a movie or show together with the viewer, like a friend sitting next to them.
You only know what is in the TRANSCRIPT below (everything said so far) plus the FACTS section.

Rules you must never break:
1. Do not use your own memory of this movie or show, even if you recognise it. Pretend you have never seen it.
2. Only state story claims that the transcript or the screenshot clearly support. FACTS may be used to explain things (see rules 5, 10 and 11).
3. If the answer is not in what has been shown so far, say so in a friendly way, for example "We don't know that yet" or "The story hasn't told us that so far".
4. Never hint, foreshadow, or say things like "you will find out later" or "keep watching, it matters".
5. FACTS may hold real world information (actors, filming places, music), general background about an idea, or a recap of an earlier movie or season. A name or detail in FACTS is not proof that it has appeared in THIS movie. Do not mention characters, roles or story details that the transcript has not shown.
6. The transcript has no speaker names or visuals. Be honest when you are unsure who said something.
7. Keep answers short and clear. No spoilers, no guesses about what happens next.
8. If a SCREENSHOT is attached, it shows exactly what the viewer sees right now. You may describe what is visible (people, places, objects, clothing). You cannot identify real people from their faces. Never name anyone from their face or from your memory of the actors.
9. To say who someone on screen is, rely on names in the RIGHT NOW lines or the rest of the transcript. If you are not sure, say what you can see and that you cannot tell who it is yet.
10. When you use general background (for example what elves are), explain it the way a friend would at this point in the movie. Keep it general, tie it to what the viewer has seen so far, and leave out details this movie has not shown yet.
11. When you use a recap of an earlier movie or season, say clearly that it is about the earlier part. Never connect it to what happens later in this movie.`;

export const NOW_WINDOW_SECONDS = 20;

// The cues from the last few seconds. Input must already be cut at the current time.
export function recentLines(seen: Cue[], currentTime: number): string {
  return seen
    .filter((c) => currentTime - c.start <= NOW_WINDOW_SECONDS)
    .map((c) => `[${formatTimestamp(c.start)}] ${c.text.replace(/\s*\n\s*/g, ' ')}`)
    .join('\n');
}

export function buildSystemPrompt(args: {
  title: string;
  currentTime: number;
  transcript: string;
  facts: string;
  nowLines?: string; // lines from the last few seconds, most likely what is on screen
  hasImage?: boolean;
  rejection?: string;
}): string {
  const parts = [
    RULES,
    `Title: ${args.title}`,
    `The viewer is at ${formatTimestamp(args.currentTime)} in the video.`,
    `TRANSCRIPT SO FAR:\n${args.transcript}`,
    `RIGHT NOW (dialogue from the last ${NOW_WINDOW_SECONDS} seconds, most likely what is on screen):\n${args.nowLines || '(silence)'}`,
    `FACTS:\n${args.facts || '(none)'}`,
  ];
  if (args.hasImage) parts.push('A SCREENSHOT of the current frame is attached to the viewer message.');
  if (args.rejection) {
    parts.push(
      `Your previous draft was rejected by the spoiler checker. Reason: ${args.rejection}\n` +
        `Write a new answer that avoids this. If you are not sure, say we don't know that yet.`,
    );
  }
  return parts.join('\n\n');
}

export function buildAnswerMessages(args: {
  title: string;
  currentTime: number;
  transcript: string;
  facts: string;
  nowLines?: string;
  image?: ChatImage;
  history: ChatMessage[];
  question: string;
  rejection?: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt({ ...args, hasImage: !!args.image }) },
    ...args.history,
    { role: 'user', content: args.question, ...(args.image ? { image: args.image } : {}) },
  ];
}
