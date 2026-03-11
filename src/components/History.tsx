import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, FlaskConical, Heart, RefreshCw, Sparkles } from 'lucide-react';
import { buildTimelineEvents, filterTimelineEvents, getTimelineSummary, groupEventsByMonth, type TimelineEvent, type TimelineFilter } from '../lib/timelineBuilder';
import { safeFormatISODate } from '../lib/browserSafe';

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
  return safeFormatISODate(iso, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }, iso);
}

function iconForEvent(type: TimelineEvent['type']) {
  switch (type) {
    case 'phase_change':
      return RefreshCw;
    case 'pattern_discovered':
    case 'pattern_strengthened':
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

function confidenceLabel(value?: string): string | null {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text === 'very_low') return 'Very low confidence';
  if (text === 'low') return 'Low confidence';
  if (text === 'moderate' || text === 'medium') return 'Moderate confidence';
  if (text === 'high') return 'High confidence';
  return null;
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
  const summary = useMemo(() => getTimelineSummary(events), [events]);
  const grouped = useMemo(() => groupEventsByMonth(visible), [visible]);

  const empty = visible.length === 0;

  return (
    <div className="px-4 pt-6 pb-28 md:px-8 md:pb-10 max-w-5xl mx-auto space-y-6">
      <section className="eb-hero-surface eb-hero-on-dark rounded-3xl p-6 shadow-lg overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[rgba(255,255,255,0.18)] border border-[rgba(255,255,255,0.18)] text-white flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-white/75">History</div>
            <h1 className="mt-1 text-white">Your story so far</h1>
            <p className="mt-3 text-sm text-white/85">
              {summary.patterns} pattern{summary.patterns === 1 ? '' : 's'} discovered · {summary.helpfulExperiments} experiment{summary.helpfulExperiments === 1 ? '' : 's'} looked helpful · {summary.phaseChanges} phase shift{summary.phaseChanges === 1 ? '' : 's'} recorded
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
                    ? 'bg-white/20 text-white border-white/25'
                    : 'bg-white/8 text-white/85 border-white/18 hover:bg-white/12 hover:text-white'
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
        <section className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label} className="space-y-4">
              <div className="px-1">
                <div className="text-xs uppercase tracking-[0.18em] text-[rgb(var(--color-text-secondary))]">{group.label}</div>
              </div>
              {group.events.map((event) => {
                const Icon = iconForEvent(event.type);
                const confidence = confidenceLabel(event.confidence);
                return (
                  <article key={event.id} className="eb-card">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-2xl bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-primary))] flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 max-w-3xl">
                            <h3>{event.title}</h3>
                            <p className="mt-2 text-sm text-[rgb(var(--color-text))]">{event.description}</p>
                            {event.evidence ? (
                              <p className="mt-2 text-xs leading-5 text-[rgb(var(--color-text-secondary))]">
                                <span className="font-medium text-[rgb(var(--color-text))]">Why this is here:</span> {event.evidence}
                              </p>
                            ) : null}
                            {event.signals && event.signals.length ? (
                              <p className="mt-2 text-xs leading-5 text-[rgb(var(--color-text-secondary))]">
                                <span className="font-medium text-[rgb(var(--color-text))]">Signals involved:</span> {event.signals.join(' • ')}
                              </p>
                            ) : null}
                            {confidence ? (
                              <p className="mt-2 text-xs leading-5 text-[rgb(var(--color-text-secondary))]">
                                <span className="font-medium text-[rgb(var(--color-text))]">Confidence:</span> {confidence}
                              </p>
                            ) : null}
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
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
