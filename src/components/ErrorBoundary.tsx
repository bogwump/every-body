import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    // Keep this lightweight. Vercel/console will capture it; we just avoid a blank screen.
    // eslint-disable-next-line no-console
    console.error('EveryBody crashed:', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]">
          <div className="mx-auto max-w-[560px] p-5">
            <div className="eb-card">
              <div className="text-lg font-semibold">Something went wrong</div>
              <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">
                Try closing and reopening the app. If this keeps happening, exporting your data (Insights page) can help you keep a backup while we fix it.
              </p>
              <button
                type="button"
                className="eb-btn-primary mt-4"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
