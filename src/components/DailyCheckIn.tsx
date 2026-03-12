import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  Leaf,
  SlidersHorizontal,
  Search,
  Plus,
} from 'lucide-react';

import type { CheckInEntry, SymptomKey, UserData, ExperimentPlan, InsightMetricKey } from '../types';

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { EBDialogContent } from "./EBDialog";
import { isoToday } from '../lib/analytics';
import { isoFromDateLocal } from '../lib/date';
import { useEntries, useExperiment } from '../lib/appStore';
import { applyPhaseChangeForEntries, phaseLabelFromKey } from '../lib/phaseChange';
import { hasResizeObserver } from '../lib/browserSafe';

const INFLUENCE_DEFS: Array<{ key: string; label: string; hint: string }> = [
  {
    key: 'sex',
    label: 'Intimacy',
    hint: 'Logged privately. Helps spot patterns with mood, confidence, bleeding and more.',
  },
  { key: 'exercise', label: 'Workout', hint: 'Any workout or brisk activity.' },
  { key: 'travel', label: 'Travel', hint: 'Travel, long drives, or time zone changes.' },
  { key: 'illness', label: 'Illness', hint: 'Cold, flu, infection, or feeling unwell.' },
  { key: 'alcohol', label: 'Alcohol', hint: 'More than your usual.' },
  { key: 'caffeine', label: 'Caffeine', hint: 'More caffeine than usual.' },
  { key: 'lateNight', label: 'Late night', hint: 'Later bedtime or disrupted routine.' },
  { key: 'stressfulDay', label: 'Stressful day', hint: 'High stress or emotional strain.' },
  { key: 'medication', label: 'Medication', hint: 'Any medication today (yes/no). Useful for pattern spotting.' },
  { key: 'socialising', label: 'Socialising', hint: 'More social than usual (or a big event).' },
  { key: 'lowHydration', label: 'Low hydration', hint: 'Less water than usual.' },
];


interface DailyCheckInProps {
  userData: UserData;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onDone: () => void;
  /** If provided, the check-in opens for this date (used by calendar + edit). */
  initialDateISO?: string;
  /** Optional navigation helper (e.g. open calendar / profile). */
  onNavigate?: (screen: string) => void;
  /** Called when the user dismisses the check-in without saving (eg Cancel). */
  onDismiss?: (dateISO: string) => void;
}

const moodIcons: Array<{ value: 1 | 2 | 3; icon: React.ElementType; label: string }> = [
  { value: 1, icon: Frown, label: 'Low' },
  { value: 2, icon: Meh, label: 'Okay' },
  { value: 3, icon: Smile, label: 'Good' },
];

// Stored symptom values are now treated as 0–10.
// (Calendar + analytics already normalise if older entries used 0–100.)
const sliderMeta: Record<SymptomKey, { label: string; icon: React.ElementType; hint?: string; leftLabel?: string; rightLabel?: string }> = {
  energy: { label: 'Energy', icon: Battery, hint: 'How much fuel you have in the tank', leftLabel: 'Low', rightLabel: 'High' },
  motivation: { label: 'Motivation', icon: Battery, hint: 'Drive and willingness to do things', leftLabel: 'Low', rightLabel: 'High' },
  sleep: { label: 'Sleep quality', icon: Moon, hint: 'Quality of sleep, not just hours', leftLabel: 'Poor', rightLabel: 'Great' },
  insomnia: { label: 'Insomnia', icon: Moon, hint: 'Trouble falling or staying asleep', leftLabel: 'None', rightLabel: 'Severe' },
  stress: { label: 'Stress', icon: Zap, hint: 'Mental pressure or feeling on edge', leftLabel: 'Calm', rightLabel: 'High' },
  anxiety: { label: 'Anxiety', icon: Zap, hint: 'Worry, racing thoughts', leftLabel: 'None', rightLabel: 'Severe' },
  irritability: { label: 'Irritability', icon: Zap, hint: 'Short fuse, feeling snappy', leftLabel: 'Calm', rightLabel: 'Snappy' },
  focus: { label: 'Focus', icon: Brain, hint: 'Concentration and mental sharpness', leftLabel: 'Foggy', rightLabel: 'Sharp' },
  bloating: { label: 'Bloating', icon: Wind, hint: 'Fullness or swollen belly feeling', leftLabel: 'None', rightLabel: 'Severe' },
  digestion: { label: 'Digestion', icon: Wind, hint: 'Gut comfort and regularity', leftLabel: 'Poor', rightLabel: 'Great' },
  nausea: { label: 'Nausea', icon: Wind, hint: 'Sick or queasy feeling', leftLabel: 'None', rightLabel: 'Severe' },
  acidReflux: { label: 'Acid reflux', icon: Wind, hint: 'Heartburn or reflux symptoms', leftLabel: 'None', rightLabel: 'Severe' },
  constipation: { label: 'Constipation', icon: Wind, hint: 'Hard stools or difficulty going', leftLabel: 'None', rightLabel: 'Severe' },
  diarrhoea: { label: 'Diarrhoea', icon: Wind, hint: 'Loose stools or urgency', leftLabel: 'None', rightLabel: 'Severe' },
  pain: { label: 'Pain', icon: Heart, hint: 'Overall body pain or aches', leftLabel: 'None', rightLabel: 'Severe' },
  headache: { label: 'Headache', icon: Brain, hint: 'Head pain or pressure', leftLabel: 'None', rightLabel: 'Severe' },
  migraine: { label: 'Migraine', icon: Brain, hint: 'Migraine-type headache', leftLabel: 'None', rightLabel: 'Severe' },
  backPain: { label: 'Back pain', icon: Heart, hint: 'Upper or lower back pain', leftLabel: 'None', rightLabel: 'Severe' },
  cramps: { label: 'Cramps', icon: Heart, hint: 'Lower belly cramps or spasms', leftLabel: 'None', rightLabel: 'Severe' },
  jointPain: { label: 'Joint pain', icon: Heart, hint: 'Stiff or sore joints', leftLabel: 'None', rightLabel: 'Severe' },
  flow: { label: 'Bleeding / spotting (optional)', icon: Droplet, hint: 'Bleeding or spotting level', leftLabel: 'None', rightLabel: 'Heavy' },
  hairShedding: { label: 'Hair shedding', icon: Sparkles, hint: 'More hair loss than usual', leftLabel: 'None', rightLabel: 'Severe' },
  facialSpots: { label: 'Facial spots', icon: Sparkles, hint: 'Breakouts or spots on face', leftLabel: 'Clear', rightLabel: 'Severe' },
  cysts: { label: 'Cysts', icon: Heart, hint: 'Painful lumps or cystic spots', leftLabel: 'None', rightLabel: 'Severe' },
  skinDryness: { label: 'Skin dryness', icon: Sparkles, hint: 'Dry, itchy, or sensitive skin', leftLabel: 'None', rightLabel: 'Severe' },
  brainFog: { label: 'Brain fog', icon: Brain, hint: 'Foggy thinking, forgetfulness', leftLabel: 'Clear', rightLabel: 'Severe' },
  fatigue: { label: 'Fatigue', icon: Battery, hint: 'Heavy tiredness or drained feeling', leftLabel: 'None', rightLabel: 'Severe' },
  dizziness: { label: 'Dizziness', icon: Brain, hint: 'Light-headed or unsteady', leftLabel: 'None', rightLabel: 'Severe' },
  appetite: { label: 'Appetite', icon: Battery, hint: 'Hunger and cravings', leftLabel: 'Low', rightLabel: 'High' },
  libido: { label: 'Libido', icon: Heart, hint: 'Interest in sex', leftLabel: 'Low', rightLabel: 'High' },
  breastTenderness: { label: 'Breast tenderness', icon: Heart, hint: 'Sore or tender breasts', leftLabel: 'None', rightLabel: 'Severe' },
  hotFlushes: { label: 'Hot flushes', icon: Sparkles, hint: 'Sudden heat and flushing', leftLabel: 'None', rightLabel: 'Severe' },
  nightSweats: { label: 'Night sweats', icon: Moon, hint: 'Waking sweaty at night', leftLabel: 'None', rightLabel: 'Severe' },
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

function formatYesterdayValue(v: number | null | undefined): string {
  if (v == null) return 'Yesterday not logged';
  return v <= 0 ? 'Yesterday none' : `Yesterday ${v}/10`;
}

function directionLabelsForCustom(label: string): { leftLabel: string; rightLabel: string } {
  const lower = label.toLowerCase();
  if (lower.includes('sleep')) return { leftLabel: 'Poor', rightLabel: 'Great' };
  if (lower.includes('energy') || lower.includes('motivation') || lower.includes('appetite') || lower.includes('libido')) {
    return { leftLabel: 'Low', rightLabel: 'High' };
  }
  if (lower.includes('focus') || lower.includes('clarity') || lower.includes('brain fog')) {
    return { leftLabel: 'Low', rightLabel: 'High' };
  }
  if (lower.includes('bleed') || lower.includes('spot')) return { leftLabel: 'None', rightLabel: 'Heavy' };
  return { leftLabel: 'None', rightLabel: 'Severe' };
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
        className={`shrink-0 w-12 h-6 rounded-full transition-all ${
          checked ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
        }`}
        aria-pressed={checked}
      >
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

type SymptomCandidate = {
  kind: 'builtIn' | 'custom';
  key: string;
  label: string;
  hint?: string;
  icon?: React.ElementType;
};

const CORE_SYMPTOMS: SymptomKey[] = ['sleep', 'energy'];

function symptomDefaultValue(key: SymptomKey): number {
  if (key === 'flow' || key === 'nightSweats') return 0;
  return 5;
}

function isRecentlyTouchedValue(value: unknown, key: SymptomKey) {
  if (typeof value !== 'number') return false;
  return normalise10(value) !== symptomDefaultValue(key);
}

function compareDateISO(a: string, b: string) {
  return a.localeCompare(b);
}

function buildPriorityMaps(entries: CheckInEntry[], activeDateISO: string, enabledSliders: SymptomKey[], enabledCustomIds: string[]) {
  const earlierEntries = [...entries]
    .filter((entry) => compareDateISO(entry.dateISO, activeDateISO) < 0)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const yesterdayTouched = new Set<string>();
  const recentTouched = new Set<string>();

  const yesterday = earlierEntries[0] ?? null;
  if (yesterday) {
    for (const key of enabledSliders) {
      if (isRecentlyTouchedValue((yesterday as any)?.values?.[key], key)) yesterdayTouched.add(key);
    }
    for (const id of enabledCustomIds) {
      if (typeof (yesterday as any)?.customValues?.[id] === 'number') yesterdayTouched.add(`custom:${id}`);
    }
  }

  const recentEntries = earlierEntries.slice(0, 7);
  for (const entry of recentEntries) {
    for (const key of enabledSliders) {
      if (isRecentlyTouchedValue((entry as any)?.values?.[key], key)) recentTouched.add(key);
    }
    for (const id of enabledCustomIds) {
      if (typeof (entry as any)?.customValues?.[id] === 'number') recentTouched.add(`custom:${id}`);
    }
  }

  return { yesterdayTouched, recentTouched };
}

function sortBuiltInSymptoms(keys: SymptomKey[], maps: { yesterdayTouched: Set<string>; recentTouched: Set<string> }) {
  const coreSet = new Set(CORE_SYMPTOMS);
  return [...keys].sort((a, b) => {
    const aCore = coreSet.has(a) ? 1 : 0;
    const bCore = coreSet.has(b) ? 1 : 0;
    if (aCore !== bCore) return bCore - aCore;

    const aYesterday = maps.yesterdayTouched.has(a) ? 1 : 0;
    const bYesterday = maps.yesterdayTouched.has(b) ? 1 : 0;
    if (aYesterday !== bYesterday) return bYesterday - aYesterday;

    const aRecent = maps.recentTouched.has(a) ? 1 : 0;
    const bRecent = maps.recentTouched.has(b) ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;

    return 0;
  });
}

function sortCustomSymptoms<T extends { id: string }>(items: T[], maps: { yesterdayTouched: Set<string>; recentTouched: Set<string> }) {
  return [...items].sort((a, b) => {
    const aKey = `custom:${a.id}`;
    const bKey = `custom:${b.id}`;
    const aYesterday = maps.yesterdayTouched.has(aKey) ? 1 : 0;
    const bYesterday = maps.yesterdayTouched.has(bKey) ? 1 : 0;
    if (aYesterday !== bYesterday) return bYesterday - aYesterday;

    const aRecent = maps.recentTouched.has(aKey) ? 1 : 0;
    const bRecent = maps.recentTouched.has(bKey) ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;

    return a.id.localeCompare(b.id);
  });
}

function Slider10({
  value,
  onPreviewChange,
  onCommit,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onPreviewChange?: (n: number) => void;
  onCommit: (n: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() => clamp(value, 0, 10));
  const dragValueRef = useRef(clamp(value, 0, 10));
  const draggingRef = useRef(false);
  const [trackMetrics, setTrackMetrics] = useState({ width: 0, thumbWidth: 32 });

  useEffect(() => {
    if (!draggingRef.current) {
      const next = clamp(value, 0, 10);
      setDraftValue(next);
      dragValueRef.current = next;
    }
  }, [value]);


  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const updateMetrics = () => {
      const styles = window.getComputedStyle(wrap);
      const thumbVar = styles.getPropertyValue('--eb-thumb-width').trim();
      const parsedThumb = Number.parseFloat(thumbVar);
      const thumbWidth = Number.isFinite(parsedThumb) ? parsedThumb : 32;
      setTrackMetrics({
        width: wrap.clientWidth,
        thumbWidth,
      });
    };

    updateMetrics();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateMetrics())
      : null;

    resizeObserver?.observe(wrap);
    window.addEventListener('resize', updateMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

  const updateVisual = useCallback((next: number) => {
    const safe = clamp(next, 0, 10);
    dragValueRef.current = safe;
    setDraftValue((prev) => (prev === safe ? prev : safe));
    onPreviewChange?.(safe);
  }, [onPreviewChange]);

  const commitCurrent = useCallback(() => {
    draggingRef.current = false;
    const safe = clamp(dragValueRef.current, 0, 10);
    onCommit(safe);
  }, [onCommit]);

  const setFromClientX = useCallback((clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = Math.min(rect.right, Math.max(rect.left, clientX));
    const ratio = rect.width ? (x - rect.left) / rect.width : 0;
    updateVisual(Math.round(ratio * 10));
  }, [updateVisual]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e as any).isPrimary === false) return;
    draggingRef.current = true;
    setFromClientX(e.clientX);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
    commitCurrent();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const onPointerCancel = () => {
    if (!draggingRef.current) return;
    commitCurrent();
  };

  const pct = `${(draftValue / 10) * 100}%`;
  const bubbleLeft = trackMetrics.width > 0
    ? ((trackMetrics.width - trackMetrics.thumbWidth) * (draftValue / 10)) + (trackMetrics.thumbWidth / 2)
    : 0;

  return (
    <div>
      <div
        ref={wrapRef}
        className="eb-range-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="eb-range-value-bubble"
          aria-hidden="true"
          style={{ left: `${bubbleLeft}px` }}
        >
          {draftValue}
        </div>

        <input
          ref={inputRef}
          type="range"
          min={0}
          max={10}
          step={1}
          value={draftValue}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            updateVisual(next);
          }}
          onMouseUp={commitCurrent}
          onTouchEnd={commitCurrent}
          className="eb-range w-full"
          style={{
            accentColor: 'rgb(var(--color-primary))',
            color: 'rgb(var(--color-primary))',
            ['--eb-range-fill' as any]: pct,
          }}
          aria-label="slider"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[rgb(var(--color-text-secondary))] px-1 mt-1 leading-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span>0</span>
          <span className="font-medium tracking-[0.01em]">{leftLabel ?? 'None'}</span>
        </div>
        <span>5</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium tracking-[0.01em]">{rightLabel ?? 'Severe'}</span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
}

export function DailyCheckIn({ userData, onUpdateUserData, onDone, initialDateISO, onNavigate, onDismiss }: DailyCheckInProps) {
  const safeBlur = () => {
    try { (document.activeElement as HTMLElement | null)?.blur(); } catch {}
  };
  const todayISO = isoToday();
  const activeDateISO = initialDateISO ?? todayISO;

  const addDaysISO = (dateISO: string, days: number) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return isoFromDateLocal(d);
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
    const todayISO2 = isoToday();
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
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [symptomSearch, setSymptomSearch] = useState('');

  const [sleepDetails, setSleepDetails] = useState<{
    timesWoke: 0 | 1 | 2 | 3;
    troubleFallingAsleep: 0 | 1 | 2;
    wokeTooEarly: boolean;
  }>({ timesWoke: 0, troubleFallingAsleep: 0, wokeTooEarly: false });

  // When bleeding starts, ask whether this is a new period or just spotting/breakthrough.
  const [periodPromptOpen, setPeriodPromptOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<CheckInEntry | null>(null);
  const [phaseChangeNotice, setPhaseChangeNotice] = useState<{ phase: string } | null>(null);
  // Behavioural influences (kept discreet, but not hidden)
  const [influencesOpen, setInfluencesOpen] = useState(false);
  const [eventsState, setEventsState] = useState<Record<string, boolean>>({});
  const [exerciseIntensity, setExerciseIntensity] = useState<'light' | 'moderate' | 'hard' | null>(null);

  const visibleInfluences = useMemo(() => {
    const enabledKeys = Array.isArray(userData.enabledInfluences)
      ? (userData.enabledInfluences as string[])
      : INFLUENCE_DEFS.map((x) => x.key);
    const enabled = new Set(enabledKeys);
    return INFLUENCE_DEFS.filter((x) => enabled.has(x.key));
  }, [userData.enabledInfluences]);

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

      // Sleep details (only shown if enabled in settings)
      if (userData.sleepDetailsEnabled) {
        const sd = (existingEntry as any)?.sleepDetails;
        setSleepDetails({
          timesWoke: (sd?.timesWoke ?? 0) as any,
          troubleFallingAsleep: (sd?.troubleFallingAsleep ?? 0) as any,
          wokeTooEarly: Boolean(sd?.wokeTooEarly ?? false),
        });
      } else {
        setSleepDetails({ timesWoke: 0, troubleFallingAsleep: 0, wokeTooEarly: false });
      }

      const ev = { ...((existingEntry as any)?.events ?? {}) } as Record<string, boolean>;
      setEventsState(ev);
      setExerciseIntensity(((existingEntry as any)?.eventsDetails?.exerciseIntensity as any) ?? null);
      setInfluencesOpen(false);
      return;
    }

    // Defaults for a fresh day
    setSelectedMood(null);
    setNotes('');
    const defaults: Partial<Record<SymptomKey, number>> = {};
    for (const k of userData.enabledModules) {
      if (!sliderMeta[k]) continue;
      const prevRaw = (prevEntry as any)?.values?.[k];
      defaults[k] = typeof prevRaw === 'number' ? normalise10(prevRaw) : symptomDefaultValue(k);
    }
    setValues(defaults);

    const customDefaults: Record<string, number> = {};
    for (const s of (userData.customSymptoms ?? [])) {
      if (!s?.enabled) continue;
      const prevRaw = (prevEntry as any)?.customValues?.[s.id];
      customDefaults[s.id] = typeof prevRaw === 'number' ? normalise10(prevRaw) : 5;
    }
    setCustomValues(customDefaults);


    // Sleep details
    if (userData.sleepDetailsEnabled) {
      const sd = (existingEntry as any)?.sleepDetails;
      setSleepDetails({
        timesWoke: (sd?.timesWoke ?? 0) as any,
        troubleFallingAsleep: (sd?.troubleFallingAsleep ?? 0) as any,
        wokeTooEarly: Boolean(sd?.wokeTooEarly ?? false),
      });
    } else {
      // keep stored values if any, but reset UI to defaults
      setSleepDetails({ timesWoke: 0, troubleFallingAsleep: 0, wokeTooEarly: false });
    }

    setEventsState({});
    setExerciseIntensity(null);
    setInfluencesOpen(false);
  }, [existingEntry, prevEntry, userData.enabledModules, userData.customSymptoms, activeDateISO]);

  // If someone turns Sleep details on/off mid-check-in, update just the sleep panel
  // without wiping anything else (like your ticked influences).
  useEffect(() => {
    if (!userData.sleepDetailsEnabled) {
      setSleepDetails({ timesWoke: 0, troubleFallingAsleep: 0, wokeTooEarly: false });
      return;
    }
    const sd = (existingEntry as any)?.sleepDetails;
    setSleepDetails({
      timesWoke: (sd?.timesWoke ?? 0) as any,
      troubleFallingAsleep: (sd?.troubleFallingAsleep ?? 0) as any,
      wokeTooEarly: Boolean(sd?.wokeTooEarly ?? false),
    });
  }, [userData.sleepDetailsEnabled, existingEntry, activeDateISO]);


  const enabledSliders = useMemo(() => {
    return userData.enabledModules.filter((k) => {
      if (k === 'focus') return false;
      if (userData.sleepDetailsEnabled && k === 'nightSweats') return false;
      return Boolean(sliderMeta[k]);
    });
  }, [userData.enabledModules]);

  const enabledCustom = useMemo(() => {
    return (userData.customSymptoms ?? []).filter((s) => s && s.enabled && typeof s.label === 'string' && s.label.trim());
  }, [userData.customSymptoms]);

  const priorityMaps = useMemo(() => {
    return buildPriorityMaps(entries, activeDateISO, enabledSliders, enabledCustom.map((item) => item.id));
  }, [entries, activeDateISO, enabledSliders, enabledCustom]);

  const orderedSliders = useMemo(() => sortBuiltInSymptoms(enabledSliders, priorityMaps), [enabledSliders, priorityMaps]);

  const orderedCustom = useMemo(() => sortCustomSymptoms(enabledCustom, priorityMaps), [enabledCustom, priorityMaps]);

  const availableBuiltInCandidates = useMemo<SymptomCandidate[]>(() => {
    const enabled = new Set(userData.enabledModules);
    return (Object.keys(sliderMeta) as SymptomKey[])
      .filter((key) => key !== 'focus' && !enabled.has(key))
      .map((key) => ({
        kind: 'builtIn',
        key,
        label: sliderMeta[key].label,
        hint: sliderMeta[key].hint,
        icon: sliderMeta[key].icon,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [userData.enabledModules]);

  const availableCustomCandidates = useMemo<SymptomCandidate[]>(() => {
    return (userData.customSymptoms ?? [])
      .filter((item) => item && !item.enabled && item.label.trim())
      .map((item) => ({
        kind: 'custom',
        key: item.id,
        label: item.label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [userData.customSymptoms]);

  const symptomCandidates = useMemo(() => {
    const query = symptomSearch.trim().toLowerCase();
    const all = [...availableBuiltInCandidates, ...availableCustomCandidates];
    if (!query) return all.slice(0, 12);
    return all
      .filter((item) => {
        const hay = `${item.label} ${item.hint ?? ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 12);
  }, [availableBuiltInCandidates, availableCustomCandidates, symptomSearch]);


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

  const saveEntryWithPhaseCheck = useCallback((entry: CheckInEntry) => {
    const entryISO = (entry as any).dateISO;
    const nextEntries = [
      ...entries.filter((e) => {
        const iso = (e as any).dateISO || (e as any).date;
        return iso !== entryISO;
      }),
      entry,
    ] as CheckInEntry[];

    upsertEntry(entry as any);

    try {
      const today = isoToday();
      if (activeDateISO === today) {
        localStorage.removeItem('eb_checkin_dismissed_date');
      }
    } catch {
      // ignore
    }

    const phaseChange = applyPhaseChangeForEntries({
      previousEntries: entries,
      nextEntries,
      userData,
    });

    safeBlur();

    if (phaseChange.changed && phaseChange.currentPhase) {
      setPhaseChangeNotice({ phase: phaseChange.currentPhase });
      return;
    }

    onDone();
  }, [entries, upsertEntry, activeDateISO, userData, onDone]);

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

    const nextEventsDetails: any = { ...((existingEntry as any)?.eventsDetails ?? {}) };
    if (eventsState.exercise) {
      if (exerciseIntensity) nextEventsDetails.exerciseIntensity = exerciseIntensity;
      else delete nextEventsDetails.exerciseIntensity;
    } else {
      delete nextEventsDetails.exerciseIntensity;
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
      sleepDetails: userData.sleepDetailsEnabled
        ? {
            timesWoke: sleepDetails.timesWoke,
            troubleFallingAsleep: sleepDetails.troubleFallingAsleep,
            wokeTooEarly: sleepDetails.wokeTooEarly,
          }
        : (existingEntry as any)?.sleepDetails,
      events: Object.keys(nextEvents).length ? nextEvents : undefined,
      eventsDetails: Object.keys(nextEventsDetails).length ? nextEventsDetails : undefined,
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
          saveEntryWithPhaseCheck({ ...(next as any), cycleStartOverride: true, breakthroughBleed: undefined } as any);
          return;
        }

        setPendingEntry(next);
        setPeriodPromptOpen(true);
        return;
      }
    }

    saveEntryWithPhaseCheck(next as any);
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
        <EBDialogContent
          title="New period confirmation"
          description="Confirm whether today should be marked as the start of a new cycle."
        >
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
                saveEntryWithPhaseCheck({ ...(pendingEntry as any), cycleStartOverride: undefined, breakthroughBleed: true } as any);
                setPeriodPromptOpen(false);
                setPendingEntry(null);
              }}
            >
              Just spotting
            </button>
            <button
              type="button"
              className="eb-btn-primary"
              onClick={() => {
                if (!pendingEntry) return;
                saveEntryWithPhaseCheck({ ...(pendingEntry as any), cycleStartOverride: true, breakthroughBleed: undefined } as any);
                setPeriodPromptOpen(false);
                setPendingEntry(null);
              }}
            >
              Start period
            </button>
          </DialogFooter>
        </EBDialogContent>
      </Dialog>

      <Dialog open={Boolean(phaseChangeNotice)} onOpenChange={(open) => { if (!open) setPhaseChangeNotice(null); }}>
        <EBDialogContent
          title="New phase detected"
          description="Your Rhythm page has been updated with your latest phase."
        >
          <DialogHeader>
            <DialogTitle>New phase detected</DialogTitle>
            <DialogDescription>
              You’ve moved into {phaseLabelFromKey(phaseChangeNotice?.phase)}. Your Rhythm page has been updated.
            </DialogDescription>
          </DialogHeader>

          <div className="eb-card mt-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.20)] flex items-center justify-center shrink-0 text-[rgb(var(--color-primary))]">
                <Leaf className="w-5 h-5" />
              </span>
              <p className="text-[rgb(var(--color-text-secondary))]">Open Rhythm to see what tends to show up for you here and what may support you next.</p>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="eb-btn-secondary"
              onClick={() => {
                setPhaseChangeNotice(null);
                onDone();
              }}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="eb-btn-primary"
              onClick={() => {
                setPhaseChangeNotice(null);
                onNavigate?.('rhythm');
              }}
            >
              View your rhythm
            </button>
          </DialogFooter>
        </EBDialogContent>
      </Dialog>

      <div className="eb-page-inner">
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
            {/*
              Mobile: prevent horizontal overflow on narrow screens.
              The mood buttons used to be a fixed-width row that could spill off the right edge.
              We allow wrapping and slightly smaller sizing on the smallest viewports.
            */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 rounded-2xl bg-white/90 p-2 sm:p-3 shadow-sm border border-black/5 max-w-full">
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
                      "group relative w-[78px] h-[88px] sm:w-[86px] sm:h-[92px] rounded-2xl border text-center",
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

        </div>

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

        {/* Sliders */}
        <div className="eb-card p-6 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="mb-1">Your check-in</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Only what you choose to track.</p>
            </div>
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-primary)/0.14)] bg-[rgb(var(--color-accent)/0.16)] px-3 py-2 text-sm font-medium text-[rgb(var(--color-primary-dark))]"
              onClick={() => setCustomiseOpen((prev) => !prev)}
              aria-expanded={customiseOpen}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Customise
            </button>
          </div>

          {customiseOpen && (
            <div className="mb-5 rounded-3xl border border-[rgb(var(--color-primary)/0.14)] bg-[rgb(var(--color-accent)/0.10)] p-4 shadow-[0_8px_20px_rgb(var(--color-primary-dark)/0.05)]">
              <div className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--color-primary)/0.14)] bg-[rgb(var(--color-surface))] px-3 py-2.5">
                <Search className="w-4 h-4 text-[rgb(var(--color-text-secondary))]" />
                <input
                  type="text"
                  value={symptomSearch}
                  onChange={(e) => setSymptomSearch(e.target.value)}
                  placeholder="Search symptoms"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[rgb(var(--color-text-secondary))]"
                />
              </div>

              <div className="mt-3 space-y-2">
                {symptomCandidates.length > 0 ? (
                  symptomCandidates.map((item) => {
                    const Icon = item.icon ?? Plus;
                    return (
                      <button
                        key={`${item.kind}:${item.key}`}
                        type="button"
                        className="w-full rounded-2xl border border-[rgb(var(--color-primary)/0.16)] bg-[rgb(var(--color-surface))] px-3 py-3 text-left shadow-[0_10px_24px_rgb(var(--color-primary-dark)/0.05)] transition hover:border-[rgb(var(--color-primary)/0.22)]"
                        onClick={() => {
                          if (item.kind === 'builtIn') {
                            const symptomKey = item.key as SymptomKey;
                            onUpdateUserData((prev) => {
                              if (prev.enabledModules.includes(symptomKey)) return prev;
                              return { ...prev, enabledModules: [...prev.enabledModules, symptomKey] };
                            });
                            setValues((prev) => ({
                              ...prev,
                              [symptomKey]: typeof prev[symptomKey] === 'number'
                                ? prev[symptomKey]
                                : typeof (prevEntry as any)?.values?.[symptomKey] === 'number'
                                  ? normalise10((prevEntry as any).values[symptomKey])
                                  : symptomDefaultValue(symptomKey),
                            }));
                          } else {
                            onUpdateUserData((prev) => ({
                              ...prev,
                              customSymptoms: (prev.customSymptoms ?? []).map((s) =>
                                s.id === item.key ? { ...s, enabled: true } : s
                              ),
                            }));
                            setCustomValues((prev) => ({
                              ...prev,
                              [item.key]: typeof prev[item.key] === 'number'
                                ? prev[item.key]
                                : typeof (prevEntry as any)?.customValues?.[item.key] === 'number'
                                  ? normalise10((prevEntry as any).customValues[item.key])
                                  : 5,
                            }));
                          }
                          setSymptomSearch('');
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-primary))]">
                              <Icon className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[rgb(var(--color-text))]">{item.label}</div>
                              {item.hint ? <div className="truncate text-xs text-[rgb(var(--color-text-secondary))]">{item.hint}</div> : null}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-primary)/0.08)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--color-primary-dark))]">
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-[rgb(var(--color-primary)/0.16)] bg-[rgb(var(--color-surface))] px-3 py-4 text-sm text-[rgb(var(--color-text-secondary))]">
                    No matching symptoms yet.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {orderedSliders.map((key) => {
              if (userData.sleepDetailsEnabled && key === 'nightSweats') return null;
              const meta = sliderMeta[key];
              const Icon = meta.icon;
              const current = normalise10((values as any)?.[key]);
              const prevRaw = (prevEntry as any)?.values?.[key];
              const prevVal = typeof prevRaw === 'number' ? normalise10(prevRaw) : null;

              return (
                <div key={key} className="eb-card rounded-[1.5rem] p-4 border-[rgb(var(--color-primary)/0.18)] bg-[rgb(var(--color-surface))] shadow-[0_8px_20px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-[rgb(var(--color-primary)/0.12)] border border-[rgb(var(--color-primary)/0.12)] flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{meta.label}</div>
                        {meta.hint ? (
                          <div className="text-sm text-[rgb(var(--color-text-secondary))] mt-0.5">{meta.hint}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-[rgb(var(--color-primary-dark))]">{current}/10</div>
                  </div>

                  <div className="text-xs text-[rgb(var(--color-text-secondary))] mb-2">{formatYesterdayValue(prevVal)}</div>

                  <Slider10
                    value={current}
                    onPreviewChange={(n) => setValues((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }))}
                    onCommit={(n) => setValues((prev) => ({ ...prev, [key]: n }))}
                    leftLabel={meta.leftLabel}
                    rightLabel={meta.rightLabel}
                  />

                  {key === 'sleep' && userData.sleepDetailsEnabled ? (
                    <details className="mt-3 rounded-2xl border border-[rgb(var(--color-primary)/0.14)] bg-[rgb(var(--color-primary-light)/0.14)] overflow-hidden group">
                      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium">Sleep details</span>
                        <ChevronRight className="w-4 h-4 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="px-3 pb-4 pt-3 space-y-6">
                        <div>
                          <div className="text-sm font-medium mb-2">Night time awakenings</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[0, 1, 2, 3].map((n) => {
                              const label = n === 0 ? 'None' : n === 1 ? 'Once' : n === 2 ? 'Twice' : '3+ times';
                              const active = sleepDetails.timesWoke === n;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setSleepDetails((p) => ({ ...p, timesWoke: n as any }))}
                                  className="eb-pill"
                                  style={
                                    active
                                      ? { background: 'rgba(var(--color-primary), 0.15)', color: 'rgb(var(--color-primary))' }
                                      : { background: 'rgba(0,0,0,0.05)', color: 'rgb(var(--color-text-secondary))' }
                                  }
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium mb-2">Trouble falling asleep</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              { v: 0, label: 'None' },
                              { v: 1, label: 'A little' },
                              { v: 2, label: 'A lot' },
                            ].map((opt) => {
                              const active = sleepDetails.troubleFallingAsleep === opt.v;
                              return (
                                <button
                                  key={opt.v}
                                  type="button"
                                  onClick={() => setSleepDetails((p) => ({ ...p, troubleFallingAsleep: opt.v as any }))}
                                  className="eb-pill"
                                  style={
                                    active
                                      ? { background: 'rgba(var(--color-primary), 0.15)', color: 'rgb(var(--color-primary))' }
                                      : { background: 'rgba(0,0,0,0.05)', color: 'rgb(var(--color-text-secondary))' }
                                  }
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <SwitchRow
                          checked={sleepDetails.wokeTooEarly}
                          onChange={(next) => setSleepDetails((p) => ({ ...p, wokeTooEarly: next }))}
                          label="Awake earlier than planned"
                        />

                        <div>
                          <div className="text-sm font-medium mb-2">Night sweats</div>
                          {userData.enabledModules.includes('nightSweats') ? (
                            <div className="mt-2">
                              {(() => {
                                // IMPORTANT: default to 0 (not 5) to avoid accidental logging when this section is hidden.
                                const raw = (values as any)?.nightSweats;
                                const nsVal = typeof raw === 'number' ? normalise10(raw) : 0;
                                return (
                                  <>
                                    <div className="text-xs text-[rgb(var(--color-text-secondary))]">{nsVal}/10</div>
                                    <div className="mt-2">
                                      <Slider10
                                        value={nsVal}
                                        onPreviewChange={(n) => setValues((prev) => (prev.nightSweats === n ? prev : { ...prev, nightSweats: n }))}
                                        onCommit={(n) => setValues((prev) => ({ ...prev, nightSweats: n }))}
                                        leftLabel={sliderMeta.nightSweats.leftLabel}
                                        rightLabel={sliderMeta.nightSweats.rightLabel}
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                              <div className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">
                                Tracked under Hormones. Shown here to make logging easier.
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">
                              Enable Night sweats in Hormones to track this.
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

          {orderedCustom.length > 0 && (
            <div className="mt-6 mb-6">
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
                    <div key={s.id} className="eb-card rounded-[1.5rem] p-4 border-[rgb(var(--color-primary)/0.18)] bg-[rgb(var(--color-surface))] shadow-[0_8px_20px_rgba(0,0,0,0.04)]">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight">{s.label}</div>
                          <div className="text-sm text-[rgb(var(--color-text-secondary))] mt-0.5">Your custom symptom</div>
                        </div>
                        <div className="text-sm font-semibold text-[rgb(var(--color-primary-dark))]">{current}/10</div>
                      </div>

                      <div className="text-xs text-[rgb(var(--color-text-secondary))] mb-2">{formatYesterdayValue(prevVal)}</div>

                      <Slider10
                        value={current}
                        onPreviewChange={(n) => setCustomValues((prev) => (prev[s.id] === n ? prev : { ...prev, [s.id]: n }))}
                        onCommit={(n) => setCustomValues((prev) => ({ ...prev, [s.id]: n }))}
                        leftLabel={directionLabelsForCustom(s.label).leftLabel}
                        rightLabel={directionLabelsForCustom(s.label).rightLabel}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}



        {/* Other influences */}
        <div className="eb-card p-5 mb-6">
          <button
            type="button"
            onClick={() => setInfluencesOpen((v) => !v)}
            onTouchStart={(e) => {
              e.preventDefault();
              setInfluencesOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between gap-3 py-1 cursor-pointer"
          >
            <div className="text-sm font-semibold text-[rgb(var(--color-text))]">Other influences</div>
            <ChevronRight
              className={`w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform ${influencesOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {influencesOpen && (
            <div className="grid grid-cols-1 gap-3 mt-4">
              {visibleInfluences.map((item) => (
                <div key={item.key}>
                  <SwitchRow
                    checked={Boolean(eventsState[item.key])}
                    onChange={(checked) => {
                      setEventsState((prev) => ({
                        ...prev,
                        [item.key]: checked,
                      }));
                      if (item.key === 'exercise' && !checked) setExerciseIntensity(null);
                    }}
                    label={item.label}
                    hint={item.hint}
                  />

                  {item.key === 'exercise' && Boolean(eventsState.exercise) ? (
                    <div className="mt-2 ml-1 rounded-2xl border border-neutral-200 bg-white p-3">
                      <div className="text-sm font-medium mb-2">How did it feel?</div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { k: 'light', label: 'Light' },
                            { k: 'moderate', label: 'Moderate' },
                            { k: 'hard', label: 'Hard' },
                          ] as const
                        ).map((opt) => {
                          const active = exerciseIntensity === opt.k;
                          return (
                            <button
                              key={opt.k}
                              type="button"
                              onClick={() => setExerciseIntensity(opt.k)}
                              className={
                                active
                                  ? 'eb-btn eb-btn-primary !py-2 !px-3 text-sm'
                                  : 'eb-btn eb-btn-secondary !py-2 !px-3 text-sm'
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs text-[rgb(var(--color-text-secondary))]">
                        Keep it simple. This helps Sleep Insights spot gentle patterns.
                      </div>
                    </div>
                  ) : null}
                </div>
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


        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="eb-btn-secondary min-w-[96px]"
            onClick={() => {
              try {
                onDismiss?.(activeDateISO);
              } catch {
                // ignore
              }
              onDone();
            }}
          >
            Cancel
          </button>
          <button type="button" className="eb-btn-primary min-w-[96px]" onClick={handleSubmit}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}