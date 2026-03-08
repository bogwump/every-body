import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, FlaskConical, Heart, RefreshCw, Sparkles } from 'lucide-react';
import { buildTimelineEvents, filterTimelineEvents, type TimelineEvent, type TimelineFilter } from '../lib/timelineBuilder';

interface HistoryProps {
  onNavigate: (screen: string) => void;
}

const FILTERS: Array<{ key: TimelineFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'rhythm', label: 'Rhythm' },
];

function fmtDate(iso: string): string {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function iconForEvent(type: TimelineEvent['type']) {
  switch (type) {
    case 'phase_change':
      return RefreshCw;
    case 'pattern_discovered':
      return Sparkles;
    case 'helpful_pattern':
      return Heart;
    case 'experiment_started':
      return FlaskConical;
    case 'experiment_completed':
    case 'experiment_helped':
      return CheckCircle2;
    case 'rhythm_shift':
      return Activity;
    default:
      return Clock3;
  }
}

function summaryLine(events: TimelineEvent[]): string {
  const patterns = events.filter((event) => event.type === 'pattern_discovered').length;
  const helped = events.filter((event) => event.type === 'experiment_helped').length;
  const shifts = events.filter((event) => event.type === 'phase_change' || event.type === 'rhythm_shift').length;

  const bits = [
    `${patterns} pattern${patterns === 1 ? '' : 's'} discovered`,
    `${helped} experiment${helped === 1 ? '' : 's'} looked helpful`,
    `${shifts} rhythm shift${shifts === 1 ? '' : 's'} recorded`,
  ];

  return bits.join(' · ');
}

function setPageFocus(target?: string) {
  if (!target || !target.includes(':')) return;
  try {
    localStorage.setItem('everybody:v2:page_focus', target);
  } catch {
    // ignore
  }
}

function navigateToTarget(target: string | undefined, onNavigate: (screen: string) => void) {
  if (!target) return;
  setPageFocus(target);
  const screen = target.split(':')[0];
  if (screen === 'rhythm') {
    onNavigate('rhythm');
    return;
  }
  onNavigate(screen);
}

export function History({ onNavigate }: HistoryProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const events = useMemo(() => buildTimelineEvents(40), []);
  const visible = useMemo(() => filterTimelineEvents(events, filter), [events, filter]);

  const empty = visible.length === 0;

  return (
    <div className="px-4 pt-6 pb-28 md:px-8 md:pb-10 max-w-5xl mx-auto space-y-6">
      <section className="eb-card">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-primary))] flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-text-secondary))]">History</div>
            <h1 className="mt-1">Your story so far</h1>
            <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">
              {summaryLine(events)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={[
                  'px-4 py-2 rounded-full text-sm transition-colors border',
                  active
                    ? 'bg-[rgb(var(--color-primary)/0.12)] text-[rgb(var(--color-primary))] border-[rgb(var(--color-primary)/0.22)]'
                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-secondary))] border-[rgb(228_228_231_/_0.8)] hover:text-[rgb(var(--color-text))]'
                ].join(' ')}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {empty ? (
        <section className="eb-card">
          <h3>Your story is just getting started</h3>
          <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))] max-w-2xl">
            As you log symptoms, phases, and experiments, this timeline will begin to show the patterns and progress that matter most.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="eb-btn eb-btn-primary" onClick={() => onNavigate('calendar')}>
              Head to Calendar
            </button>
            <button type="button" className="eb-btn eb-btn-secondary" onClick={() => onNavigate('rhythm')}>
              Explore Rhythm
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {visible.map((event) => {
            const Icon = iconForEvent(event.type);
            return (
              <article key={event.id} className="eb-card">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-primary))] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3>{event.title}</h3>
                        <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">{event.description}</p>
                      </div>
                      <div className="text-xs text-[rgb(var(--color-text-secondary))] whitespace-nowrap">{fmtDate(event.date)}</div>
                    </div>

                    {event.actionLabel && event.actionTarget ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          className="eb-btn eb-btn-secondary"
                          onClick={() => navigateToTarget(event.actionTarget, onNavigate)}
                        >
                          {event.actionLabel}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
