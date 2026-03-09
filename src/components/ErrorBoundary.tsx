import React from 'react';
import { clearRuntimeDebug, pushRuntimeDebug, readRuntimeDebug, serialiseError, type DebugEntry } from '../lib/runtimeDebug';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorText: string;
  logs: DebugEntry[];
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorText: '', logs: [] };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, errorText: serialiseError(error), logs: readRuntimeDebug() };
  }

  componentDidCatch(err: unknown) {
    pushRuntimeDebug('app-boundary', 'EveryBody crashed', serialiseError(err));
    this.setState({ logs: readRuntimeDebug(), errorText: serialiseError(err) });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearLog = () => {
    clearRuntimeDebug();
    this.setState({ logs: [], errorText: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const logs = this.state.logs.slice(-8).reverse();

    return (
      <div className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]">
        <div className="mx-auto max-w-[720px] p-5 space-y-4">
          <div className="eb-card">
            <div className="text-lg font-semibold">Something went wrong</div>
            <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">
              The app has caught the crash so it does not fail silently. The latest error is shown below and the recent debug log has been saved on this device.
            </p>
            {this.state.errorText ? (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-muted))] p-3 text-xs text-[rgb(var(--color-text-secondary))]">{this.state.errorText}</pre>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="eb-btn-primary mt-0"
                onClick={this.handleReload}
              >
                Reload
              </button>
              <button
                type="button"
                className="eb-btn-secondary mt-0"
                onClick={this.handleClearLog}
              >
                Clear debug log
              </button>
            </div>
          </div>

          {logs.length ? (
            <div className="eb-card space-y-2">
              <div className="text-sm font-semibold text-[rgb(var(--color-text))]">Recent debug log</div>
              {logs.map((log, index) => (
                <div key={`${log.atISO}-${index}`} className="rounded-2xl border border-[rgb(var(--color-border))] bg-white/70 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-[rgb(var(--color-primary-dark))]">{log.scope}</div>
                  <div className="mt-1 text-sm font-medium text-[rgb(var(--color-text))]">{log.message}</div>
                  <div className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">{log.atISO}</div>
                  {log.details ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-[rgb(var(--color-text-secondary))]">{log.details}</pre> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
