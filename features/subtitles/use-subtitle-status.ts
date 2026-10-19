import { useEffect, useState } from 'react';
import { cutAtTime } from './cut-at-time';
import { getSnapshot } from './hotstar/session';
import { formatTitle } from './hotstar/title';

export type SubtitleStatus =
  | { state: 'idle'; message: string }
  | { state: 'loading'; mpdUrl: string; title: string }
  | { state: 'no-subtitles'; mpdUrl: string; title: string }
  | { state: 'error'; message: string }
  | { state: 'ready'; mpdUrl: string; title: string; seen: number; total: number; currentTime: number };

// Checks the active tab once a second and reports how many subtitle lines have been seen.
export function useSubtitleStatus(): SubtitleStatus {
  const [status, setStatus] = useState<SubtitleStatus>({ state: 'idle', message: 'Starting...' });

  useEffect(() => {
    let stopped = false;

    async function tick() {
      const snap = await getSnapshot();
      if (stopped) return;
      switch (snap.status) {
        case 'idle':
          return setStatus({ state: 'idle', message: snap.message });
        case 'error':
          return setStatus({ state: 'error', message: snap.message });
        case 'loading':
          return setStatus({ state: 'loading', mpdUrl: snap.mpdUrl, title: formatTitle(snap.title) });
        case 'no-subtitles':
          return setStatus({ state: 'no-subtitles', mpdUrl: snap.mpdUrl, title: formatTitle(snap.title) });
        case 'ready':
          return setStatus({
            state: 'ready',
            mpdUrl: snap.mpdUrl,
            title: formatTitle(snap.title),
            seen: cutAtTime(snap.cues, snap.currentTime).length,
            total: snap.cues.length,
            currentTime: snap.currentTime,
          });
      }
    }

    const run = () => tick().catch((e) => !stopped && setStatus({ state: 'error', message: String(e) }));
    run();
    const id = setInterval(run, 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
