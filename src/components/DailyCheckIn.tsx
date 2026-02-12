import React, { useEffect, useMemo, useState } from 'react';
import {
  Battery,
  Moon,
  Heart,
  Droplet,
  Zap,
  Brain,
  Wind,
  Smile,
  Meh,
  Frown,
  Sparkles,
  Calendar,
  ChevronRight,
  Pencil,
  FlaskConical,
} from 'lucide-react';

import type { CheckInEntry, SymptomKey, UserData, ExperimentPlan, InsightMetricKey } from '../types';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { isoToday } from '../lib/analytics';
import { useEntries, useExperiment } from '../lib/appStore';

interface DailyCheckInProps {
  userData: UserData;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onDone: () => void;
  /** If provided, the check-in opens for this date (used by calendar + edit). */
  initialDateISO?: string;
  /** Optional navigation helper (e.g. open calendar / profile). */
  onNavigate?: (screen: string) => void;
}

const moodIcons: Array<{ value: 1 | 2 | 3; icon: React.ElementType; label: string }> = [
  { value: 1, icon: Frown, label: 'Low' },
  { value: 2, icon: Meh, label: 'Okay' },
  { value: 3, icon: Smile, label: 'Good' },
];

// Stored symptom values are now treated as 0–10.
// (Calendar + analytics already normalise if older entries used 0–100.)
const sliderMeta: Record<SymptomKey, { label: string; icon: React.ElementType; hint?: string }> = {
  energy: { label: 'Energy', icon: Battery, hint: 'How much fuel you have in the tank' },
  sleep: { label: 'Sleep quality', icon: Moon, hint: 'Quality of sleep, not just hours' },
  stress: { label: 'Stress', icon: Zap, hint: 'Mental pressure or feeling on edge' },
  anxiety: { label: 'Anxiety', icon: Zap, hint: 'Worry, racing thoughts' },
  irritability: { label: 'Irritability', icon: Zap, hint: 'Short fuse, feeling snappy' },
  focus: { label: 'Focus', icon: Brain, hint: 'Concentration and mental sharpness' },
  bloating: { label: 'Bloating', icon: Wind, hint: 'Fullness or swollen belly feeling' },
  digestion: { label: 'Digestion', icon: Wind, hint: 'Gut comfort and regularity' },
  nausea: { label: 'Nausea', icon: Wind, hint: 'Sick or queasy feeling' },
  pain: { label: 'Pain', icon: Heart, hint: 'Overall body pain or aches' },
  headache: { label: 'Headache', icon: Brain, hint: 'Head pain or pressure' },
  cramps: { label: 'Cramps', icon: Heart, hint: 'Lower belly cramps or spasms' },
  jointPain: { label: 'Joint pain', icon: Heart, hint: 'Stiff or sore joints' },
  flow: { label: 'Bleeding / spotting (optional)', icon: Droplet, hint: 'Bleeding or spotting level' },
  hairShedding: { label: 'Hair shedding', icon: Sparkles, hint: 'More hair loss than usual' },
  facialSpots: { label: 'Facial spots', icon: Sparkles, hint: 'Breakouts or spots on face' },
  cysts: { label: 'Cysts', icon: Heart, hint: 'Painful lumps or cystic spots' },
  brainFog: { label: 'Brain fog', icon: Brain, hint: 'Foggy thinking, forgetfulness' },
  fatigue: { label: 'Fatigue', icon: Battery, hint: 'Heavy tiredness or drained feeling' },
  dizziness: { label: 'Dizziness', icon: Brain, hint: 'Light-headed or unsteady' },
  appetite: { label: 'Appetite', icon: Battery, hint: 'Hunger and cravings' },
  libido: { label: 'Libido', icon: Heart, hint: 'Interest in sex' },
  breastTenderness: { label: 'Breast tenderness', icon: Heart, hint: 'Sore or tender breasts' },
  hotFlushes: { label: 'Hot flushes', icon: Sparkles, hint: 'Sudden heat and flushing' },
  nightSweats: { label: 'Night sweats', icon: Moon, hint: 'Waking sweaty at night' },
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalise10(v: any): number {
  if (typeof v !== 'number') return 0;
  // Support older 0–100 values
  const scaled = v > 10 ? Math.round(v / 10) : v;
  return clamp(scaled, 0, 10);
}


function band3From10(v: number): 0 | 1 | 2 {
  const n = clamp(v, 0, 10);
  if (n <= 3) return 0;
  if (n <= 6) return 1;
  return 2;
}

function bandColorNoAlpha(band: 0 | 1 | 2): string {
  // For controls (buttons/sliders) we use opaque colours for clarity.
  if (band === 0) return 'rgb(var(--color-primary-light))';
  if (band === 1) return 'rgb(var(--color-primary))';
  return 'rgb(var(--color-primary-dark))';
}

function bandBgAlpha(band: 0 | 1 | 2): string {
  // For button backgrounds on the hero card.
  if (band === 0) return 'rgb(var(--color-primary-light) / 0.35)';
  if (band === 1) return 'rgb(var(--color-primary) / 0.40)';
  return 'rgb(var(--color-primary-dark) / 0.45)';
}


function SwitchRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {hint && <div className="text-sm text-[rgb(var(--color-text-secondary))]">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-all ${
          checked ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
        }`}
        aria-pressed={checked}
      >
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function Slider10({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const v = clamp(value, 0, 10);
  const pct = (v / 10) * 100;
  // Nudge keeps the value pill visually centred near the ends (0/10)
  const nudgePx = (50 - pct) * 0.12;
  return (
    <div className="relative pt-5">
      <div
        className="absolute -top-0.5 text-xs px-2 py-0.5 rounded-full bg-[rgb(var(--color-surface))] shadow-sm border border-[rgb(228_228_231_/_0.6)] text-[rgb(var(--color-text))]"
        style={{ left: `calc(${pct}% + ${nudgePx}px)`, transform: 'translateX(-50%)' }}
        aria-hidden="true"
      >
        {v}
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={v}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: bandColorNoAlpha(band3From10(v)) }}
        aria-label="slider"
      />
      <div className="flex items-center justify-between text-xs text-[rgb(var(--color-text-secondary))] -mt-1">
        <span>{leftLabel ?? '0'}</span>
        <span>{rightLabel ?? '10'}</span>
      </div>
    </div>
  );
}

export function DailyCheckIn({ userData, onUpdateUserData, onDone, initialDateISO, onNavigate }: DailyCheckInProps) {
  const todayISO = isoToday();
  const activeDateISO = initialDateISO ?? todayISO;

  const addDaysISO = (dateISO: string, days: number) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const prevDateISO = useMemo(() => addDaysISO(activeDateISO, -1), [activeDateISO]);

  const { entries, upsertEntry } = useEntries();
  const { experiment } = useExperiment();
  const existingEntry = useMemo(
    () => entries.find((e) => e.dateISO === activeDateISO) ?? null,
    [entries, activeDateISO]
  );

  const prevEntry = useMemo(
    () => entries.find((e) => e.dateISO === prevDateISO) ?? null,
    [entries, prevDateISO]
  );

  const experimentStatus = useMemo(() => {
    if (!experiment) return null;
    const ex = experiment as ExperimentPlan;
    if (!ex.startDateISO) return null;
    const todayISO2 = new Date().toISOString().slice(0, 10);
    const start = new Date(ex.startDateISO + 'T00:00:00');
    const today = new Date(todayISO2 + 'T00:00:00');
    const dayIndex = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const day = dayIndex + 1;
    const done = dayIndex >= (ex.durationDays ?? 3);
    // Only show while active or just-finished
    return { ex, day: Math.max(1, day), done };
  }, [experiment]);

  const labelForMetric = (k: InsightMetricKey): string => {
    if (k === 'mood') return 'Overall mood';
    if (typeof k === 'string' && k.startsWith('custom:')) {
      const id = k.slice('custom:'.length);
      const s = (userData.customSymptoms ?? []).find((x) => x.id === id);
      return s?.label ?? 'Custom';
    }
    // built-in symptom
    return sliderMeta[k as SymptomKey]?.label ?? String(k);
  };

  const prevMoodLabel = useMemo(() => {
    const m = (prevEntry as any)?.mood as 1 | 2 | 3 | undefined;
    if (!m) return null;
    return m === 1 ? 'Low' : m === 2 ? 'Okay' : 'Good';
  }, [prevEntry]);

  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | null>(null);
  const [notes, setNotes] = useState('');
  const [showAllNotes, setShowAllNotes] = useState(false);

  const [values, setValues] = useState<Partial<Record<SymptomKey, number>>>({});
  const [customValues, setCustomValues] = useState<Record<string, number>>({});

  // When bleeding starts, ask whether this is a new period or just spotting/breakthrough.
  const [periodPromptOpen, setPeriodPromptOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<CheckInEntry | null>(null);
  // Behavioural influences (kept discreet, but not hidden)
  const [influencesOpen, setInfluencesOpen] = useState(false);
  const [eventsState, setEventsState] = useState<Record<string, boolean>>({});

  const isCycleEnabled = userData.cycleTrackingMode === 'cycle';

  // Initialise when date changes or entry loaded
  useEffect(() => {
    if (existingEntry) {
      setSelectedMood((existingEntry.mood as any) ?? null);
      setNotes(existingEntry.notes ?? '');

      const nextVals: any = {};
      for (const k of userData.enabledModules) {
        if (!sliderMeta[k]) continue;
        nextVals[k] = normalise10((existingEntry as any)?.values?.[k]);
      }
      // Keep any other stored values too (even if module got turned off later)
      setValues({ ...((existingEntry.values as any) ?? {}), ...nextVals });

      // Custom symptoms
      const nextCustom: Record<string, number> = {};
      for (const s of (userData.customSymptoms ?? [])) {
        if (!s?.enabled) continue;
        const raw = (existingEntry as any)?.customValues?.[s.id];
        nextCustom[s.id] = normalise10(raw) ?? 5;
      }
      setCustomValues({ ...((existingEntry as any)?.customValues ?? {}), ...nextCustom });

      const ev = { ...((existingEntry as any)?.events ?? {}) } as Record<string, boolean>;
      setEventsState(ev);
      setInfluencesOpen(Object.values(ev).some(Boolean));
      return;
    }

    // Defaults for a fresh day
    setSelectedMood(null);
    setNotes('');
    const defaults: Partial<Record<SymptomKey, number>> = {};
    for (const k of userData.enabledModules) {
      if (!sliderMeta[k]) continue;
      // default 5/10 for most symptoms, 0 for flow
      defaults[k] = k === 'flow' ? 0 : 5;
    }
    setValues(defaults);

    const customDefaults: Record<string, number> = {};
    for (const s of (userData.customSymptoms ?? [])) {
      if (!s?.enabled) continue;
      customDefaults[s.id] = 5;
    }
    setCustomValues(customDefaults);


    setEventsState({});
    setInfluencesOpen(false);
  }, [existingEntry, userData.enabledModules, userData.customSymptoms, activeDateISO]);

  const enabledSliders = useMemo(() => {
    return userData.enabledModules.filter((k) => k !== 'focus' && Boolean(sliderMeta[k]));
  }, [userData.enabledModules]);

  const enabledCustom = useMemo(() => {
    return (userData.customSymptoms ?? []).filter((s) => s && s.enabled && typeof s.label === 'string' && s.label.trim());
  }, [userData.customSymptoms]);

  // If an experiment is active, pin the experiment metrics to the top for the 3 days.
  const orderedSliders = useMemo(() => {
    if (!experimentStatus || experimentStatus.done) return enabledSliders;
    const focus = (experimentStatus.ex.metrics ?? []) as any[];
    const focusKeys = focus.filter((k) => typeof k === 'string' && k !== 'mood' && !String(k).startsWith('custom:')) as SymptomKey[];
    if (!focusKeys.length) return enabledSliders;

    const set = new Set(focusKeys);
    const pinned = enabledSliders.filter((k) => set.has(k));
    const rest = enabledSliders.filter((k) => !set.has(k));
    return [...pinned, ...rest];
  }, [enabledSliders, experimentStatus]);

  const orderedCustom = useMemo(() => {
    if (!experimentStatus || experimentStatus.done) return enabledCustom;
    const focus = (experimentStatus.ex.metrics ?? []) as any[];
    const focusIds = focus
      .filter((k) => typeof k === 'string' && String(k).startsWith('custom:'))
      .map((k) => String(k).replace('custom:', ''));
    if (!focusIds.length) return enabledCustom;
    const set = new Set(focusIds);
    const pinned = enabledCustom.filter((s) => set.has(s.id));
    const rest = enabledCustom.filter((s) => !set.has(s.id));
    return [...pinned, ...rest];
  }, [enabledCustom, experimentStatus]);


  const allNotes = useMemo(() => {
    return [...entries]
      .filter((e) => typeof (e as any).notes === 'string' && ((e as any).notes as string).trim().length > 0)
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
      .map((e) => ({
        dateISO: e.dateISO,
        note: (e as any).notes as string,
      }));
  }, [entries]);

  const formatNoteDate = (dateISO: string) => {
    const d = new Date(dateISO + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };


  const dateLabel = useMemo(() => {
    const d = new Date(activeDateISO + 'T00:00:00');
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [activeDateISO]);

  const handleSubmit = () => {
    const now = new Date().toISOString();

    const nextValues: any = { ...((existingEntry as any)?.values ?? {}), ...(values ?? {}) };

    // Normalise all tracked sliders to 0–10
    for (const k of enabledSliders) {
      const v = normalise10((values as any)?.[k]);
      nextValues[k] = v;
    }

    const nextEvents: any = {};

    // Behavioural influences (events)
    for (const [k, v] of Object.entries(eventsState)) {
      if (v) nextEvents[k] = true;
    }

    // Custom symptom values (0–10)
    const nextCustomValues: Record<string, number> = { ...((existingEntry as any)?.customValues ?? {}), ...(customValues ?? {}) };
    for (const s of enabledCustom) {
      const v = normalise10((customValues as any)?.[s.id]);
      if (v == null) continue;
      nextCustomValues[s.id] = v;
    }


    const next: CheckInEntry = {
      id: existingEntry?.id ?? `${Date.now()}`,
      dateISO: activeDateISO,
      mood: selectedMood ?? undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      values: nextValues,
      customValues: Object.keys(nextCustomValues).length ? nextCustomValues : undefined,
      events: Object.keys(nextEvents).length ? nextEvents : undefined,
      cycleStartOverride: (existingEntry as any)?.cycleStartOverride ?? undefined,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
    };

    // If bleeding starts today, ask whether this is a new period (cycle start) or spotting/breakthrough.
    // We only prompt when the user did not explicitly set a cycle start override.
    if (isCycleEnabled && !next.cycleStartOverride) {
      const to10 = (v: any): number => {
        if (typeof v !== 'number') return 0;
        const scaled = v > 10 ? Math.round(v / 10) : v;
        return Math.max(0, Math.min(10, scaled));
      };
      const todayFlow = to10((next as any)?.values?.flow);

      const prev = entries.find((e) => e.dateISO === addDaysISO(activeDateISO, -1));
      const prevFlowRaw = to10((prev as any)?.values?.flow);
      const prevFlow = (prev as any)?.breakthroughBleed ? 0 : prevFlowRaw;

      const startedBleeding = todayFlow > 0 && prevFlow === 0;

      // If we already marked this day as breakthrough previously, do not re-prompt.
      const alreadyBreakthrough = Boolean((existingEntry as any)?.breakthroughBleed);

      if (startedBleeding && !alreadyBreakthrough) {
        // If the user prefers not to be asked each time, auto-start the period.
        if (userData.autoStartPeriodFromBleeding) {
          upsertEntry({ ...(next as any), cycleStartOverride: true, breakthroughBleed: undefined } as any);
          onDone();
          return;
        }

        setPendingEntry(next);
        setPeriodPromptOpen(true);
        return;
      }
    }

    upsertEntry(next as any);
    onDone();
  };

  return (
    <div className="eb-page">
      <Dialog
        open={periodPromptOpen}
        onOpenChange={(open) => {
          setPeriodPromptOpen(open);
          if (!open) setPendingEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Is this the start of a new period?</DialogTitle>
            <DialogDescription>
              If you choose <span className="font-semibold">Start period</span>, we will mark today as a cycle start and add a period window on your calendar.
              If it is just spotting/breakthrough, we will log it as bleeding without starting a new cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="eb-card mt-3">
            <p className="text-[rgb(var(--color-text-secondary))]">We save this result so your future insights can become more meaningful.</p>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="eb-btn-secondary"
              onClick={() => {
                setPeriodPromptOpen(false);
                setPendingEntry(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="eb-btn-secondary"
              onClick={() => {
                if (!pendingEntry) return;
                upsertEntry({ ...(pendingEntry as any), cycleStartOverride: undefined, breakthroughBleed: true } as any);
                setPeriodPromptOpen(false);
                setPendingEntry(null);
                onDone();
              }}
            >
              Just spotting
            </button>
            <button
              type="button"
              className="eb-btn-primary"
              onClick={() => {
                if (!pendingEntry) return;
                upsertEntry({ ...(pendingEntry as any), cycleStartOverride: true, breakthroughBleed: undefined } as any);
                setPeriodPromptOpen(false);
                setPendingEntry(null);
                onDone();
              }}
            >
              Start period
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="eb-page-inner max-w-3xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="mb-1">Daily check-in</h1>
            <p className="text-[rgb(var(--color-text-secondary))]">
              {dateLabel}
              {activeDateISO !== todayISO ? ' (edit)' : ''}
            </p>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="eb-btn-secondary inline-flex items-center gap-2"
              title="Open calendar"
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </button>
          )}
        </div>

        {userData.cycleTrackingMode === 'no-cycle' && (
          <div className="eb-card p-5 mb-6">
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              You can track symptoms even without a cycle. If you ever want cycle-phase insights, you can switch it on in Profile.
            </p>
          </div>
        )}

        {experimentStatus && !experimentStatus.done && (
          <div className="eb-inset rounded-2xl p-5 mb-6">
            <div className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Experiment in progress (Day {experimentStatus.day}/{experimentStatus.ex.durationDays})
            </div>
            <div className="mt-1 text-sm eb-muted">{experimentStatus.ex.title}</div>
            {experimentStatus.ex.metrics?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {experimentStatus.ex.metrics.slice(0, 6).map((k) => (
                  <span key={String(k)} className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>
                    {labelForMetric(k)}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 text-sm eb-muted">
              Tip: use yesterday as your anchor so today’s score is easier to judge.
            </div>
          </div>
        )}

        {/* Mood */}
        <div className="eb-card eb-hero-surface mb-6 p-6">
          <h3 className="mb-1 eb-hero-on-dark">Overall mood</h3>

          <p className="mb-4 text-sm eb-hero-on-dark" style={{ color: 'rgb(255 255 255)' }}>
            How are you feeling today?
          </p>

          {prevMoodLabel && (
            <p className="text-xs eb-hero-on-dark-muted" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Yesterday: <span className="font-semibold">{prevMoodLabel}</span>
            </p>
          )}

          {/* Mood buttons (high contrast, theme-driven) */}
          <div className="mt-2 flex justify-center">
            <div className="inline-flex gap-3 rounded-2xl bg-white/90 p-3 shadow-sm border border-black/5">
              {moodIcons.map((m) => {
                const Icon = m.icon;
                const selected = selectedMood === m.value;
                const band = (m.value - 1) as 0 | 1 | 2;

                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSelectedMood(m.value)}
                    aria-pressed={selected}
                    className={[
                      "group relative w-[86px] h-[92px] rounded-2xl border text-center",
                      "transition shadow-sm active:scale-[0.99]",
                      "hover:-translate-y-[1px] hover:shadow-md",
                      selected
                        ? "border-[rgb(var(--color-primary-dark)/0.35)]"
                        : "border-black/10 bg-white",
                    ].join(" ")}
                    style={selected ? { background: bandColorNoAlpha(band) } : undefined}
                  >
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Icon
                        className="w-8 h-8"
                        strokeWidth={2.25}
                        style={{ color: selected ? "white" : "rgb(var(--color-primary-dark))" }}
                      />
                      <span
                        className={
                          "text-sm font-medium " +
                          (selected ? "text-white" : "text-[rgb(var(--color-text))]")
                        }
                      >
                        {m.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        {/* Sliders */}
        <div className="eb-card mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="mb-0">Your check-in</h3>
            {onNavigate && (
              <button
                type="button"
                className="text-sm text-[rgb(var(--color-primary))] hover:underline inline-flex items-center gap-1"
                onClick={() => onNavigate('profile')}
              >
                Customise <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-5">Only what you choose to track.</p>

          <div className="space-y-5">
            {orderedSliders.map((key) => {
              const meta = sliderMeta[key];
              const Icon = meta.icon;
              const current = normalise10((values as any)?.[key]);
              const prevRaw = (prevEntry as any)?.values?.[key];
              const prevVal = typeof prevRaw === 'number' ? normalise10(prevRaw) : null;

              return (
                <div key={key} className="rounded-2xl border border-[rgba(0,0,0,0.06)] p-4 bg-white">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{meta.label}</div>
                        {meta.hint ? (
                          <div className="text-xs text-[rgb(var(--color-text-secondary))]">{meta.hint}</div>
                        ) : null}
                        <div className="text-xs text-[rgb(var(--color-text-secondary))]">
                          {current}/10
                          {prevVal != null ? (
                            <span className="ml-2">• Yesterday: {prevVal}/10</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-[rgb(var(--color-text-secondary))]">{current}</div>
                  </div>

                  <Slider10
                    value={current}
                    onChange={(n) => setValues((prev) => ({ ...prev, [key]: n }))}
                    leftLabel={key === 'flow' ? '0' : '0'}
                    rightLabel={key === 'flow' ? '10' : '10'}
                  />
                </div>
              );
            })}
          </div>
        </div>

          {orderedCustom.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="mb-1">Your custom symptoms</h3>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">What you chose in Profile.</p>
                </div>
              </div>

              <div className="space-y-3">
                {orderedCustom.map((s) => {
                  const current = typeof (customValues as any)?.[s.id] === 'number' ? (customValues as any)[s.id] : 5;
                  const prevVal = normalise10((prevEntry as any)?.customValues?.[s.id]);
                  return (
                    <div key={s.id} className="eb-card p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="font-semibold">{s.label}</div>
                          {prevVal != null ? (
                            <div className="text-xs text-[rgb(var(--color-text-secondary))] mt-1">Yesterday: {prevVal}/10</div>
                          ) : (
                            <div className="text-xs text-[rgb(var(--color-text-secondary))] mt-1">Yesterday: not logged</div>
                          )}
                        </div>
                        <div className="text-sm font-medium text-[rgb(var(--color-text-secondary))]">{current}</div>
                      </div>

                      <Slider10
                        value={current}
                        onChange={(n) => setCustomValues((prev) => ({ ...prev, [s.id]: n }))}
                        leftLabel="0"
                        rightLabel="10"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}



        {/* Other influences */}
        <div className="eb-card mb-6">
          <button
            type="button"
            onClick={() => setInfluencesOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3"
          >
            <div className="text-sm font-semibold text-[rgb(var(--color-text))]">Other influences</div>
            <ChevronRight
              className={`w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform ${influencesOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {influencesOpen && (
            <div className="grid grid-cols-1 gap-3 mt-3">
              {[
                {
                  key: 'sex',
                  label: 'Intimacy',
                  hint: 'Logged privately. Helps spot patterns with mood, confidence, bleeding and more.',
                },
                { key: 'exercise', label: 'Workout', hint: 'Any workout or brisk activity.' },
                { key: 'travel', label: 'Travel', hint: 'Travel, long drives, or time zone changes.' },
                { key: 'illness', label: 'Illness', hint: 'Cold, flu, infection, or feeling unwell.' },
                { key: 'alcohol', label: 'Alcohol', hint: 'More than your usual.' },
                { key: 'lateNight', label: 'Late night', hint: 'Later bedtime or disrupted routine.' },
                { key: 'stressfulDay', label: 'Stressful day', hint: 'High stress or emotional strain.' },
                { key: 'medication', label: 'Medication', hint: 'Any medication today (yes/no). Useful for pattern spotting.' },
              ].map((item) => (
                <SwitchRow
                  key={item.key}
                  checked={Boolean(eventsState[item.key])}
                  onChange={(checked) =>
                    setEventsState((prev) => ({
                      ...prev,
                      [item.key]: checked,
                    }))
                  }
                  label={item.label}
                  hint={item.hint}
                />
              ))}
            </div>
          )}
        </div>


        {/* Notes */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0 mt-0.5">
              <Pencil className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="mb-1">Notes (optional)</h3>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">Anything worth remembering today?</p>
                </div>

                <button
                  type="button"
                  className="text-sm text-[rgb(var(--color-primary))] hover:underline shrink-0"
                  onClick={() => setShowAllNotes(true)}
                >
                  View all notes
                </button>
              </div>

              <div className="mt-3">
                <textarea
                  className="eb-input resize-none overflow-auto transition-[height]"
                  placeholder="Add a quick note..."
                  value={notes}
                  rows={3}
                  style={{ minHeight: '64px', maxHeight: '200px' }}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    // auto-grow (caps at 200px, then becomes scrollable)
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 200) + 'px';
                  }}
                />
              </div>
            </div>
          </div>

          {/* All notes modal */}
          {showAllNotes && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-label="All notes"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowAllNotes(false)}
                aria-label="Close"
              />

              <div className="relative w-full max-w-2xl eb-card p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="font-semibold">All notes</div>
                    <div className="text-sm text-[rgb(var(--color-text-secondary))]">Only visible to you. Tap outside to close.</div>
                  </div>
                  <button
                    type="button"
                    className="eb-btn-secondary"
                    onClick={() => setShowAllNotes(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-auto pr-1">
                  {allNotes.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--color-text-secondary))]">No notes yet.</div>
                  ) : (
                    <div className="space-y-4">
                      {allNotes.map((n) => (
                        <div key={n.dateISO} className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
                          <div className="text-sm font-medium">{formatNoteDate(n.dateISO)}</div>
                          <div className="mt-2 text-sm whitespace-pre-wrap">{n.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


        <div className="flex items-center justify-end gap-2">
          <button type="button" className="eb-btn-secondary" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="eb-btn-primary" onClick={handleSubmit}>
            Save
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
