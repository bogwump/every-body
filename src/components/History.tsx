import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, Clock3, FlaskConical, Heart, RefreshCw, Sparkles, ChevronRight } from 'lucide-react';
import { buildTimelineEvents, filterTimelineEvents, getTimelineSummary, groupEventsByMonth, type TimelineEvent, type TimelineFilter } from '../lib/timelineBuilder';
import { reopenPatternForReview } from '../lib/patternFeedback';
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
  const [historyTick, setHistoryTick] = useState(0);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('everybody:v2:history-collapsed-months');
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed as Record<string, boolean> : {};
    } catch {
      return {};
    }
  });

  const events = useMemo(() => buildTimelineEvents(40), [historyTick]);
  const visible = useMemo(() => filterTimelineEvents(events, filter), [events, filter]);
  const summary = useMemo(() => getTimelineSummary(events), [events]);
  const grouped = useMemo(() => groupEventsByMonth(visible), [visible]);

  useEffect(() => {
    try {
      localStorage.setItem('everybody:v2:history-collapsed-months', JSON.stringify(collapsedMonths));
    } catch {
      // ignore
    }
  }, [collapsedMonths]);

  const empty = visible.length === 0;

  return (
    <div className="eb-page">
      <div className="eb-page-inner">
      <div className="eb-page-header">
        <h1 className="eb-page-title">History</h1>
        <p className="eb-page-support">A timeline of patterns, experiments, and rhythm shifts you have corrected or confirmed.</p>
      </div>
      <section className="eb-card eb-hero eb-hero-rich eb-hero-lg eb-hero-on-dark overflow-hidden">
        <div className="eb-card-header">
          <div className="min-w-0 flex-1">
            <h2 className="eb-hero-title text-white">Your story so far</h2>
            <p className="mt-2 eb-hero-subtitle text-white/85">
              {summary.patterns} pattern{summary.patterns === 1 ? '' : 's'} discovered · {summary.helpfulExperiments} experiment{summary.helpfulExperiments === 1 ? '' : 's'} looked helpful · {summary.phaseChanges} phase shift{summary.phaseChanges === 1 ? '' : 's'} recorded
            </p>
          </div>
          <div className="eb-icon-frame eb-icon-frame--hero"><Clock3 className="w-5 h-5" /></div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className="eb-choice-pill"
                data-selected={active ? 'true' : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {empty ? (
        <section className="eb-card eb-card-soft">
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
          {grouped.map((group) => {
            const isCollapsed = !!collapsedMonths[group.label];
            return (
              <div key={group.label} className="space-y-3">
                <div className="px-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-[rgb(var(--color-text-secondary))] transition-opacity hover:opacity-80"
                    onClick={() => setCollapsedMonths((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
                    aria-expanded={!isCollapsed}
                    aria-controls={`history-month-${group.label.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span>{group.label}</span>
                  </button>
                </div>
                <div
                  id={`history-month-${group.label.replace(/\s+/g, '-').toLowerCase()}`}
                  className="overflow-hidden transition-all duration-300 ease-out"
                  style={{
                    maxHeight: isCollapsed ? '0px' : `${Math.max(520, group.events.length * 420)}px`,
                    opacity: isCollapsed ? 0 : 1,
                    transform: isCollapsed ? 'translateY(-6px)' : 'translateY(0)',
                    pointerEvents: isCollapsed ? 'none' : 'auto',
                  }}
                >
                  <div className="space-y-4 pt-1">
                    {group.events.map((event) => {
                      const Icon = iconForEvent(event.type);
                      const confidence = confidenceLabel(event.confidence);
                      return (
                        <article key={event.id} className="eb-card eb-card-soft">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 max-w-3xl">
                              <h3>{event.title}</h3>
                              <p className="mt-2 text-sm text-[rgb(var(--color-text))]">{event.description}</p>
                            </div>
                            <div className="eb-icon-frame"><Icon className="w-5 h-5" /></div>
                          </div>

                          {(event.evidence || (event.signals && event.signals.length) || confidence) ? (
                            <details className="eb-disclosure mt-4">
                              <summary>
                                <span>Why this is here</span>
                                <ChevronDown className="w-4 h-4 text-[rgb(var(--color-text-secondary))]" />
                              </summary>
                              <div>
                                {event.evidence ? (
                                  <p className="text-xs leading-5 text-[rgb(var(--color-text-secondary))]">
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
                            </details>
                          ) : null}

                          {(event.actionLabel && event.actionTarget) || (event.metadata?.patternDismissed && typeof event.metadata?.patternFeedbackId === 'string') ? (
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                              <div className="flex flex-wrap gap-3">
                                {event.actionLabel && event.actionTarget ? (
                                  <button
                                    type="button"
                                    className="eb-btn eb-btn-primary"
                                    onClick={() => navigateToTarget(event.actionTarget, onNavigate)}
                                  >
                                    {event.actionLabel}
                                  </button>
                                ) : null}
                                {event.metadata?.patternDismissed && typeof event.metadata?.patternFeedbackId === 'string' ? (
                                  <button
                                    type="button"
                                    className="eb-btn eb-btn-secondary"
                                    onClick={() => {
                                      reopenPatternForReview(String(event.metadata?.patternFeedbackId), 0.45);
                                      setHistoryTick((v) => v + 1);
                                    }}
                                  >
                                    Undo correction
                                  </button>
                                ) : null}
                              </div>
                              <div className="text-xs text-[rgb(var(--color-text-secondary))] whitespace-nowrap sm:text-right">{fmtDate(event.date)}</div>
                            </div>
                          ) : (
                            <div className="mt-4 flex justify-end">
                              <div className="text-xs text-[rgb(var(--color-text-secondary))] whitespace-nowrap">{fmtDate(event.date)}</div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
      </div>
    </div>
  );
}
