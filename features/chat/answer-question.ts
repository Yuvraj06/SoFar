import type { ChatImage } from '../ai/types';
import type { Ask } from '../ai/failover';
import { buildCheckerMessages, parseVerdict } from '../spoiler-check/checker';
import { cutAtTime } from '../subtitles/cut-at-time';
import type { Cue } from '../subtitles/types';
import {
  buildAnswerMessages,
  CHECK_FAILED_REPLY,
  FALLBACK_REPLY,
  formatTranscript,
  recentLines,
  selectHistory,
  type ChatTurn,
} from './prompt';

export type Stage = 'answering' | 'checking' | 'retrying';

export type AnswerInput = {
  question: string;
  history: ChatTurn[];
  title: string;
  cues: Cue[]; // ALL cues. We cut them in here, at the moment of asking.
  currentTime: number; // playback time read when the user pressed send
  image?: ChatImage; // screenshot of the current frame, taken at the same moment
};

export type AnswerDeps = {
  ask: Ask;
  // Gets extra facts. It only receives cues that were already cut.
  getFacts: (recentSeenCues: Cue[]) => Promise<string>;
  onStage?: (stage: Stage) => void;
};

export type AnswerResult = { text: string; blocked: boolean };

// The whole flow: cut -> facts -> answer -> spoiler check (retry once) -> fallback.
// It makes 2 AI calls for a normal question (answer + check).
export async function answerQuestion(input: AnswerInput, deps: AnswerDeps): Promise<AnswerResult> {
  // SPOILER RULE 1 and 2: future cues are removed here and never used again.
  const seen = cutAtTime(input.cues, input.currentTime);
  const nowLines = recentLines(seen, input.currentTime);
  const history = selectHistory(input.history, input.currentTime);
  const needsVision = !!input.image;

  deps.onStage?.('answering');
  const facts = await deps.getFacts(seen.slice(-15)).catch(() => '');

  let rejection: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) deps.onStage?.('retrying');
    const draft = await deps.ask(
      (limit) =>
        buildAnswerMessages({
          title: input.title,
          currentTime: input.currentTime,
          transcript: formatTranscript(seen, limit),
          nowLines,
          image: input.image,
          facts,
          history,
          question: input.question,
          rejection,
        }),
      { temperature: 0.3, needsVision },
    );

    deps.onStage?.('checking');
    let verdict;
    try {
      const raw = await deps.ask(
        (limit) =>
          buildCheckerMessages({
            title: input.title,
            transcript: formatTranscript(seen, limit),
            facts,
            question: input.question,
            draft,
            image: input.image,
          }),
        { temperature: 0, json: true, needsVision },
      );
      verdict = parseVerdict(raw);
    } catch (e) {
      // FAIL CLOSED: if we could not check it, we do not show it. We do show why (never contains keys).
      const why = e instanceof Error ? e.message : 'unknown error';
      return { text: `${CHECK_FAILED_REPLY}\n\nReason: ${why}`, blocked: true };
    }
    if (verdict.safe) return { text: draft, blocked: false };
    rejection = verdict.reason;
  }
  return { text: FALLBACK_REPLY, blocked: true };
}
