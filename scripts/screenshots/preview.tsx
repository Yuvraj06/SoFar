import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../shared/theme.css';
import './preview.css';
import { ChatView } from '../../features/chat/ChatView';
import { SettingsForm } from '../../features/settings/SettingsForm';
import { installFakeBrowser } from './fake-browser';

// Which screen to show: ?scene=chat | settings | hero
const scene = new URLSearchParams(location.search).get('scene') ?? 'chat';
installFakeBrowser({ webSearch: scene === 'settings' });

function Hero() {
  // A browser window: a made-up video on the left, the real side panel on the right.
  return (
    <div className="hero">
      <div className="window">
        <div className="titlebar">
          <i /> <i /> <i />
          <span>hotstar.com/shows/night-train/watch</span>
        </div>
        <div className="body">
          <div className="player">
            <div className="sky" />
            <div className="subtitle">Mara, wait for me.</div>
            <div className="controls">
              <span>21:00</span>
              <div className="bar"><div className="fill" /></div>
              <span>46:40</span>
            </div>
          </div>
          <div className="panel">
            <ChatView />
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    {scene === 'settings' ? <SettingsForm /> : scene === 'hero' ? <Hero /> : <ChatView />}
  </React.StrictMode>,
);
