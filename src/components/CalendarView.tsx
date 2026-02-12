
import React, { useMemo, useState } from 'react';
import { PencilLine, Droplet, Droplets, Egg, X, Flag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { cn } from './ui/utils';
import type { UserData, SymptomKey } from '../types';
import { useEntries } from '../lib/appStore';
import { computeCycleStats, sortByDateAsc } from '../lib/analytics';

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

function InfluenceMark({ size = 10, title }: { size?: number; title: string }) {
  return (
    <span className="inline-flex items-center justify-center" aria-label={title} title={title}>
      <span
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: 'rgb(var(--color-primary-dark) / 0.55)',
          boxShadow: '0 0 0 2px rgb(var(--color-surface))',
        }}
      />
    </span>
  );
}

function getCycleStarts(entriesSorted: any[]): string[] {
  const starts: string[] = [];

  // We want to avoid treating a single day of very light / breakthrough spotting as a new cycle.
  // Heuristic:
  // - A clear bleed (flow >= 3 on a 0–10 scale) after no flow counts as a new cycle start
  // - Spotting (flow 1–2) only counts if there are 2 consecutive spotting days
  // - Manual override (cycleStartOverride) always counts as a new cycle start
  let prevFlow = 0;
  let spottingStreak = 0;
  let spottingStreakStartISO: string | null = null;

  for (const e of entriesSorted) {
    const flowVal = e?.values?.flow;
    const flow = typeof flowVal === 'number' ? flowVal : 0;
    const override = Boolean((e as any)?.cycleStartOverride);
    const breakthrough = Boolean((e as any)?.breakthroughBleed);
    const effectiveFlow = breakthrough ? 0 : flow;

    // Breakthrough/spotting flagged by the user should never start a cycle. Treat it as 'no flow' for cycle logic.
    if (breakthrough && !override) {
      prevFlow = 0;
      spottingStreak = 0;
      spottingStreakStartISO = null;
      continue;
    }

    if (override) {
      starts.push(e.dateISO);
      // Keep state moving in case the user also logged flow the same day.
      prevFlow = flow;
      spottingStreak = 0;
      spottingStreakStartISO = null;
      continue;
    }

    const isBleed = effectiveFlow >= 3;
    const isSpotting = effectiveFlow > 0 && effectiveFlow < 3;

    if (isBleed && prevFlow === 0) {
      starts.push(e.dateISO);
      spottingStreak = 0;
      spottingStreakStartISO = null;
    } else if (isSpotting) {
      if (spottingStreak === 0) spottingStreakStartISO = e.dateISO;
      spottingStreak += 1;

      // Only promote spotting to a cycle start if we see two consecutive spotting days and we were previously at zero.
      if (prevFlow === 0 && spottingStreak >= 2 && spottingStreakStartISO) {
        starts.push(spottingStreakStartISO);
        // prevent repeated pushes on longer streaks
        spottingStreak = 2;
      }
    } else {
      spottingStreak = 0;
      spottingStreakStartISO = null;
    }

    prevFlow = flow;
  }

  return Array.from(new Set(starts)).sort((a, b) => a.localeCompare(b));
}


function getOverlayValue(entry: any, key: SymptomKey | 'mood'): number | null {
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
  const map: Partial<Record<SymptomKey, string>> = {
    energy: 'Energy',
    sleep: 'Sleep',
    stress: 'Stress',
    focus: 'Clarity',
    bloating: 'Bloating',
    pain: 'Pain',
    fatigue: 'Fatigue',
    brainFog: 'Brain fog',
    nightSweats: 'Night sweats',
    hairShedding: 'Hair shedding',
    facialSpots: 'Facial spots',
    cysts: 'Cysts',
    flow: 'Bleeding/spotting',
  };
  return map[key] ?? String(key);
}

export function CalendarView({ userData, onNavigate, onOpenCheckIn, onUpdateUser }: Props) {
  const { entries, upsertEntry } = useEntries();
  const entriesSorted = useMemo(() => sortByDateAsc(entries as any[]), [entries]);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted as any), [entriesSorted]);
  const avgLen = cycleStats?.avgLength ?? null;

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  type OverlayKey = SymptomKey | 'mood';
  const [overlayKey, setOverlayKey] = useState<OverlayKey>('stress');

  const [editMode, setEditMode] = useState(false);
  const [editISO, setEditISO] = useState<string | null>(null);
  const [influenceTipISO, setInfluenceTipISO] = useState<string | null>(null);


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
    (entriesSorted as any[]).forEach((e) => m.set(e.dateISO, e));
    return m;
  }, [entriesSorted]);

  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayISO = toISO(new Date());

  const cycleEnabled = userData.cycleTrackingMode === 'cycle';
  const fertilityEnabled = Boolean(userData.fertilityMode) && cycleEnabled;

  const ovulationSet = useMemo(() => {
    const list = Array.isArray((userData as any).ovulationOverrideISOs)
      ? ((userData as any).ovulationOverrideISOs as string[])
      : [];
    return new Set(list);
  }, [userData]);

  const cycleStarts = useMemo(() => (cycleEnabled ? getCycleStarts(entriesSorted as any[]) : []), [cycleEnabled, entriesSorted]);

  // Build period + fertile windows
  const periodSet = useMemo(() => {
    const s = new Set<string>();
    if (!cycleEnabled) return s;

    // 1) Always shade days where the user actually logged bleeding/spotting.
    const byISO = new Map<string, any>();
    for (const e of entriesSorted as any[]) byISO.set(e.dateISO, e);

    const loggedBleed = (iso: string): boolean => {
      const e = byISO.get(iso);
      const flowVal = e?.values?.flow;
      const flow = typeof flowVal === 'number' ? flowVal : 0;
      return flow > 0;
    };

    for (const e of entriesSorted as any[]) {
      if (loggedBleed(e.dateISO)) s.add(e.dateISO);
    }

    // 2) Provisional 7-day window after a cycle start.
    //    This is a *starting point* and gets trimmed if the user logs bleeding down to zero early.
    for (const startISO of cycleStarts) {
      let seenPositive = false;
      let stopAfterISO: string | null = null;

      for (let i = 0; i < 7; i++) {
        const dayISO = addDaysISO(startISO, i);
        const e = byISO.get(dayISO);
        const breakthrough = Boolean(e?.breakthroughBleed);
        const flowVal = e?.values?.flow;
        const flow = typeof flowVal === 'number' ? flowVal : 0;
        const effectiveFlow = breakthrough ? 0 : flow;

        if (effectiveFlow > 0) seenPositive = true;

        // If the user has been bleeding and then explicitly logs 0, treat that as the end.
        if (seenPositive && effectiveFlow === 0) {
          stopAfterISO = dayISO;
          break;
        }

        s.add(dayISO);
      }

      if (stopAfterISO) {
        // remove stop day and anything after it in the provisional window
        for (let i = 0; i < 7; i++) {
          const dayISO = addDaysISO(startISO, i);
          if (dayISO >= stopAfterISO) s.delete(dayISO);
        }
      }
    }

    return s;
  }, [cycleEnabled, entriesSorted, cycleStarts]);

  const fertileSet = useMemo(() => {
    const s = new Set<string>();
    if (!fertilityEnabled) return s;

    // If the user has marked ovulation days manually, derive the fertile window from those.
    // This takes precedence over predictions.
    if (ovulationSet.size > 0) {
      for (const ovISO of Array.from(ovulationSet)) {
        // Fertile window: ovulation -5 through ovulation +1
        for (let d = -5; d <= 1; d++) {
          const dayISO = addDaysISO(ovISO, d);
          if (periodSet.has(dayISO)) continue;
          s.add(dayISO);
        }
      }
      return s;
    }

    // If we don't yet have enough data to calculate an average cycle length,
    // fall back to a sensible default so Fertility mode still shows *something*.
    const DEFAULT_CYCLE_LEN = 28;

    const startsToUse = cycleStarts.length > 0 ? cycleStarts : [new Date().toISOString().slice(0, 10)];

    for (let i = 0; i < startsToUse.length; i++) {
      const startISO = startsToUse[i];

      const nextStartISO =
        startsToUse[i + 1] ?? addDaysISO(startISO, avgLen ?? DEFAULT_CYCLE_LEN);

      const cycleLen = daysBetweenISO(startISO, nextStartISO);

      // Ovulation estimate:
      // Use the "nextStart - 14 days" idea, but guard against very short cycles where that
      // would land during the period window and confuse the UI.
      // We clamp to at least day 10, and at least 10 days before next start.
      const latestAllowed = Math.max(10, cycleLen - 10);
      const ovulationDay = clamp(cycleLen - 14, 10, latestAllowed);
      const ovulationISO = addDaysISO(startISO, ovulationDay);

      // Fertile window: ovulation -5 through ovulation +1
      for (let d = -5; d <= 1; d++) {
        const dayISO = addDaysISO(ovulationISO, d);

        // Never mark fertile days that are within the period window (keeps colours unambiguous).
        if (periodSet.has(dayISO)) continue;

        s.add(dayISO);
      }
    }
    return s;
  }, [fertilityEnabled, cycleStarts, avgLen, periodSet, ovulationSet]);

  const showLegend = cycleEnabled || fertilityEnabled;

  return (
    <div className="eb-page">
      {/* Keep a more phone-like density on wide screens */}
      <div className="eb-page-inner">
        <div className="mb-6">
          <h1 className="mb-2">Calendar</h1>
          <p className="text-[rgb(var(--color-text-secondary))]">Tap any day to check in or edit. Use Overlay to spot patterns.</p>
        </div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="eb-btn-secondary"
              onClick={() => setMonthCursor(startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)))}
            >
              Prev
            </button>
            <div className="font-semibold">{monthLabel}</div>
            <button type="button" className="eb-btn-secondary" onClick={() => setMonthCursor(startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)))}>
              Next
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm text-[rgb(var(--color-text-secondary))]">Overlay</div>
            <select className="eb-input !py-2 !h-10" value={overlayKey} onChange={(e) => setOverlayKey(e.target.value as any)}>
              <option value="mood">Overall mood</option>
              <option value="stress">Stress</option>
              <option value="energy">Energy</option>
              <option value="sleep">Sleep</option>
              <option value="pain">Pain</option>
              <option value="bloating">Bloating</option>
              <option value="focus">Clarity</option>
              <option value="fatigue">Fatigue</option>
              <option value="brainFog">Brain fog</option>
              <option value="nightSweats">Night sweats</option>
              <option value="hairShedding">Hair shedding</option>
              <option value="facialSpots">Facial spots</option>
              <option value="cysts">Cysts</option>
              <option value="flow">Bleeding/spotting</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
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
            let barOpacity = 0;
            if (raw != null) {
              barOpacity = overlayKey === 'mood' ? (raw / 3) * 0.55 : (raw / 10) * 0.55;
              barOpacity = clamp(barOpacity, 0.12, 0.55);
            }

            const influences = influencesFromEntry(entry);
            const hasInfluences = influences.length > 0;
            const hasNote = typeof entry?.notes === 'string' && entry.notes.trim().length > 0;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  if (editMode) {
                    setEditISO(iso);
                    return;
                  }
                  onOpenCheckIn(iso);
                }}
                className={`relative rounded-2xl border text-left p-2 min-h-[54px] transition shadow-sm active:scale-[0.99] ${
                  inMonth ? 'bg-white border-[rgba(0,0,0,0.08)] hover:shadow-md hover:-translate-y-[1px]' : 'bg-[rgba(0,0,0,0.02)] border-[rgba(0,0,0,0.04)]'
                } ${isToday ? 'ring-2 ring-[rgb(var(--color-primary)/0.45)] border-[rgb(var(--color-primary)/0.35)]' : ''} ${isFertile ? 'eb-fertile' : ''}`}
                style={{
                  // IMPORTANT: our CSS vars store space-separated RGB values (e.g. "132 155 130").
                  // Use the modern `rgb(R G B / a)` syntax (NOT rgba(var(--color-*), a)).
                  background: isPeriod ? `rgb(var(--color-primary-dark) / 0.16)` : undefined,
                }}
              >
                <div className="flex items-start justify-between">
                  <div className={`text-sm font-medium ${inMonth ? '' : 'opacity-40'}`}>{d.getDate()}</div>

                                    <div className="relative w-[22px] h-[14px] flex items-center justify-end">
                    {hasInfluences && (

                      <span className="absolute top-0 right-0">
                        <span
                          onMouseEnter={() => setInfluenceTipISO(iso)}
                          onMouseLeave={() => setInfluenceTipISO((cur) => (cur === iso ? null : cur))}
                          onTouchStart={() => {
                            setInfluenceTipISO(iso);
                            window.setTimeout(() => {
                              setInfluenceTipISO((cur) => (cur === iso ? null : cur));
                            }, 1600);
                          }}
                        >
                          <InfluenceMark size={9} title={influences.join(', ')} />
                        </span>
                        {influenceTipISO === iso && (
                          <div className="absolute z-30 top-0 right-4 -translate-y-full mt-[-6px] px-2 py-1 rounded-md text-[11px] bg-white text-black shadow border border-[rgba(0,0,0,0.08)]">
                            {influences.join(', ')}
                          </div>
                        )}
                      </span>
                    )}
                    {hasNote && (
                      <span
                        className="absolute top-[1px] right-[12px] inline-block w-[6px] h-[6px] rounded-full"
                        style={{
                          background: 'rgb(255 255 255 / 0.95)',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.38), 0 1px 2px rgba(0,0,0,0.12)',
                        }}
                        aria-label="Note added"
                        title="Note added"
                      />
                    )}
                  </div>

                  {isToday && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.10)] text-[rgb(var(--color-primary-dark))]">
                      Today
                    </div>
                  )}
                </div>

                {/* Symptom overlay bar (only when data exists for this day) */}
                {raw != null && (
                  <div
                    className="absolute left-2 right-2 bottom-2 h-1 rounded-full"
                    style={{ background: `rgb(var(--color-primary) / ${barOpacity})` }}
                    aria-label={`${overlayLabel(overlayKey)} overlay`}
                    title={`${overlayLabel(overlayKey)} overlay`}
                  />
                )}

                {/* Cycle start is editable, but we intentionally do not show a "Start" pill on tiles.
                   It caused visual collisions and lowered trust when heuristics shifted. */}

                {fertilityEnabled && ovulationSet.has(iso) && (
                  <div className="absolute right-2 bottom-6 text-[10px] px-1.5 py-0.5 rounded-md bg-[rgb(var(--color-accent)/0.14)] border border-[rgb(var(--color-accent)/0.55)] text-[rgb(var(--color-primary-dark))]">Ov</div>
                )}
              </button>
            );
          })}
        </div>

        
        <Sheet open={Boolean(editISO)} onOpenChange={(open) => { if (!open) setEditISO(null); }}>
  <SheetContent side="bottom" className="bg-transparent border-0 p-0 shadow-none">
    {editISO && (() => {
      const e = byISO.get(editISO);
      const flowVal = e?.values?.flow;
      const flow = typeof flowVal === 'number' ? flowVal : 0;
      const isBleeding = flow > 0;
      const isStart = Boolean(e?.cycleStartOverride);
      const isOv = fertilityEnabled && ovulationSet.has(editISO);

      const ensureEntry = () => {
        if (e) return e;
        const now = new Date().toISOString();
        return {
          id: (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? (globalThis.crypto as any).randomUUID() : String(Math.random()),
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
        onUpdateUser((prev) => {
          const list = Array.isArray((prev as any).ovulationOverrideISOs) ? ([...(prev as any).ovulationOverrideISOs] as string[]) : [];
          const set = new Set(list);
          if (v) set.add(editISO);
          else set.delete(editISO);
          return { ...(prev as any), ovulationOverrideISOs: Array.from(set).sort((a, b) => a.localeCompare(b)) };
        });
      };

      return (
        <div className="px-4 pb-6">
          <div className="mx-auto w-full max-w-lg eb-card p-4">
<div className="mb-3 flex items-start justify-between gap-4">
  <div>
    <div className="text-base font-semibold">Edit this day</div>
    <div className="text-sm text-[rgb(var(--color-text-secondary))]">{editISO ?? ''}</div>
  </div>
  <button
    type="button"
    className="eb-icon-btn"
    onClick={() => setEditISO(null)}
    aria-label="Close"
    title="Close"
  >
    <X className="w-5 h-5" />
  </button>
</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className="eb-btn-secondary flex items-center gap-2 justify-center"
              onClick={() => { setFlow(isBleeding ? 0 : 5); setEditISO(null); }}
            >
              {isBleeding ? <Droplets className="w-4 h-4" /> : <Droplet className="w-4 h-4" />}
              <span>{isBleeding ? 'Remove bleeding' : 'Mark as bleeding'}</span>
            </button>

            <button
              type="button"
              className="eb-btn-secondary flex items-center gap-2 justify-center"
              onClick={() => { toggleStart(!isStart); setEditISO(null); }}
            >
              <Flag className="w-4 h-4" />
              <span>{isStart ? 'Remove cycle start' : 'Set as cycle start'}</span>
            </button>

            {fertilityEnabled && (
              <button
                type="button"
                className="eb-btn-secondary flex items-center gap-2 justify-center sm:col-span-2"
                onClick={() => { toggleOvulation(!isOv); setEditISO(null); }}
              >
                <Egg className="w-4 h-4" />
                <span>{isOv ? 'Remove ovulation' : 'Mark as ovulation'}</span>
              </button>
            )}
          </div>

          <div className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            These edits update your cycle data (period and fertility). They do not change your symptom entries.
            Bleeding logged in your daily check-in remains the primary source of truth.
          </div>
          </div>
        </div>
      );
    })()}
  </SheetContent>
</Sheet>{showLegend && (
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
                      border: '2px solid rgb(var(--color-accent) / 0.45)',
                      boxShadow: 'inset 0 0 0 1px rgb(var(--color-accent) / 0.08)',
                    }}
                  />
                  <span>Fertile window</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-[6px] h-[6px] rounded-full"
                  style={{
                    background: 'rgb(255 255 255 / 0.95)',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.38), 0 1px 2px rgba(0,0,0,0.12)',
                  }}
                  aria-hidden
                />
                <span>Note added</span>
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
