import React from 'react';
import { clearRuntimeDebug, pushRuntimeDebug, readRuntimeDebug, serialiseError, type DebugEntry } from '../lib/runtimeDebug';

type Props = {
  screenName: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorText: string;
  logs: DebugEntry[];
};

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    errorText: '',
    logs: [],
  };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      errorText: serialiseError(error),
      logs: readRuntimeDebug(),
    };
  }

  componentDidMount() {
    pushRuntimeDebug(`${this.props.screenName}-boundary`, `${this.props.screenName} boundary mounted`);
  }

  componentDidCatch(error: unknown) {
    pushRuntimeDebug(`${this.props.screenName}-boundary`, `${this.props.screenName} crashed`, serialiseError(error));
    this.setState({ logs: readRuntimeDebug(), errorText: serialiseError(error) });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearLog = () => {
    clearRuntimeDebug();
    this.setState({ logs: [], errorText: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const logs = this.state.logs.slice(-6).reverse();

    return (
      <div className="px-4 pb-24 pt-6 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="eb-card space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgb(var(--color-primary-dark))]">
                {this.props.screenName} hit an error
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-[rgb(var(--color-text))]">This page could not load</h1>
              <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">
                We have kept the rest of the app intact and saved the recent debug log below so it is easier to trace what went wrong on this device.
              </p>
            </div>

            {this.state.errorText ? (
              <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-muted))] p-3">
                <div className="text-sm font-medium text-[rgb(var(--color-text))]">Latest error</div>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-[rgb(var(--color-text-secondary))]">{this.state.errorText}</pre>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="eb-btn-primary mt-0" onClick={this.handleReload}>Reload</button>
              <button type="button" className="eb-btn-secondary mt-0" onClick={this.handleClearLog}>Clear debug log</button>
            </div>
          </section>

          {logs.length ? (
            <section className="eb-card space-y-3">
              <div className="text-sm font-semibold text-[rgb(var(--color-text))]">Recent debug log</div>
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div key={`${log.atISO}-${index}`} className="rounded-2xl border border-[rgb(var(--color-border))] bg-white/70 p-3">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-[rgb(var(--color-primary-dark))]">{log.scope}</div>
                    <div className="mt-1 text-sm font-medium text-[rgb(var(--color-text))]">{log.message}</div>
                    <div className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">{log.atISO}</div>
                    {log.details ? (
                      <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-[rgb(var(--color-text-secondary))]">{log.details}</pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    );
  }
}
