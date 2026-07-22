import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
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
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </StrictMode>,
  );
});

// PWA : SW network-first (offline shell + réception Web Push). Prod uniquement (pas en dev
// Vite, pour ne pas interférer avec le HMR) et seulement en contexte sécurisé (HTTPS/localhost)
// — le navigateur refuse l'enregistrement sinon, donc rien à activer tant que le domaine HTTPS
// n'est pas en place. ponytail: register après load pour ne pas concurrencer le 1er paint.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* SW indispo (http nu) : app OK sans */ });
  });
}
