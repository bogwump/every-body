
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


function SexMark({ size = 10 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      aria-label="Sex logged"
      title="Sex logged"
    >
      <span
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: 'rgb(var(--color-primary-dark) / 0.55)',
          boxShadow: '0 0 0 2px rgb(255 255 255 / 0.85)',
        }}
      />
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
  const todayISO = toISO(new Date());

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

            const hasSex = Boolean(entry?.events?.sex);
            const hasNote = typeof entry?.notes === 'string' && entry.notes.trim().length > 0;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => onOpenCheckIn(iso)}
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
                    {hasSex && fertilityEnabled && (
                      <span className="absolute top-0 right-0">
                        <SexMark size={9} />
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
                    <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.10)] text-[rgb(var(--color-primary-dark))]">Today</div>
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

                {/* tiny hint label if cycle start override */}
                {entry?.cycleStartOverride && (
                  <div className="absolute left-3 bottom-6 text-[10px] text-[rgb(var(--color-text-secondary))]">Start</div>
                )}
              </button>
            );
          })}
        </div>

        
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
                      background: 'rgb(255 255 255 / 0.85)',
                      boxShadow: 'inset 0 0 0 2px rgb(var(--color-primary) / 0.18)',
                      border: '1px solid rgba(0,0,0,0.05)',
                    }}
                  />
                  <span>Fertile window</span>
                </div>
              )}

              {fertilityEnabled && (
                <div className="flex items-center gap-2">
                  <SexMark size={10} />
                  <span>Sex logged</span>
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
            </div>

            <div className="mt-4 text-sm text-[rgb(var(--color-text-secondary))]">
              Tip: switch overlay to{' '}
              <span className="font-medium">Overall mood</span>{' '}
              to spot good and difficult patches across the month.
            </div>
          </>
        )}

      </div>
    </div>
  );
}
