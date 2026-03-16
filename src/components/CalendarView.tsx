
import React, { useEffect, useMemo, useState } from 'react';
import { PencilLine, Droplet, Droplets, Egg, X, ChevronRight, Smile, Meh, Frown, Heart, FlaskConical, Sparkles, Flag, CalendarDays } from 'lucide-react';
import { cn } from './ui/utils';
import type { UserData, SymptomKey, CheckInEntry } from '../types';
import { useEntries, useExperiment } from '../lib/appStore';
import { computeBleedStats, computeCycleStats, estimatePhaseByFlow, getCycleStarts, getRhythmModel, sortByDateAsc } from '../lib/analytics';
import { getRhythmTimingModel } from '../lib/rhythmTiming';
import { getCycleTrustModel } from '../lib/cycleTrust';

type Props = {
  userData: UserData;
  onNavigate: (screen: string) => void;
  onOpenCheckIn: (dateISO: string) => void;
  onUpdateUser: (updater: UserData | ((prev: UserData) => UserData)) => void;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function daysBetweenISO(aISO: string, bISO: string): number {
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}


function toBand3(raw: number | null, key: SymptomKey | 'mood'): 0 | 1 | 2 | null {
  if (raw == null) return null;
  if (key === 'mood') {
    // mood stored as 1..3
    if (raw <= 1) return 0;
    if (raw === 2) return 1;
    return 2;
  }
  // symptoms normalised to 0..10
  if (raw <= 3) return 0;
  if (raw <= 6) return 1;
  return 2;
}

function bandColorCSS(band: 0 | 1 | 2): string {
  // Derived from theme, but optimised for calendar readability.
  // Low = primary-light, Mid = primary, High = primary-dark.
  if (band === 0) return 'rgb(var(--color-primary-light) / 0.40)';
  if (band === 1) return 'rgb(var(--color-primary) / 0.52)';
  return 'rgb(var(--color-primary-dark) / 0.68)';
}


function influenceLabel(key: string): string | null {
  switch (key) {
    case 'sex':
      return 'Intimacy';
    case 'exercise':
      return 'Workout';
    case 'travel':
      return 'Travel';
    case 'illness':
      return 'Illness';
    case 'alcohol':
      return 'Alcohol';
    case 'lateNight':
      return 'Late night';
    case 'stressfulDay':
      return 'Stressful day';
    case 'medication':
      return 'Medication';
    case 'caffeine':
      return 'Caffeine';
    case 'socialising':
      return 'Socialising';
    case 'lowHydration':
      return 'Low hydration';
    default:
      return null;
  }
}

function influencesFromEntry(entry: any): string[] {
  const ev = (entry?.events ?? {}) as Record<string, any>;
  const labels: string[] = [];
  for (const [k, v] of Object.entries(ev)) {
    if (!v) continue;
    const lab = influenceLabel(k);
    if (lab) labels.push(lab);
  }
  return labels;
}


function prettyDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function moodLabel(m?: number): string | null {
  if (m === 1) return 'Low';
  if (m === 2) return 'Okay';
  if (m === 3) return 'Good';
  return null;
}

function isExperimentActiveOnISO(experiment: any, dateISO: string): boolean {
  const startISO = typeof experiment?.startDateISO === 'string' ? experiment.startDateISO : null;
  const durationDays = typeof experiment?.durationDays === 'number' ? experiment.durationDays : 0;
  const completed = Boolean(experiment?.outcome?.completedAtISO);
  if (!startISO || durationDays <= 0 || completed) return false;
  const start = new Date(startISO + 'T00:00:00').getTime();
  const target = new Date(dateISO + 'T00:00:00').getTime();
  const end = new Date(startISO + 'T00:00:00');
  end.setDate(end.getDate() + Math.max(0, durationDays - 1));
  return target >= start && target <= end.getTime();
}


function CycleFlagIcon({
  filled = false,
  size = 11,
  className = '',
}: {
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const strokeWidth = 1.75;
  const stroke = 'currentColor';
  const fill = filled ? 'currentColor' : 'none';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 20V4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path
        d="M7.5 5.5H16.5L14 9.25L16.5 13H7.5V5.5Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={fill}
      />
    </svg>
  );
}

function shortPhaseCue(phaseKey: string | null | undefined): string {
  switch (phaseKey) {
    case 'reset':
      return 'A softer, more restorative patch.';
    case 'rebuilding':
      return 'Energy often starts to build here.';
    case 'expressive':
      return 'This is often the more outward phase.';
    case 'protective':
      return 'Sensitivity can sit a little closer to the surface.';
    default:
      return 'Still learning your rhythm.';
  }
}


type CalendarMarker = {
  key: 'cycleStart' | 'predictedCycleStart' | 'period' | 'spotting' | 'ovulation' | 'experiment' | 'sex';
  priority: number;
  label: string;
  icon: React.ReactNode;
};

function getCalendarMarkers(args: {
  isPeriod: boolean;
  isCycleStart: boolean;
  isPredictedCycleStart: boolean;
  hasSpotting: boolean;
  isPredictedOvulation: boolean;
  hasExperiment: boolean;
  hasSex: boolean;
}): CalendarMarker[] {
  const iconProps = { size: 11, strokeWidth: 1.75, className: 'opacity-80' } as const;
  const predictedFlagProps = { size: 11, strokeWidth: 1.75, className: 'opacity-80' } as const;
  const markers: CalendarMarker[] = [];

  if (args.isCycleStart) {
    markers.push({
      key: 'cycleStart',
      priority: 0,
      label: 'Cycle start',
      icon: <CycleFlagIcon size={12} className="opacity-80" filled />,
    });
  } else if (args.isPredictedCycleStart) {
    markers.push({
      key: 'predictedCycleStart',
      priority: 1,
      label: 'Predicted cycle start',
      icon: <Flag {...predictedFlagProps} aria-hidden="true" />,
    });
  }
  if (args.isPeriod) {
    markers.push({
      key: 'period',
      priority: 1,
      label: 'Period day',
      icon: <Droplet {...iconProps} aria-hidden="true" />,
    });
  }
  if (args.hasSpotting) {
    markers.push({
      key: 'spotting',
      priority: 2,
      label: 'Spotting / breakthrough bleed',
      icon: <Droplets {...iconProps} aria-hidden="true" />,
    });
  }
  if (args.isPredictedOvulation) {
    markers.push({
      key: 'ovulation',
      priority: 3,
      label: 'Predicted ovulation',
      icon: <Sparkles {...iconProps} aria-hidden="true" />,
    });
  }
  if (args.hasExperiment) {
    markers.push({
      key: 'experiment',
      priority: 4,
      label: 'Experiment active',
      icon: <FlaskConical {...iconProps} aria-hidden="true" />,
    });
  }
  if (args.hasSex) {
    markers.push({
      key: 'sex',
      priority: 5,
      label: 'Sex logged',
      icon: <Heart {...iconProps} aria-hidden="true" />,
    });
  }

  return markers
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

function MoodIcon({ mood, className, size = 20 }: { mood?: number; className?: string; size?: number }) {
  if (mood === 1) return <Frown className={className} width={size} height={size} aria-hidden="true" />;
  if (mood === 2) return <Meh className={className} width={size} height={size} aria-hidden="true" />;
  if (mood === 3) return <Smile className={className} width={size} height={size} aria-hidden="true" />;
  return null;
}



function getOverlayValue(entry: CheckInEntry | null | undefined, key: SymptomKey | 'mood'): number | null {
  if (!entry) return null;
  if (key === 'mood') {
    const m = entry.mood;
    if (typeof m !== 'number') return null;
    return clamp(m, 1, 3);
  }
  const v = entry?.values?.[key];
  if (typeof v !== 'number') return null;

  // We have had a couple of different storage scales over time:
  // - older builds stored symptoms as 0–100
  // - newer UI sometimes treats them as 0–10
  // For the calendar overlay we normalise to 0–10.
  const scaled = v > 10 ? Math.round(v / 10) : v;
  return clamp(scaled, 0, 10);
}

function overlayLabel(key: SymptomKey | 'mood'): string {
  if (key === 'mood') return 'Overall mood';
  // Prefer explicit labels where phrasing matters, otherwise fall back to a
  // safe humaniser (camelCase -> spaced Title case).
  const map: Partial<Record<SymptomKey, string>> = {
    flow: 'Bleeding/spotting',
    brainFog: 'Brain fog',
    nightSweats: 'Night sweats',
    hairShedding: 'Hair shedding',
    facialSpots: 'Facial spots',
    backPain: 'Back pain',
    jointPain: 'Joint pain',
    breastTenderness: 'Breast tenderness',
    acidReflux: 'Acid reflux',
    hotFlushes: 'Hot flushes',
    restlessLegs: 'Restless legs',
    focus: 'Focus',
  };
  if (map[key]) return map[key]!;

  const raw = String(key);
  // Insert spaces before capitals (camelCase), then Title-case words.
  const withSpaces = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  return withSpaces
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function CalendarView({ userData, onNavigate, onOpenCheckIn, onUpdateUser }: Props) {
  const { entries, upsertEntry } = useEntries();
  const { experiment } = useExperiment();
  const entriesSorted = useMemo(() => sortByDateAsc(entries), [entries]);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted), [entriesSorted]);
  const bleedStats = useMemo(() => computeBleedStats(entriesSorted), [entriesSorted]);
  const avgLen = cycleStats?.avgLength ?? null;

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  type OverlayKey = SymptomKey | 'mood';

const CALENDAR_OVERLAY_STORAGE_KEY = 'eb:calendar:overlayKey';

  const availableOverlayKeys = useMemo<OverlayKey[]>(() => {
    const preferred: OverlayKey[] = ['mood', 'sleep', 'energy', 'stress', 'pain', 'bloating', 'focus', 'fatigue', 'brainFog', 'nightSweats', 'hairShedding', 'facialSpots', 'cysts', 'flow'];
    const enabled = Array.isArray(userData.enabledModules) ? (userData.enabledModules as OverlayKey[]) : [];
    const set = new Set<OverlayKey>(['mood', ...enabled]);
    const ordered = preferred.filter((key) => set.has(key));
    for (const key of enabled) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    return ordered;
  }, [userData.enabledModules]);

function isAllowedOverlayKey(v: any, allowed: OverlayKey[]): v is OverlayKey {
  return typeof v === 'string' && (allowed as string[]).includes(v);
}
  const [overlayKey, setOverlayKey] = useState<OverlayKey>('mood');



  // Remember the user's last overlay choice for this device/container (Safari vs Home Screen).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALENDAR_OVERLAY_STORAGE_KEY);
      if (isAllowedOverlayKey(raw, availableOverlayKeys)) setOverlayKey(raw);
      else if (availableOverlayKeys.length) setOverlayKey(availableOverlayKeys[0]);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOverlayKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_OVERLAY_STORAGE_KEY, overlayKey);
    } catch {
      // ignore
    }
  }, [overlayKey]);
  useEffect(() => {
    if (!availableOverlayKeys.includes(overlayKey)) {
      setOverlayKey(availableOverlayKeys[0] ?? 'mood');
    }
  }, [availableOverlayKeys, overlayKey]);
  const [editMode, setEditMode] = useState(false);
  const [editISO, setEditISO] = useState<string | null>(null);
  const [summaryISO, setSummaryISO] = useState<string | null>(null);
  const [sleepPeekOpen, setSleepPeekOpen] = useState<boolean>(false);

  useEffect(() => {
    // Reset the sleep details peek when switching days or closing.
    setSleepPeekOpen(false);
  }, [summaryISO]);


  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);

  // Pad calendar to start on Monday
  const dayOfWeek = (monthStart.getDay() + 6) % 7; // 0=Mon
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - dayOfWeek);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    days.push(d);
  }

  const byISO = useMemo(() => {
    const m = new Map<string, any>();
    entriesSorted.forEach((e) => m.set(e.dateISO, e));
    return m;
  }, [entriesSorted]);

  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayISO = toISO(new Date());

  const cycleEnabled = userData.cycleTrackingMode === 'cycle';
  const fertilityEnabled = Boolean(userData.fertilityMode) && cycleEnabled;

  const ovulationSet = useMemo(() => {
    const legacy = Array.isArray(userData.ovulationOverrideISOs)
      ? (userData.ovulationOverrideISOs as string[])
      : [];
    const entryOverrides = entriesSorted
      .filter((entry: any) => Boolean((entry as any)?.ovulationOverride))
      .map((entry) => entry.dateISO);
    return new Set([...legacy, ...entryOverrides]);
  }, [userData.ovulationOverrideISOs, entriesSorted]);

  const cycleStarts = cycleEnabled ? (cycleStats?.cycleStarts ?? []) : [];
  const hasCycleAnchor = cycleEnabled && cycleStarts.length > 0;

  const cycleTrust = useMemo(() => getCycleTrustModel(entriesSorted as any, userData, todayISO), [entriesSorted, userData, todayISO]);

  const learnedCycleLength = useMemo(
    () => Math.max(21, Math.round(avgLen ?? cycleStats?.lastLength ?? 28)),
    [avgLen, cycleStats?.lastLength],
  );

  const learnedBleedLength = useMemo(
    () => clamp(bleedStats.avgLength ?? bleedStats.lastLength ?? 7, 2, 8),
    [bleedStats.avgLength, bleedStats.lastLength],
  );

  const ovulationOffsetDays = useMemo(() => {
    const minOvulationDay = Math.max(10, learnedBleedLength + 5);
    const latestAllowed = Math.max(minOvulationDay + 1, learnedCycleLength - 10);
    return clamp(learnedCycleLength - 14, minOvulationDay, latestAllowed);
  }, [learnedBleedLength, learnedCycleLength]);

  const predictedNextCycleStartISO = useMemo(() => {
    if (!cycleTrust.showFutureCycleStart || !cycleEnabled || !hasCycleAnchor || cycleStarts.length === 0) return null;

    const latestStartISO = cycleStarts[cycleStarts.length - 1];
    if (!latestStartISO) return null;

    let candidateISO = addDaysISO(latestStartISO, learnedCycleLength);
    while (candidateISO <= todayISO) {
      candidateISO = addDaysISO(candidateISO, learnedCycleLength);
    }

    if (cycleStarts.includes(candidateISO)) return null;
    return candidateISO;
  }, [cycleTrust.showFutureCycleStart, cycleEnabled, hasCycleAnchor, cycleStarts, learnedCycleLength, todayISO]);

  const currentCyclePredictedOvulationISO = useMemo(() => {
    if (!fertilityEnabled || !cycleTrust.showCurrentCyclePrediction || !hasCycleAnchor || cycleStarts.length === 0) return null;
    const latestStartISO = cycleStarts[cycleStarts.length - 1];
    if (!latestStartISO) return null;

    const explicitInCurrentCycle = Array.from(ovulationSet)
      .filter((iso) => iso >= latestStartISO && (!predictedNextCycleStartISO || iso < predictedNextCycleStartISO))
      .sort()[0] ?? null;
    if (explicitInCurrentCycle) return explicitInCurrentCycle;

    return addDaysISO(latestStartISO, ovulationOffsetDays);
  }, [fertilityEnabled, cycleTrust.showCurrentCyclePrediction, hasCycleAnchor, cycleStarts, ovulationSet, predictedNextCycleStartISO, ovulationOffsetDays]);

  const nextCyclePredictedOvulationISO = useMemo(() => {
    if (!fertilityEnabled || !cycleTrust.showFutureOvulation || !hasCycleAnchor || !predictedNextCycleStartISO) return null;
    return addDaysISO(predictedNextCycleStartISO, ovulationOffsetDays);
  }, [fertilityEnabled, cycleTrust.showFutureOvulation, hasCycleAnchor, predictedNextCycleStartISO, ovulationOffsetDays]);

  const predictedOvulationSet = useMemo(() => {
    const s = new Set<string>();
    if (!fertilityEnabled || !hasCycleAnchor) return s;

    for (const iso of Array.from(ovulationSet)) s.add(iso);
    if (currentCyclePredictedOvulationISO) s.add(currentCyclePredictedOvulationISO);
    if (nextCyclePredictedOvulationISO) s.add(nextCyclePredictedOvulationISO);
    return s;
  }, [fertilityEnabled, hasCycleAnchor, ovulationSet, currentCyclePredictedOvulationISO, nextCyclePredictedOvulationISO]);

  const rhythmModel = useMemo(() => getRhythmModel(entriesSorted, userData, todayISO), [entriesSorted, userData, todayISO]);
  const rhythmTiming = useMemo(() => getRhythmTimingModel(entriesSorted as any, userData), [entriesSorted, userData]);
  const rhythmContextLabel = useMemo(() => {
    const map: Record<string, string> = {
      reset: 'Reset Phase',
      rebuilding: 'Rebuilding Phase',
      expressive: 'Expressive Phase',
      protective: 'Protective Phase',
    };
    return map[String(rhythmModel.phaseKey || '')] ?? 'Rhythm';
  }, [rhythmModel.phaseKey]);

  // Build period + fertile windows
  const periodSet = useMemo(() => {
    const s = new Set<string>();
    if (!cycleEnabled || !hasCycleAnchor) return s;

    const byISO = new Map<string, any>();
    for (const e of entriesSorted) byISO.set(e.dateISO, e);


    for (const startISO of cycleStarts) {
      let seenPositive = false;
      let explicitStopDay: string | null = null;
      let lastPositiveOffset = -1;

      for (let i = 0; i < Math.max(learnedBleedLength, 8); i++) {
        const dayISO = addDaysISO(startISO, i);
        const e = byISO.get(dayISO);
        if (!e) continue;

        const breakthrough = Boolean(e?.breakthroughBleed);
        const flowVal = e?.values?.flow;
        const flow = typeof flowVal === 'number' ? flowVal : 0;
        const effectiveFlow = breakthrough ? 0 : flow;

        if (effectiveFlow > 0) {
          seenPositive = true;
          lastPositiveOffset = i;
          continue;
        }

        if (seenPositive && effectiveFlow === 0) {
          explicitStopDay = dayISO;
          break;
        }
      }

      const provisionalLength = explicitStopDay
        ? Math.max(1, daysBetweenISO(startISO, explicitStopDay))
        : Math.max(1, lastPositiveOffset >= 0 ? lastPositiveOffset + 1 : learnedBleedLength);

      for (let i = 0; i < provisionalLength; i++) {
        const dayISO = addDaysISO(startISO, i);
        const e = byISO.get(dayISO);
        const breakthrough = Boolean(e?.breakthroughBleed);
        const flowVal = e?.values?.flow;
        const flow = typeof flowVal === 'number' ? flowVal : null;

        if (e) {
          if (breakthrough) continue;
          if (typeof flow === 'number' && flow <= 0) continue;
        }

        s.add(dayISO);
      }
    }

    return s;
  }, [cycleEnabled, hasCycleAnchor, entriesSorted, cycleStarts, learnedBleedLength]);

  const fertileSet = useMemo(() => {
    const s = new Set<string>();
    if (!fertilityEnabled || !hasCycleAnchor || !currentCyclePredictedOvulationISO) return s;

    for (let d = -5; d <= 1; d++) {
      const dayISO = addDaysISO(currentCyclePredictedOvulationISO, d);
      if (periodSet.has(dayISO)) continue;
      s.add(dayISO);
    }
    return s;
  }, [fertilityEnabled, hasCycleAnchor, periodSet, currentCyclePredictedOvulationISO]);

  const summaryModal = useMemo(() => {
    if (!summaryISO) return null;
    const e = byISO.get(summaryISO);
    const hasEntry = Boolean(e);
    const influences = influencesFromEntry(e);
    const note = typeof (e as any)?.notes === 'string' ? String((e as any).notes).trim() : '';
    const moodNum = (e as any)?.mood as number | undefined;
    const mood = moodLabel(moodNum);
    const sexLogged = Boolean((e as any)?.events?.sex);
    const experimentActive = isExperimentActiveOnISO(experiment, summaryISO);

    const sd = (e as any)?.sleepDetails as any;
    const hasSleepDetails = !!(
      sd &&
      ((typeof sd.timesWoke === 'number' && sd.timesWoke > 0) ||
        (typeof sd.troubleFallingAsleep === 'number' && sd.troubleFallingAsleep > 0) ||
        Boolean(sd.wokeTooEarly))
    );

    const troubleLabel = (v: any): string => {
      if (v === 0) return 'No';
      if (v === 1) return 'A bit';
      if (v === 2) return 'Yes';
      return '—';
    };

    const enabled = Array.isArray(userData.enabledModules) ? (userData.enabledModules as SymptomKey[]) : [];
    const rows: Array<{ label: string; value: string }> = [];
    for (const k of enabled) {
      const vRaw = (e as any)?.values?.[k];
      if (typeof vRaw !== 'number') continue;
      const v = vRaw > 10 ? Math.round(vRaw / 10) : vRaw;
      rows.push({ label: overlayLabel(k), value: `${clamp(v, 0, 10)}/10` });
    }
    const topRows = rows.slice(0, 5);

    const isPeriod = periodSet.has(summaryISO);
    const isFertile = fertileSet.has(summaryISO);
    const isOv = fertilityEnabled && predictedOvulationSet.has(summaryISO);
    const isCycleStart = cycleStarts.includes(summaryISO);
    const isSpotting = Boolean((e as any)?.breakthroughBleed) || (() => { const fv = (e as any)?.values?.flow; return typeof fv === 'number' && fv > 0 && !isPeriod; })();

    const summaryPhase = (() => {
      if (isPeriod) return 'Reset Phase';
      const cycleStart = [...cycleStarts].reverse().find((startISO) => startISO <= summaryISO) ?? null;
      if (cycleStart) {
        const dayInCycle = daysBetweenISO(cycleStart, summaryISO) + 1;
        const cycleLen = avgLen ?? cycleStats?.lastLength ?? 28;
        const ovulationDay = Math.max(10, Math.min(cycleLen - 10, cycleLen - 14));
        if (dayInCycle <= 5) return 'Reset Phase';
        if (isOv || Math.abs(dayInCycle - ovulationDay) <= 1) return 'Expressive Phase';
        if (dayInCycle < ovulationDay) return 'Rebuilding Phase';
        return 'Protective Phase';
      }
      return estimatePhaseByFlow(summaryISO, entriesSorted) ?? null;
    })();

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/30"
          aria-label="Close"
          onClick={() => setSummaryISO(null)}
        />
        <div className="relative w-full max-w-md eb-card p-5 max-h-[85vh] overflow-y-auto">
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xl font-semibold">
              {moodNum ? (
                <span aria-label={mood ? `Mood: ${mood}` : 'Mood'} title={mood ? `Mood: ${mood}` : 'Mood'}>
                  <MoodIcon mood={moodNum} className="text-[rgb(var(--color-accent))] opacity-80" size={20} />
                </span>
              ) : null}
              <span>Day summary</span>
            </div>
            <div className="text-sm text-[rgb(var(--color-text-secondary))]">
              {prettyDate(new Date(`${summaryISO}T00:00:00`))}
            </div>
            {summaryPhase ? (
              <div className="mt-1 text-sm text-[rgba(0,0,0,0.68)]">{summaryPhase}</div>
            ) : null}
            {mood ? (
              <div className="mt-1 text-sm text-[rgba(0,0,0,0.68)]">Mood: {mood}</div>
            ) : null}
          </div>

          {!hasEntry ? (
            <div className="mb-4 eb-inset rounded-2xl p-4">
              <div className="font-medium">No check-in recorded.</div>
              <div className="mt-1 text-sm text-[rgba(0,0,0,0.68)]">Tap below to log how you felt on this day.</div>
            </div>
          ) : null}

          {(() => {
            const pills: Array<{ key: string; text: string }> = [];
            if (isCycleStart) pills.push({ key: 'cycleStart', text: 'Cycle start' });
            if (isPeriod) pills.push({ key: 'period', text: 'Period day' });
            if (isSpotting) pills.push({ key: 'spotting', text: 'Spotting / breakthrough bleed' });
            if (isFertile) pills.push({ key: 'fertile', text: isOv ? 'Ovulation day' : 'Fertile window' });
            if (sexLogged) pills.push({ key: 'sex', text: 'Sex logged' });
            if (experimentActive) pills.push({ key: 'experiment', text: 'Experiment active' });
            for (const inf of influences) pills.push({ key: `inf:${inf}`, text: inf });

            return pills.length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {pills.map((p) => (
                  <span key={p.key} className="eb-pill">
                    {p.text}
                  </span>
                ))}
              </div>
            ) : null;
          })()}

          {topRows.length ? (
            <div className="mb-4 space-y-2">
              {topRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[rgb(var(--color-text-secondary))]">{r.label}</span>
                  <span className="font-medium">{r.value}</span>
                </div>
              ))}
            </div>
          ) : hasEntry ? (
            <div className="mb-4 text-sm text-[rgb(var(--color-text-secondary))]">No symptom sliders were logged for this day.</div>
          ) : null}

          <button
            type="button"
            disabled={!hasSleepDetails}
            onClick={() => {
              if (!hasSleepDetails) return;
              setSleepPeekOpen((v) => !v);
            }}
            className={
              'mb-4 w-full flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm ' +
              (hasSleepDetails ? 'cursor-pointer' : 'opacity-60 cursor-default')
            }
          >
            <div className="text-[rgb(var(--color-text-secondary))]">Sleep details</div>
            <div className="flex items-center gap-2">
              <span className={hasSleepDetails ? 'font-medium' : 'text-[rgb(var(--color-text-secondary))]'}>
                {hasSleepDetails ? 'Logged' : 'Not today'}
              </span>
              <ChevronRight
                className={`w-4 h-4 text-[rgb(var(--color-text-secondary))] transition-transform ${
                  sleepPeekOpen ? 'rotate-90' : ''
                }`}
              />
            </div>
          </button>

          {sleepPeekOpen ? (
            <div className="mb-4 eb-inset rounded-2xl p-4">
              {hasSleepDetails ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[rgb(var(--color-text-secondary))]">Night-time awakenings</span>
                    <span className="font-medium">
                      {typeof sd?.timesWoke === 'number' ? (sd.timesWoke === 3 ? '3+' : String(sd.timesWoke)) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[rgb(var(--color-text-secondary))]">Trouble falling asleep</span>
                    <span className="font-medium">{troubleLabel(sd?.troubleFallingAsleep)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[rgb(var(--color-text-secondary))]">Awake earlier than planned</span>
                    <span className="font-medium">{sd?.wokeTooEarly ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">Nothing extra logged for this day.</div>
              )}
            </div>
          ) : null}

          {note ? (
            <div className="mb-4 text-sm whitespace-pre-wrap">
              <div className="font-semibold mb-1">Note</div>
              <div className="text-[rgb(var(--color-text-secondary))]">{note}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className="w-full eb-btn-primary"
              onClick={() => {
                const iso = summaryISO;
                setSummaryISO(null);
                onOpenCheckIn(iso);
              }}
            >
              {hasEntry ? 'Edit check-in' : 'Log check-in'}
            </button>
            <button type="button" className="w-full eb-btn-secondary" onClick={() => setSummaryISO(null)}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }, [
    summaryISO,
    byISO,
    userData.enabledModules,
    sleepPeekOpen,
    periodSet,
    fertileSet,
    predictedOvulationSet,
    fertilityEnabled,
    onOpenCheckIn,
    cycleStarts,
    avgLen,
    cycleStats?.lastLength,
    entriesSorted,
    experiment,
  ]);

  const cycleEditModal = useMemo(() => {
    if (!editISO) return null;

    const e = byISO.get(editISO) as any;
    const flowVal = e?.values?.flow;
    const flow = typeof flowVal === 'number' ? flowVal : 0;
    const isBleeding = flow > 0;
    const isStart = Boolean(e?.cycleStartOverride);
    const isOv = fertilityEnabled && predictedOvulationSet.has(editISO);

    const ensureEntry = () => {
      if (e) return e;
      const now = new Date().toISOString();
      return {
        id:
          globalThis.crypto && 'randomUUID' in globalThis.crypto
            ? (globalThis.crypto as any).randomUUID()
            : String(Math.random()),
        dateISO: editISO,
        values: {},
        createdAt: now,
        updatedAt: now,
      };
    };

    const saveEntry = (next: any) => {
      const now = new Date().toISOString();
      upsertEntry({ ...next, updatedAt: now });
    };

    const setFlow = (v: number) => {
      const base = ensureEntry();
      const next = { ...base, values: { ...(base.values ?? {}), flow: v } };
      saveEntry(next);
    };

    const toggleStart = (v: boolean) => {
      const base = ensureEntry();
      const now = new Date().toISOString();

      // Cycle start should be an explicit, single marker.
      // If we set a start on this day, clear any other manual starts to avoid duplicates.
      if (v) {
        for (const existing of entriesSorted as any[]) {
          if (existing?.cycleStartOverride && existing.dateISO !== editISO) {
            upsertEntry({ ...existing, cycleStartOverride: false, updatedAt: now });
          }
        }
      }

      const next = { ...base, cycleStartOverride: v, updatedAt: now };
      upsertEntry(next);
    };

    const toggleOvulation = (v: boolean) => {
      const base = ensureEntry();
      const now = new Date().toISOString();
      const next = { ...base, ovulationOverride: v, updatedAt: now };
      upsertEntry(next);
      onUpdateUser((prev: any) => {
        const current = Array.isArray(prev?.ovulationOverrideISOs) ? prev.ovulationOverrideISOs.filter((iso: string) => iso !== editISO) : [];
        return {
          ...prev,
          ovulationOverrideISOs: v ? [...current, editISO].sort() : current,
        };
      });
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setEditISO(null)} aria-label="Close" />
        <div className="relative w-full max-w-lg eb-card p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xl font-semibold">Edit cycle</div>
              <div className="text-sm text-[rgb(var(--color-text-secondary))]">
                {prettyDate(new Date(editISO + 'T00:00:00'))}
              </div>
            </div>
            <button type="button" className="p-2 rounded-xl hover:bg-neutral-100" onClick={() => setEditISO(null)} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className={cn('eb-btn-secondary flex items-center gap-2 justify-center', isBleeding ? 'bg-[rgb(var(--color-primary)/0.10)] border-[rgb(var(--color-primary)/0.30)]' : '')}
              onClick={() => { setFlow(isBleeding ? 0 : 8); setEditISO(null); }}
            >
              {isBleeding ? <Droplets className="w-4 h-4" /> : <Droplet className="w-4 h-4" />}
              <span>{isBleeding ? 'Remove bleeding' : 'Mark bleeding'}</span>
            </button>

            <button
              type="button"
              className={cn('eb-btn-secondary flex items-center gap-2 justify-center', isStart ? 'bg-[rgb(var(--color-primary)/0.10)] border-[rgb(var(--color-primary)/0.30)]' : '')}
              onClick={() => { toggleStart(!isStart); setEditISO(null); }}
            >
              <CycleFlagIcon size={17} filled className="text-current" />
              <span>{isStart ? 'Remove cycle start' : 'Set as cycle start'}</span>
            </button>

            {fertilityEnabled ? (
              <button
                type="button"
                className="eb-btn-secondary flex items-center gap-2 justify-center sm:col-span-2"
                onClick={() => { toggleOvulation(!isOv); setEditISO(null); }}
              >
                <Egg className="w-4 h-4" />
                <span>{isOv ? 'Remove ovulation' : 'Mark as ovulation'}</span>
              </button>
            ) : null}
          </div>

          <div className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            These edits update your cycle data (period and fertility). They do not change your symptom entries. Bleeding logged in your daily check-in remains the primary source of truth.
          </div>
        </div>
      </div>
    );
  }, [editISO, byISO, fertilityEnabled, predictedOvulationSet, entriesSorted, upsertEntry, onUpdateUser]);

  const showLegend = cycleEnabled || fertilityEnabled;

  return (
    <div className="eb-page">
      {/* Keep a more phone-like density on wide screens */}
      <div className="eb-page-inner">
        <section className="eb-card eb-hero eb-hero-surface eb-hero-md eb-hero-on-dark mb-4 sm:mb-5">
          <div className="eb-page-kicker !text-white/72">Calendar</div>
          <h1 className="mb-2 text-white">Calendar</h1>
          <p className="text-white/85">Tap any day to check in or edit. Use Overlay to spot patterns.</p>
          <div className="mt-4 min-w-0 eb-inset p-4 bg-[rgba(255,255,255,0.12)] border-[rgba(255,255,255,0.16)]">
            {hasCycleAnchor ? (
              <>
                <div className="font-semibold text-[15px] sm:text-base text-black">{cycleTrust.phaseTrust === 'confirmed' ? rhythmContextLabel : `Estimated ${rhythmContextLabel}`}{rhythmTiming.currentDay ? ` · Day ${rhythmTiming.currentDay} in phase` : ''}</div>
                <div className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">{cycleTrust.predictionTrust === 'stale' ? 'Rhythm is waiting for a fresh cycle anchor before it resumes forward predictions.' : cycleTrust.predictionTrust === 'early' ? 'Early estimate based on your latest cycle start. This will tighten as more cycles are logged.' : cycleTrust.phaseTrust === 'confirmed' ? (rhythmTiming.currentDay ? shortPhaseCue(rhythmModel.phaseKey) : 'Still learning the timing') : 'Estimated from your recent logs and cycle timing.'}</div>
              </>
            ) : cycleEnabled ? (
              <>
                <div className="font-semibold text-[15px] sm:text-base text-black">Still learning your cycle</div>
                <div className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">Log your first period or mark a cycle start in Edit cycle before the calendar starts predicting phase or fertile windows.</div>
              </>
            ) : (
              <>
                <div className="font-semibold text-[15px] sm:text-base text-black">Symptom calendar</div>
                <div className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">Cycle timing is off right now, but you can still use Calendar to log and review symptoms.</div>
              </>
            )}
            </div>
            <div className="eb-icon-frame self-start">
              <CalendarDays className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
          </div>
        </section>
        <div className="eb-card eb-card-soft mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <button
              type="button"
              className="eb-btn-secondary"
              onClick={() => setMonthCursor(startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)))}
            >
              Prev
            </button>
            <div className="font-semibold tracking-[-0.01em]">{monthLabel}</div>
            <button type="button" className="eb-btn-secondary" onClick={() => setMonthCursor(startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)))}>
              Next
            </button>
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            <div className="text-sm text-[rgb(var(--color-text-secondary))]">Overlay</div>
            <select className="eb-input !h-10 !py-2" value={overlayKey} onChange={(e) => setOverlayKey(e.target.value as any)}>
              {availableOverlayKeys.map((key) => (
                <option key={key} value={key}>{overlayLabel(key)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-x-2 gap-y-1.5 sm:gap-y-2">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
            <div key={d} className="text-xs text-[rgb(var(--color-text-secondary))] px-1">{d}</div>
          ))}

          {days.map((d) => {
            const iso = toISO(d);
            const isToday = iso === todayISO;
            const inMonth = d >= monthStart && d <= monthEnd;
            const entry = byISO.get(iso);

            const isPeriod = periodSet.has(iso);
            const isFertile = fertileSet.has(iso);

            // Overlay bar intensity
            const raw = getOverlayValue(entry, overlayKey);
            const hasOverlay = raw != null && raw > 0;
            let barOpacity = 0;
            if (hasOverlay) {
              barOpacity = overlayKey === 'mood' ? (raw / 3) * 0.55 : (raw / 10) * 0.55;
              barOpacity = clamp(barOpacity, 0.12, 0.55);
            }

            const hasSex = Boolean((entry as any)?.events?.sex);
            const hasExperiment = isExperimentActiveOnISO(experiment, iso);
            const isPredictedOvulation = fertilityEnabled && predictedOvulationSet.has(iso);
            const isCycleStart = cycleStarts.includes(iso);
            const isPredictedCycleStart = cycleEnabled && predictedNextCycleStartISO === iso && !isCycleStart;
            const flowVal = (entry as any)?.values?.flow;
            const flow = typeof flowVal === 'number' ? flowVal : 0;
            const hasSpotting = Boolean((entry as any)?.breakthroughBleed) || (flow > 0 && !isPeriod);
            const dayMarkers = getCalendarMarkers({
              isPeriod,
              isCycleStart,
              isPredictedCycleStart,
              hasSpotting,
              isPredictedOvulation,
              hasExperiment,
              hasSex,
            });

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  if (editMode) setEditISO(iso);
                  else setSummaryISO(iso);
                }}
                className={`relative rounded-2xl border text-left p-2 min-h-[64px] transition shadow-sm active:scale-[0.99] ${
                  inMonth ? 'bg-white border-[rgba(0,0,0,0.08)] hover:shadow-md hover:-translate-y-[1px]' : 'bg-white border-[rgba(0,0,0,0.04)]'
                } ${isToday ? 'outline outline-2 outline-[rgb(var(--color-primary-dark))] outline-offset-0' : ''} ${isFertile ? 'eb-fertile' : ''}`}
                style={{
                  // IMPORTANT: our CSS vars store space-separated RGB values (e.g. "132 155 130").
                  // Use the modern `rgb(R G B / a)` syntax (NOT rgba(var(--color-*), a)).
                  background: isPeriod ? `rgb(var(--color-primary-dark) / 0.16)` : undefined,
                }}
              >
                <div className="flex h-full min-h-[48px] flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-sm font-medium leading-none ${inMonth ? '' : 'opacity-40'}`}>{d.getDate()}</div>

                    <div className="flex min-h-[12px] flex-col items-end justify-start gap-1 text-[rgb(var(--color-primary-dark))] sm:flex-row sm:items-center sm:justify-end">
                      {dayMarkers.map((marker) => (
                        <span
                          key={marker.key}
                          className="inline-flex items-center justify-center"
                          aria-label={marker.label}
                          title={marker.label}
                        >
                          {marker.icon}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Symptom overlay bar (only when data exists for this day) */}
                  <div className="mt-auto pt-3">
                    {hasOverlay && (
                      <div
                        className="h-1 rounded-full"
                        style={{ background: `rgb(var(--color-primary) / ${barOpacity})` }}
                        aria-label={`${overlayLabel(overlayKey)} overlay`}
                        title={`${overlayLabel(overlayKey)} overlay`}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Day summary (tap a day) */}
        {summaryModal}


        {/* Cycle edit sheet */}
        {cycleEditModal}

        {showLegend && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[rgb(var(--color-text-secondary))]">
              {cycleEnabled && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-3 rounded-md"
                    style={{ background: 'rgb(var(--color-primary-dark) / 0.16)' }}
                  />
                  <span>Period window</span>
                </div>
              )}

              {fertilityEnabled && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-3 rounded-md"
                    style={{
                      background: 'rgb(var(--color-accent) / 0.14)',
                      border: '2px solid rgb(var(--color-accent) / 0.32)',
                      boxShadow: 'inset 0 0 0 1px rgb(var(--color-accent) / 0.08)',
                    }}
                  />
                  <span>Fertile window</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <CycleFlagIcon size={12} filled className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                <span>Cycle start</span>
              </div>
              {cycleEnabled && hasCycleAnchor && cycleTrust.showFutureCycleStart && predictedNextCycleStartISO && (
                <div className="flex items-center gap-2">
                  <Flag size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                  <span>Predicted cycle start</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Droplet size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                <span>Period day</span>
              </div>
              <div className="flex items-center gap-2">
                <Droplets size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                <span>Spotting / breakthrough bleed</span>
              </div>
              {fertilityEnabled && (
                <div className="flex items-center gap-2">
                  <Sparkles size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                  <span>Predicted ovulation</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <FlaskConical size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                <span>Experiment active</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart size={11} strokeWidth={1.75} className="opacity-80 text-[rgb(var(--color-primary-dark))]" />
                <span>Sex logged</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-2 rounded-full" style={{ background: bandColorCSS(0) }} />
                  <span className="w-3 h-2 rounded-full" style={{ background: bandColorCSS(1) }} />
                  <span className="w-3 h-2 rounded-full" style={{ background: bandColorCSS(2) }} />
                </span>
                <span>Overlay intensity</span>
              </div>
            
{editMode && (
  <div className="mt-3 eb-callout">
    <div className="flex items-start gap-2">
      <PencilLine className="w-4 h-4 mt-0.5 text-[rgb(var(--color-primary-dark))]" />
      <div className="text-sm">
        <div className="font-medium">Cycle edit mode</div>
        <div className="text-[rgb(var(--color-text-secondary))]">
          Tap a day to adjust bleeding, cycle start, or ovulation. Tap Edit cycle again to return to normal.
        </div>
      </div>
    </div>
  </div>
)}

</div>

            <div className="mt-4 text-sm text-[rgb(var(--color-text-secondary))]">
              Tip: switch overlay to{' '}
              <span className="font-medium">Overall mood</span>{' '}
              to spot good and difficult patches across the month.
            </div>
          </>
        )}

{/* Cycle edit toggle (sticky within page-inner so it aligns with the calendar grid, not the viewport edge) */}
<div className="sticky bottom-6 mt-6 flex justify-end pointer-events-none">
  <button
    type="button"
    className={cn(
      "pointer-events-auto eb-btn-secondary !h-12 !px-4 !py-0 flex items-center gap-2 shadow-lg",
      editMode && "border-[rgb(var(--color-primary)/0.55)] bg-[rgb(var(--color-primary)/0.10)]"
    )}
    onClick={() => setEditMode((v) => !v)}
    aria-pressed={editMode}
    title={editMode ? "Exit cycle edit mode" : "Edit cycle on calendar"}
  >
    <PencilLine className="w-4 h-4" />
    <span className="text-sm">{editMode ? "Editing" : "Edit cycle"}</span>
  </button>
</div>


      </div>
    </div>
  );
}
