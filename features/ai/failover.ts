import { AiError } from './http';
import type { AiProvider, ChatMessage, ChatOptions } from './types';

// One AI we can call. Each has its own limit for how much transcript it can take.
export type Candidate = { id: string; provider: AiProvider; transcriptLimit: number; backup?: boolean };

export type AskOptions = ChatOptions & { needsVision?: boolean };

// Messages are built per candidate, because a small plan needs a shorter transcript.
export type Ask = (build: (transcriptLimit: number) => ChatMessage[], options?: AskOptions) => Promise<string>;

type Health = { avgMs?: number; failedAt?: number };

// Remembered between questions: how fast each AI is and when it last failed.
const sharedHealth = new Map<string, Health>();

const COOLDOWN_MS = 60_000; // after a failure, try the others first for a minute
const TIMEOUT_MS = 30_000;
const RETRY_PAUSE_MS = 2_000;

export function orderCandidates(candidates: Candidate[], health: Map<string, Health>, now: number): Candidate[] {
  const key = (c: Candidate) => {
    const h = health.get(c.id);
    const cooling = h?.failedAt !== undefined && now - h.failedAt < COOLDOWN_MS;
    return [cooling ? 1 : 0, c.backup ? 1 : 0, h?.avgMs ?? 0] as const;
  };
  return [...candidates].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

// Busy or rate limited or network trouble: worth trying again soon.
export function isTransient(e: unknown): boolean {
  const status = e instanceof AiError ? e.status : undefined;
  return status === undefined || status === 429 || status >= 500;
}

type Deps = { now?: () => number; sleep?: (ms: number) => Promise<void>; health?: Map<string, Health> };

// Tries the best AI first and only uses the next one if it fails.
// This uses far fewer tokens than asking every AI at once.
export function createAsk(candidates: Candidate[], deps: Deps = {}): Ask {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const health = deps.health ?? sharedHealth;

  return async (build, options) => {
    const canSee = candidates.filter((c) => c.provider.vision);
    const pool = options?.needsVision && canSee.length > 0 ? canSee : candidates;
    let failures: unknown[] = [];

    for (let pass = 0; pass < 2; pass++) {
      failures = [];
      for (const c of orderCandidates(pool, health, now())) {
        const started = now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const text = await c.provider.chat(build(c.transcriptLimit), { ...options, signal: controller.signal });
          const took = now() - started;
          const old = health.get(c.id)?.avgMs;
          health.set(c.id, { avgMs: old === undefined ? took : old * 0.6 + took * 0.4 });
          return text;
        } catch (e) {
          failures.push(controller.signal.aborted ? new AiError('The AI took too long to answer.') : e);
          health.set(c.id, { ...health.get(c.id), failedAt: now() });
        } finally {
          clearTimeout(timer);
        }
      }
      // Everything is busy: wait a moment and go around once more.
      if (pass === 0 && failures.every(isTransient)) await sleep(RETRY_PAUSE_MS);
      else break;
    }
    const texts = [...new Set(failures.map((e) => (e instanceof Error ? e.message : String(e))))];
    throw new AiError(texts.join(' '));
  };
}
