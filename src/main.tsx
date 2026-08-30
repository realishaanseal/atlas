import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installViewportHeight } from './utils/viewport';
import './styles/index.css';

// Before first paint: pins the app to the genuinely visible height, so a PWA
// launched from a home-screen shortcut cannot render taller than the screen
// and push the composer out of view. The public site opts out of this again
// (see cover/cover.css) because a page of notes has to scroll.
installViewportHeight();

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

// The theme provider deliberately does NOT wrap the app here. It is only ever
// consumed inside the conversation, and mounting it at the root would put the
// palette engine — and an IndexedDB open — on the critical path of every visit
// to the public site. It lives in pages/ChatRoot.tsx instead.
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
