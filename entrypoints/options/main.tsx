import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../shared/theme.css';
import { SettingsForm } from '../../features/settings/SettingsForm';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsForm />
  </React.StrictMode>,
);
