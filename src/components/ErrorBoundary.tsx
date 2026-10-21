import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors so a single malformed message cannot blank the app.
 *
 * Deliberately shows nothing about the error. Stack traces and error messages
 * in a cryptographic application can reveal internal state — which key failed,
 * what shape a payload had — and the user cannot act on any of it anyway.
 * They get a reload button; that is the only useful action.
 *
 * Nothing is reported anywhere. There is no error-tracking service in this
 * app on purpose: an exception payload from a messenger is exactly the kind of
 * thing that ends up containing message content.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only, and only in development.
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      // Colours here are literals rather than theme tokens: this boundary sits
      // above the theme provider, so a token could resolve to anything — and a
      // blank screen with an unreadable button is worse than the error it is
      // reporting. Slate-500 and emerald clear 4.5:1 on light and dark alike.
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="animate-rise">
          <p className="text-sm text-slate-500">Something went wrong.</p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="mt-4 h-11 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white
                       transition-colors duration-150 hover:bg-emerald-500"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
