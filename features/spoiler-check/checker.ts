import type { ChatImage, ChatMessage } from '../ai/types';

export type Verdict = { safe: boolean; reason: string };

const CHECKER_RULES = `You are a strict spoiler checker for a movie and show assistant.
The viewer has only seen what is in the TRANSCRIPT. You also get FACTS (real world info like actors and places).

Decide if the DRAFT ANSWER is safe to show.
It is UNSAFE if it contains anything the viewer could not know from the transcript and facts, such as:
- plot events, outcomes, deaths, twists, endings, or identities not yet shown
- details taken from the model's own memory of the movie or show
- hints, foreshadowing, or lines like "you will find out later" or "keep watching"
- characters or story roles that the transcript has not shown yet
General background about an idea (like what elves are) and a clearly labelled recap of an EARLIER movie or season are fine, as long as the answer does not tie them to events of the current movie that the transcript has not shown.
Things the viewer can see on screen right now are fine. If a SCREENSHOT is attached, describing what is visible in it is safe.
It is SAFE if every story claim is supported by the transcript, or if it honestly says we do not know yet.

Reply with JSON only, in this exact shape:
{"verdict":"safe" or "unsafe","reason":"one short sentence"}`;

export function buildCheckerMessages(args: {
  title: string;
  transcript: string;
  facts: string;
  question: string;
  draft: string;
  image?: ChatImage;
}): ChatMessage[] {
  return [
    { role: 'system', content: CHECKER_RULES },
    {
      role: 'user',
      content:
        `Title: ${args.title}\n\nTRANSCRIPT SO FAR:\n${args.transcript}\n\nFACTS:\n${args.facts || '(none)'}\n\n` +
        `VIEWER QUESTION:\n${args.question}\n\nDRAFT ANSWER:\n${args.draft}`,
      ...(args.image ? { image: args.image } : {}),
    },
  ];
}

// FAIL CLOSED: anything we cannot read counts as unsafe.
export function parseVerdict(raw: string): Verdict {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const data = JSON.parse(match[0]) as { verdict?: unknown; reason?: unknown };
      const reason = typeof data.reason === 'string' ? data.reason : '';
      if (data.verdict === 'safe') return { safe: true, reason };
      return { safe: false, reason: reason || 'The checker marked it unsafe.' };
    } catch {
      // fall through
    }
  }
  return { safe: false, reason: 'The checker reply could not be read.' };
}
