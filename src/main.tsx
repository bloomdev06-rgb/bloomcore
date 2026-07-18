import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {hydrate} from './data';

// Apply persisted theme before first paint.
if (localStorage.getItem('bc_theme') === 'dark') document.documentElement.classList.add('dark');

// Hydrate le miroir IndexedDB avant le render : load() est synchrone et lit le miroir
// dans les initialiseurs useState, il doit donc être rempli avant le premier paint.
hydrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
