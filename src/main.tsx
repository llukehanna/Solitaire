import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/global.css';
import './styles/themes.css';
import './styles/table.css';
import './styles/chrome.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// In autoUpdate mode this reloads the page once an updated service worker activates, so an open tab never keeps
// asking for hashed assets (like the solver worker) that the new deploy no longer serves. Game state is saved
// after every move and on pagehide, so the reload loses nothing.
registerSW({ immediate: true });
