import { useEffect, useRef, useState } from 'react';
import './chat.css';
import { SetupBanner } from '../settings/SetupBanner';
import { useSubtitleStatus, type SubtitleStatus } from '../subtitles/use-subtitle-status';
import { STAGE_LABELS, useChat } from './use-chat';

// One line under the title that tells the viewer what we can see.
function statusLine(s: SubtitleStatus): string {
  switch (s.state) {
    case 'idle':
      return s.message;
    case 'loading':
      return `${s.title}: loading subtitles...`;
    case 'no-subtitles':
      return `${s.title}: no English subtitles found`;
    case 'error':
      return `Problem: ${s.message}`;
    case 'ready':
      return `${s.title} (${s.seen} of ${s.total} lines seen)`;
  }
}

const openSettings = () => browser.runtime.openOptionsPage();

export function ChatView() {
  const status = useSubtitleStatus();
  const resetKey = 'mpdUrl' in status ? status.mpdUrl : undefined;
  const { messages, stage, send } = useChat(resetKey);
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stage]);

  const canSend = status.state === 'ready' && !stage && draft.trim().length > 0;

  function submit() {
    if (!canSend) return;
    send(draft);
    setDraft('');
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <div>
          <h1>SoFar</h1>
          <div className="chat-sub">{statusLine(status)}</div>
        </div>
        <button type="button" className="gear" title="Settings" aria-label="Open settings" onClick={openSettings}>
          ⚙
        </button>
      </div>

      <div className="chat-list">
        <SetupBanner />
        {messages.length === 0 && (
          <p className="chat-empty">Ask anything about what you have watched so far. I will not spoil the rest.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role} ${m.kind ?? ''}`}>
            {m.text}
            {m.note && <div className="bubble-note">{m.note}</div>}
            {m.kind === 'error' && (
              <div>
                <button type="button" className="link" onClick={openSettings}>
                  Open settings
                </button>
              </div>
            )}
          </div>
        ))}
        {stage && <div className="chat-stage">{STAGE_LABELS[stage]}</div>}
        <div ref={bottom} />
      </div>

      <div className="chat-input">
        <textarea
          rows={2}
          value={draft}
          placeholder={status.state === 'ready' ? 'Ask about the story so far...' : 'Play a Hotstar title first'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" onClick={submit} disabled={!canSend}>
          Send
        </button>
      </div>
    </div>
  );
}
