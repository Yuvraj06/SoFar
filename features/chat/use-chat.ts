import { useEffect, useRef, useState } from 'react';
import { activeProviderIds, createAskFromSettings } from '../ai';
import type { ChatImage } from '../ai/types';
import { gatherFacts } from '../search/gather-facts';
import { isReady, loadSettings, saveProviderModel } from '../settings/storage';
import { getSnapshot } from '../subtitles/hotstar/session';
import { formatTitle } from '../subtitles/hotstar/title';
import { answerQuestion, type Stage } from './answer-question';
import { captureScreen } from './capture-screen';
import type { ChatTurn } from './prompt';
import { looksVisual } from './visual';

export type UiMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'blocked' | 'error'; // assistant messages only
  note?: string; // small grey line under the message
};

export const STAGE_LABELS: Record<Stage, string> = {
  answering: 'Thinking',
  checking: 'Checking for spoilers',
  retrying: 'Trying again to be safe',
};

// Chat state for the side panel. resetKey changes when the viewer opens a new title.
export function useChat(resetKey: string | undefined) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const history = useRef<ChatTurn[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    setMessages([]);
    history.current = [];
  }, [resetKey]);

  const add = (m: Omit<UiMessage, 'id'>) => setMessages((prev) => [...prev, { ...m, id: nextId.current++ }]);

  async function send(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || stage) return;
    add({ role: 'user', text: question });
    setStage('answering');

    try {
      const settings = await loadSettings();
      if (!isReady(settings)) throw new Error('Add your API key in settings first.');

      // Read the playback time NOW, at the moment of sending.
      const snap = await getSnapshot();
      if (snap.status === 'loading') throw new Error('Subtitles are still loading. Try again in a moment.');
      if (snap.status === 'no-subtitles') throw new Error('This title has no English subtitles, so I cannot follow along.');
      if (snap.status === 'error' || snap.status === 'idle') throw new Error(snap.message);

      // Questions about what is on screen get a screenshot, taken at the same moment as the time.
      let image: ChatImage | undefined;
      let note: string | undefined;
      if (looksVisual(question)) {
        if (!activeProviderIds(settings).includes('gemini')) {
          note = 'Screenshots need a Gemini key, so I used subtitles only.';
        } else {
          const shot = await captureScreen();
          if (shot.ok) {
            image = shot.image;
            note = 'I looked at the screen.';
          } else {
            note =
              shot.reason === 'black'
                ? 'The screen came out black (protected video), so I used subtitles only.'
                : 'I could not capture the screen, so I used subtitles only.';
          }
        }
      }

      const { ask, asProvider } = createAskFromSettings(settings, (id, model) => {
        saveProviderModel(id, model); // a saved model did not exist, so we switched to one that works
      });
      const title = formatTitle(snap.title);
      const result = await answerQuestion(
        { question, history: history.current, title, cues: snap.cues, currentTime: snap.currentTime, image },
        {
          ask,
          onStage: setStage,
          getFacts: (recentSeenCues) =>
            gatherFacts({ settings, provider: asProvider, title: snap.title, question, recentSeenCues }),
        },
      );

      history.current.push(
        { role: 'user', content: question, atTime: snap.currentTime },
        { role: 'assistant', content: result.text, atTime: snap.currentTime },
      );
      add({ role: 'assistant', text: result.text, kind: result.blocked ? 'blocked' : undefined, note });
    } catch (e) {
      add({ role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.', kind: 'error' });
    } finally {
      setStage(null);
    }
  }

  return { messages, stage, send };
}
