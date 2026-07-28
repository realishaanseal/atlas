import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './hooks/useTheme';
import { installViewportHeight } from './utils/viewport';
import './styles/index.css';

// Before first paint: pins the app to the genuinely visible height, so a PWA
// launched from a home-screen shortcut cannot render taller than the screen
// and push the composer out of view.
installViewportHeight();

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
