
import React, { useMemo, useState } from 'react';
import type { UserData, SymptomKey } from '../types';
import { useEntries } from '../lib/appStore';
import { computeCycleStats, sortByDateAsc } from '../lib/analytics';

type Props = {
  userData: UserData;
  onNavigate: (screen: string) => void;
  onOpenCheckIn: (dateISO: string) => void;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(aISO: string, bISO: string): number {
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function HeartMark() {
  return (
    <span className="inline-flex items-center justify-center" aria-label="Sex logged" title="Sex logged">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 21s-7.2-4.6-9.7-9.1C.8 8.8 2.6 6 5.6 6c1.7 0 3.1 1 3.9 2 0.8-1 2.2-2 3.9-2 3 0 4.8 2.8 3.3 5.9C19.2 16.4 12 21 12 21Z"
          fill="rgb(var(--color-primary))"
          opacity="0.95"
        />
      </svg>
    </span>
  );
}

function getCycleStarts(entriesSorted: any[]): string[] {
  const starts: string[] = [];
  let prevHadFlow = false;

  for (const e of entriesSorted) {
    const flowVal = e?.values?.flow;
    const hasFlow = typeof flowVal === 'number' && flowVal > 0;
    const override = Boolean((e as any)?.cycleStartOverride);

    if (override) {
      starts.push(e.dateISO);
      prevHadFlow = hasFlow;
      continue;
    }

    if (hasFlow && !prevHadFlow) {
      starts.push(e.dateISO);
    }
    prevHadFlow = hasFlow;
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
  return clamp(v, 0, 10);
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

export function CalendarView({ userData, onNavigate, onOpenCheckIn }: Props) {
  const { entries } = useEntries();
  const entriesSorted = useMemo(() => sortByDateAsc(entries as any[]), [entries]);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted as any), [entriesSorted]);
  const avgLen = cycleStats?.avgLength ?? null;

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  type OverlayKey = SymptomKey | 'mood';
  const [overlayKey, setOverlayKey] = useState<OverlayKey>('stress');

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

  const cycleEnabled = userData.cycleTrackingMode === 'cycle';
  const fertilityEnabled = Boolean(userData.fertilityMode) && cycleEnabled;

  const cycleStarts = useMemo(() => (cycleEnabled ? getCycleStarts(entriesSorted as any[]) : []), [cycleEnabled, entriesSorted]);

  // Build period + fertile windows
  const periodSet = useMemo(() => {
    const s = new Set<string>();
    if (!cycleEnabled) return s;
    for (const startISO of cycleStarts) {
      for (let i = 0; i < 7; i++) s.add(addDaysISO(startISO, i));
    }
    return s;
  }, [cycleEnabled, cycleStarts]);

  const fertileSet = useMemo(() => {
    const s = new Set<string>();
    if (!fertilityEnabled) return s;

    for (let i = 0; i < cycleStarts.length; i++) {
      const startISO = cycleStarts[i];
      const nextStartISO = cycleStarts[i + 1] ?? (avgLen ? addDaysISO(startISO, avgLen) : null);
      if (!nextStartISO) continue;

      // Ovulation ~ 14 days before next cycle start
      const ovulationISO = addDaysISO(nextStartISO, -14);

      // Fertile window: ovulation -5 through ovulation +1
      for (let d = -5; d <= 1; d++) {
        s.add(addDaysISO(ovulationISO, d));
      }
    }
    return s;
  }, [fertilityEnabled, cycleStarts, avgLen]);

  const showLegend = cycleEnabled || fertilityEnabled;

  return (
    <div className="eb-page">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button type="button" className="eb-btn-secondary" onClick={() => setMonthCursor(addDaysISO(toISO(monthStart), -1) ? startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)) : monthStart)}>
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

        <div className="grid grid-cols-7 gap-3">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
            <div key={d} className="text-xs text-[rgb(var(--color-text-secondary))] px-1">{d}</div>
          ))}

          {days.map((d) => {
            const iso = toISO(d);
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

            const hasSex = Boolean(entry?.events?.sex);

            return (
              <button
                key={iso}
                type="button"
                onClick={() => onOpenCheckIn(iso)}
                className={`relative rounded-2xl border text-left p-3 min-h-[72px] transition shadow-sm ${
                  inMonth ? 'bg-white border-[rgba(0,0,0,0.08)]' : 'bg-[rgba(0,0,0,0.02)] border-[rgba(0,0,0,0.04)]'
                }`}
                style={{
                  background: isPeriod
                    ? `rgba(var(--color-primary-dark), 0.16)`
                    : isFertile
                      ? `rgba(var(--color-primary), 0.12)`
                      : undefined,
                }}
              >
                <div className="flex items-start justify-between">
                  <div className={`text-sm font-medium ${inMonth ? '' : 'opacity-40'}`}>{d.getDate()}</div>
                  {hasSex && fertilityEnabled && <HeartMark />}
                </div>

                {/* Small overlay bar */}
                {barOpacity > 0 && (
                  <div
                    className="absolute left-3 right-3 bottom-2 h-2 rounded-full"
                    style={{ background: `rgba(var(--color-primary), ${barOpacity})` }}
                    aria-label={`${overlayLabel(overlayKey)} overlay`}
                    title={`${overlayLabel(overlayKey)} overlay`}
                  />
                )}

                {/* tiny hint label if cycle start override */}
                {entry?.cycleStartOverride && (
                  <div className="absolute left-3 bottom-6 text-[10px] text-[rgb(var(--color-text-secondary))]">Start</div>
                )}
              </button>
            );
          })}
        </div>

        {showLegend && (
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[rgb(var(--color-text-secondary))]">
            {cycleEnabled && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(var(--color-primary-dark),0.22)' }} />
                <span>Period window</span>
              </div>
            )}
            {fertilityEnabled && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(var(--color-primary),0.18)' }} />
                  <span>Fertile window</span>
                </div>
                <div className="flex items-center gap-2">
                  <HeartMark />
                  <span>Sex logged</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-4 text-sm text-[rgb(var(--color-text-secondary))]">
          Tip: switch the overlay to <span className="font-medium">Overall mood</span> to see how your month felt at a glance.
        </div>
      </div>
    </div>
  );
}
