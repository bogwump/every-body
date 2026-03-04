import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import type { CheckInEntry, ExperimentPlan, InsightMetricKey, UserData } from '../types';
import { useExperiment } from '../lib/appStore';
import { isoFromDateLocal, isoTodayLocal } from '../lib/date';
import { computeExperimentComparison } from '../lib/experimentAnalysis';

import { Dialog } from './ui/dialog';
import { EBDialogContent } from './EBDialog';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './ui/carousel';

import {
  buildExperimentPlan,
  generateStrongSignalSuggestions,
  generateTryNextPrompts,
  labelForMetric,
  type SuggestedExperimentItem,
  type TryNextPrompt,
} from '../lib/experiments';

type MetricKey = InsightMetricKey;

type ExperimentRequest = null | { metrics: MetricKey[]; mode?: 'change' | 'track'; durationDays?: number };

const INFLUENCE_DEFS: Array<{ key: string; label: string }> = [
  { key: 'lateNight', label: 'Late night' },
  { key: 'socialising', label: 'Socialising' },
  { key: 'exercise', label: 'Workout' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'travel', label: 'Travel' },
  { key: 'illness', label: 'Feeling unwell' },
  { key: 'stressfulDay', label: 'Stressful day' },
  { key: 'medication', label: 'Medication' },
  { key: 'caffeine', label: 'Caffeine' },
  { key: 'lowHydration', label: 'Low hydration' },
  { key: 'sex', label: 'Intimacy' },
];

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoFromDateLocal(d);
}

function computeStartDateISO(entriesAllSorted: CheckInEntry[]): string {
  const todayISO = isoTodayLocal();
  const hasToday = Array.isArray(entriesAllSorted) && entriesAllSorted.some((e: any) => e?.dateISO === todayISO);
  return hasToday ? addDaysISO(todayISO, 1) : todayISO;
}

function isInfluenceEnabled(userData: UserData, key: string): boolean {
  const list = (userData as any)?.enabledInfluences;
  return Array.isArray(list) ? list.includes(key) : false;
}

interface ExperimentPanelProps {
  userData: UserData;
  selected: MetricKey[];
  entriesAllSorted: CheckInEntry[];
  entriesSorted: CheckInEntry[];
  allMetricKeys: MetricKey[];
  corrPairs: any[];
  findings: any[];
  experimentRequest?: ExperimentRequest;
  onConsumeExperimentRequest?: () => void;
  onOpenCheckIn?: (dateISO: string) => void;
  onUpdateUserData?: React.Dispatch<React.SetStateAction<UserData>>;
}

export default function ExperimentPanel(props: ExperimentPanelProps) {
  const {
    userData,
    selected,
    entriesAllSorted,
    entriesSorted,
    allMetricKeys,
    corrPairs,
    findings,
    experimentRequest,
    onConsumeExperimentRequest,
    onOpenCheckIn,
    onUpdateUserData,
  } = props;

  const { experiment, setExperiment } = useExperiment();

  const todayISO = isoTodayLocal();
  const hasLoggedToday = Array.isArray(entriesAllSorted) && entriesAllSorted.some((e: any) => e?.dateISO === todayISO);

  const experimentStatus = useMemo(() => {
    if (!experiment) return null;
    const ex = experiment as ExperimentPlan;
    const start = new Date(ex.startDateISO + 'T00:00:00');
    const today = new Date(todayISO + 'T00:00:00');
    const dayIndex = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const day = dayIndex + 1;
    const completedAtISO = (ex as any)?.outcome?.completedAtISO;
    const done = Boolean(completedAtISO) || dayIndex >= (ex.durationDays ?? 3);
    return { ex, day: Math.max(1, day), done, dayIndex };
  }, [experiment, todayISO]);

  const experimentWindow = useMemo(() => {
    if (!experimentStatus) return null;
    const ex = experimentStatus.ex as ExperimentPlan;
    const startISO = ex.startDateISO;
    const endISO = addDaysISO(startISO, (ex.durationDays ?? 3) - 1);
    const windowEntries = entriesAllSorted.filter((e) => e.dateISO >= startISO && e.dateISO <= endISO);
    const metrics = (ex.metrics ?? []).slice(0, 6) as MetricKey[];
    return { startISO, endISO, windowEntries, metrics };
  }, [experimentStatus, entriesAllSorted]);

  const experimentComparison = useMemo(() => {
    if (!experimentStatus) return null;
    try {
      return computeExperimentComparison({
        entries: entriesAllSorted,
        experiment: experimentStatus.ex as ExperimentPlan,
        user: userData,
        maxMetrics: 5,
      });
    } catch {
      return null;
    }
  }, [experimentStatus, entriesAllSorted, userData]);

  // Suggestions
  const tryNextPrompts: TryNextPrompt[] = useMemo(() => generateTryNextPrompts(entriesAllSorted, userData), [entriesAllSorted, userData]);

  const strongSignal: SuggestedExperimentItem[] = useMemo(
    () =>
      generateStrongSignalSuggestions({
        corrPairs,
        findings,
        entriesAllSorted,
        entriesSorted,
        allMetricKeys,
        userData,
      }),
    [corrPairs, findings, entriesAllSorted, entriesSorted, allMetricKeys, userData]
  );

  // Dialog state
  const [setupOpen, setSetupOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState<null | { outcome: 'helped' | 'notReally' | 'abandoned' }>(null);
  const [enableInfluencePrompt, setEnableInfluencePrompt] = useState<null | { key: string }>(null);

  const [mode, setMode] = useState<'change' | 'track'>('change');
  const [durationDays, setDurationDays] = useState<number>(3);
  const [metrics, setMetrics] = useState<MetricKey[]>([]);
  const [changeKey, setChangeKey] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('Your experiment');
  const [plan, setPlan] = useState<{ title: string; steps: string[]; note: string } | null>(null);

  // Notes
  const [outcomeNote, setOutcomeNote] = useState('');
  const lastExperimentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!experiment) {
      lastExperimentIdRef.current = null;
      setOutcomeNote('');
      return;
    }
    const ex = experiment as ExperimentPlan;
    if (lastExperimentIdRef.current !== ex.id) {
      lastExperimentIdRef.current = ex.id;
      const existing = (ex as any)?.outcome?.note;
      setOutcomeNote(typeof existing === 'string' ? existing : '');
    }
  }, [experiment]);

  const notePlaceholder = useMemo(() => {
    const o = finishOpen?.outcome;
    if (o === 'helped') return 'What improved? Anything you want to repeat next time?';
    if (o === 'notReally') return 'What did you notice? Anything you would change next time?';
    if (o === 'abandoned') return 'What got in the way? (Optional)';
    return 'Anything you want to remember about this experiment';
  }, [finishOpen]);

  const enableInfluenceKey = (k: string) => {
    if (!onUpdateUserData) return;
    onUpdateUserData((prev) => {
      const curr = Array.isArray((prev as any).enabledInfluences) ? ((prev as any).enabledInfluences as string[]) : [];
      const next = Array.from(new Set(curr.concat([k])));
      return { ...(prev as any), enabledInfluences: next } as any;
    });
  };

  const openSetup = (m: MetricKey[], opts?: { mode?: 'change' | 'track'; durationDays?: number; changeKey?: string; title?: string }) => {
    const focus = (m && m.length ? m : selected).slice(0, 5);
    const nextMode = opts?.mode ?? 'change';
    const nextDuration = typeof opts?.durationDays === 'number' ? opts.durationDays : nextMode === 'track' ? 7 : 3;
    const nextChangeKey = opts?.changeKey ?? '';

    setMode(nextMode);
    setDurationDays(nextDuration);
    setMetrics(focus);
    setChangeKey(nextChangeKey);
    setCustomTitle(opts?.title ?? (nextMode === 'track' ? 'Tracking experiment' : 'Your experiment'));

    if (nextMode === 'track') {
      setPlan({
        title: 'Tracking experiment',
        steps: [
          'Keep logging the selected measures each day (no changes needed).',
          'If you notice one tends to start first, add a quick note.',
          'After 7 days, review whether they truly move together.',
        ],
        note: 'This helps you predict what is coming next, without trying to “fix” a symptom.',
      });
    } else {
      setPlan(buildExperimentPlan(focus));
    }

    setSetupOpen(true);
  };

  // Consume request from Insights (eg tap a CTA elsewhere)
  useEffect(() => {
    if (!experimentRequest) return;
    openSetup(experimentRequest.metrics, {
      mode: experimentRequest.mode,
      durationDays: experimentRequest.durationDays,
    });
    onConsumeExperimentRequest?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentRequest]);

  const startExperiment = () => {
    const focus = (metrics.length ? metrics : selected).slice(0, 5);
    const startDateISO = computeStartDateISO(entriesAllSorted);

    // If user picked a changeKey that is not enabled, prompt to enable first
    if (mode === 'change' && changeKey && !isInfluenceEnabled(userData, changeKey)) {
      setEnableInfluencePrompt({ key: changeKey });
      return;
    }

    const ex: ExperimentPlan = {
      id: `exp_${Date.now()}`,
      startDateISO,
      durationDays,
      metrics: focus,
      ...(mode === 'change' ? { changeKey: changeKey || undefined, title: customTitle } : { title: customTitle, kind: 'track' }),
    } as any;

    setExperiment(ex);
    setSetupOpen(false);
  };

  const extendExperiment = (days: number) => {
    if (!experimentStatus) return;
    const ex = experimentStatus.ex as any;
    const next = { ...ex, durationDays: (ex.durationDays ?? 3) + days };
    setExperiment(next);
  };

  const finishExperiment = (outcome: 'helped' | 'notReally' | 'abandoned') => {
    if (!experimentStatus) return;
    const ex = experimentStatus.ex as any;
    const next = {
      ...ex,
      outcome: {
        ...(ex.outcome ?? {}),
        status: outcome,
        completedAtISO: isoTodayLocal(),
        note: outcomeNote,
      },
    };
    setExperiment(next);
    setFinishOpen(null);
  };

  const stopExperiment = () => {
    setStopOpen(false);
    setFinishOpen({ outcome: 'abandoned' });
  };

  const showLogToday = useMemo(() => {
    if (!experimentStatus || !experimentWindow) return false;
    const ex = experimentStatus.ex as ExperimentPlan;
    if (todayISO < ex.startDateISO) return false;
    if (todayISO > experimentWindow.endISO) return false;
    if (hasLoggedToday) return false;
    return true;
  }, [experimentStatus, experimentWindow, todayISO, hasLoggedToday]);

  const renderActiveCard = () => {
    if (!experimentStatus) {
      return (
        <div className="eb-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full eb-inset flex items-center justify-center">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Run a small experiment</div>
              <div className="text-sm eb-muted">Tiny, reversible tests that help you learn faster.</div>
            </div>
          </div>
          <div className="mt-4">
            <button type="button" className="eb-btn eb-btn-primary" onClick={() => openSetup(selected)}>
              Set up a 3-day experiment
            </button>
          </div>
        </div>
      );
    }

    const ex = experimentStatus.ex as any;
    const done = experimentStatus.done;
    const title = ex.title || (ex.kind === 'track' ? 'Tracking experiment' : '3-day experiment');

    return (
      <div className="eb-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-sm eb-muted">
              {done ? 'Complete' : `Day ${experimentStatus.day} of ${ex.durationDays ?? 3}`}
              {ex.startDateISO > todayISO ? ' (starts tomorrow)' : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showLogToday ? (
              <button type="button" className="eb-btn eb-btn-secondary" onClick={() => onOpenCheckIn?.(todayISO)}>
                Log today
              </button>
            ) : null}

            {!done ? (
              <>
                <button type="button" className="eb-btn eb-btn-secondary" onClick={() => extendExperiment(2)}>
                  Extend 2 days
                </button>
                <button type="button" className="eb-btn eb-btn-primary" onClick={() => setStopOpen(true)}>
                  Stop
                </button>
              </>
            ) : null}
          </div>
        </div>

        {experimentComparison ? (
          <div className="mt-4">
            <div className="text-sm eb-muted">Before vs during</div>
            <div className="mt-2 grid gap-2">
              {experimentComparison.metrics?.slice(0, 5).map((m: any) => (
                <div key={m.key} className="flex items-center justify-between rounded-xl eb-inset px-3 py-2">
                  <div className="text-sm font-medium">{labelForMetric(m.key as any, userData)}</div>
                  <div className="text-sm eb-muted">
                    {m.beforeAvg != null ? m.beforeAvg.toFixed(1) : '–'} → {m.duringAvg != null ? m.duringAvg.toFixed(1) : '–'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {done ? (
          <div className="mt-4">
            <div className="text-sm eb-muted">How did it go?</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setFinishOpen({ outcome: 'helped' })}>
                Yes, it helped
              </button>
              <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setFinishOpen({ outcome: 'notReally' })}>
                Not really
              </button>
              <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setFinishOpen({ outcome: 'abandoned' })}>
                I didn’t manage to run it
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4" id="experiments">
      {renderActiveCard()}

      <div className="eb-card">
        <div className="font-semibold">Try next</div>
        <div className="mt-1 text-sm eb-muted">Based on your recent logs. Tiny, reversible tests.</div>

        <div className="mt-4">
          <Carousel>
            <CarouselContent>
              {tryNextPrompts.map((p) => (
                <CarouselItem key={p.id} className="basis-full">
                  <div className="rounded-2xl eb-inset p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{p.title}</div>
                        <div className="mt-1 text-sm eb-muted">Pick one small, easy change you can actually do.</div>
                      </div>
                      <button
                        type="button"
                        className="eb-btn eb-btn-secondary"
                        onClick={() => openSetup(p.metrics, { mode: 'change', durationDays: p.durationDays, changeKey: p.changeKey, title: p.title })}
                      >
                        Try next
                      </button>
                    </div>

                    {p.why && p.why.length ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium">Why this suggestion?</summary>
                        <ul className="mt-2 space-y-1 text-sm eb-muted list-disc pl-5">
                          {p.why.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {p.metrics.slice(0, 5).map((k) => (
                        <span key={String(k)} className="eb-pill">
                          {labelForMetric(k as any, userData)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        className="eb-btn eb-btn-primary"
                        onClick={() => openSetup(p.metrics, { mode: 'change', durationDays: p.durationDays, changeKey: p.changeKey, title: p.title })}
                      >
                        <FlaskConical className="h-4 w-4" />
                        <span className="ml-2">Set up {p.durationDays}-day experiment</span>
                      </button>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      </div>

      <div className="eb-card">
        <div className="font-semibold">When the signal is strong</div>
        <div className="mt-1 text-sm eb-muted">Evidence-backed ideas, and tracking experiments for symptom pairs.</div>

        {strongSignal.length ? (
          <div className="mt-4">
            <Carousel>
              <CarouselContent>
                {strongSignal.map((it) => (
                  <CarouselItem key={it.id} className="basis-full">
                    <div className="rounded-2xl eb-inset p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{it.title}</div>
                          <div className="mt-1 text-sm eb-muted">{it.body}</div>
                        </div>
                        <button
                          type="button"
                          className="eb-btn eb-btn-secondary"
                          onClick={() => openSetup(it.metrics, { mode: it.kind ?? 'change', durationDays: it.durationDays })}
                        >
                          Try it
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(it.metrics || []).slice(0, 5).map((k) => (
                          <span key={String(k)} className="eb-pill">
                            {labelForMetric(k as any, userData)}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          className="eb-btn eb-btn-primary"
                          onClick={() => openSetup(it.metrics, { mode: it.kind ?? 'change', durationDays: it.durationDays })}
                        >
                          <FlaskConical className="h-4 w-4" />
                          <span className="ml-2">
                            Set up {it.durationDays ?? (it.kind === 'track' ? 7 : 3)}-day {it.kind === 'track' ? 'tracking' : 'experiment'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        ) : (
          <div className="mt-4 text-sm eb-muted">
            Keep logging a mix of how you feel and what is happening (sleep, stress, late nights, caffeine). As overlap builds, stronger experiment ideas show up here.
          </div>
        )}
      </div>

      {/* Setup dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <EBDialogContent className="max-w-xl">
          <div className="text-lg font-semibold">Set up an experiment</div>
          <div className="mt-2 text-sm eb-muted">Pick one thing to change, keep everything else simple, and log consistently.</div>

          <div className="mt-4">
            <div className="text-sm font-medium">Metrics to watch</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(metrics.length ? metrics : selected).slice(0, 5).map((k) => (
                <span key={String(k)} className="eb-pill">
                  {labelForMetric(k as any, userData)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <label className="text-sm font-medium">Title (optional)</label>
            <input
              className="eb-input"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={mode === 'track' ? 'Tracking experiment' : 'Your experiment'}
            />
          </div>

          <div className="mt-4 grid gap-2">
            <label className="text-sm font-medium">Duration</label>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={d === durationDays ? 'eb-btn eb-btn-primary' : 'eb-btn eb-btn-secondary'}
                  onClick={() => setDurationDays(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          {mode === 'change' ? (
            <div className="mt-4">
              <div className="text-sm font-medium">What are you changing?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {INFLUENCE_DEFS.map((inf) => (
                  <button
                    key={inf.key}
                    type="button"
                    className={inf.key === changeKey ? 'eb-btn eb-btn-primary' : 'eb-btn eb-btn-secondary'}
                    onClick={() => setChangeKey(inf.key)}
                  >
                    {inf.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-sm eb-muted">Pick one thing to change, if you can.</div>
            </div>
          ) : null}

          {plan ? (
            <div className="mt-5 rounded-2xl eb-inset p-4">
              <div className="font-semibold">{plan.title}</div>
              <ul className="mt-2 space-y-1 text-sm eb-muted list-disc pl-5">
                {plan.steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
              <div className="mt-3 text-sm eb-muted">{plan.note}</div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setSetupOpen(false)}>
              Cancel
            </button>
            <button type="button" className="eb-btn eb-btn-primary" onClick={startExperiment}>
              Start {durationDays}-day {mode === 'track' ? 'tracking' : 'experiment'}
            </button>
          </div>
        </EBDialogContent>
      </Dialog>

      {/* Enable influence prompt */}
      <Dialog open={!!enableInfluencePrompt} onOpenChange={(open) => (!open ? setEnableInfluencePrompt(null) : null)}>
        <EBDialogContent className="max-w-md">
          <div className="text-lg font-semibold">Turn on tracking?</div>
          <div className="mt-2 text-sm eb-muted">
            You picked “{INFLUENCE_DEFS.find((d) => d.key === enableInfluencePrompt?.key)?.label ?? enableInfluencePrompt?.key}”. To run an experiment against it,
            we should switch it on in your quick log.
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setEnableInfluencePrompt(null)}>
              Not now
            </button>
            <button
              type="button"
              className="eb-btn eb-btn-primary"
              onClick={() => {
                if (enableInfluencePrompt?.key) enableInfluenceKey(enableInfluencePrompt.key);
                setEnableInfluencePrompt(null);
                startExperiment();
              }}
            >
              Turn on
            </button>
          </div>
        </EBDialogContent>
      </Dialog>

      {/* Stop confirm */}
      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <EBDialogContent className="max-w-md">
          <div className="text-lg font-semibold">Stop experiment?</div>
          <div className="mt-2 text-sm eb-muted">Stopping early is fine. You can still save a note about what happened.</div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setStopOpen(false)}>
              Cancel
            </button>
            <button type="button" className="eb-btn eb-btn-primary" onClick={stopExperiment}>
              Stop now
            </button>
          </div>
        </EBDialogContent>
      </Dialog>

      {/* Finish dialog */}
      <Dialog open={!!finishOpen} onOpenChange={(open) => (!open ? setFinishOpen(null) : null)}>
        <EBDialogContent className="max-w-xl">
          <div className="text-lg font-semibold">Add a note (optional)</div>
          <div className="mt-2 text-sm eb-muted">This helps you remember what you learned and improves future suggestions.</div>
          <textarea
            className="eb-textarea mt-4"
            rows={5}
            value={outcomeNote}
            onChange={(e) => setOutcomeNote(e.target.value)}
            placeholder={notePlaceholder}
          />
          <div className="mt-6 flex items-center justify-end gap-2">
            <button type="button" className="eb-btn eb-btn-secondary" onClick={() => setFinishOpen(null)}>
              Back
            </button>
            <button type="button" className="eb-btn eb-btn-primary" onClick={() => finishExperiment(finishOpen!.outcome)}>
              Save
            </button>
          </div>
        </EBDialogContent>
      </Dialog>
    </div>
  );
}
