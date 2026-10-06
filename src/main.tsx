import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// No service worker on this build: unregister any left over from earlier deploys
// (a stale cache-first worker can strand returning players on an old index.html).
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => void r.unregister())).catch(() => {});
  if ('caches' in window) void caches.keys().then(ks => ks.forEach(k => void caches.delete(k))).catch(() => {});
}
