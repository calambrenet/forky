import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyInitialTheme } from './hooks/useTheme';
import './i18n';

// Apply theme synchronously before first render to prevent light-mode flash
applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
