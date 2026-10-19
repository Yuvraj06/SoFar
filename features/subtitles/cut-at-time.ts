import type { Cue } from './types';

// SPOILER RULE: only cues that have already started may be used anywhere.
export function cutAtTime(cues: Cue[], currentTime: number): Cue[] {
  return cues.filter((cue) => cue.start <= currentTime);
}
