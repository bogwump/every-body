import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { UserData, SymptomKey } from '../types';
import { useEntries } from '../lib/appStore';
import { computeCycleStats, sortByDateAsc } from '../lib/analytics';

type Props = {
  userData: UserData;
  onNavigate: (screen: string) => void;
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

export function CalendarView({ userData, onNavigate }: Props) {
  const { entries } = useEntries();
  const entriesSorted = useMemo(() => sortByDateAsc(entries as any[]), [entries]);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted as any), [entriesSorted]);

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  type OverlayKey = SymptomKey | 'mood';
  const [overlayKey, setOverlayKey] = useState<OverlayKey>('flow');

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);

  const days: Date[] = [];
  // Pad calendar to start on Monday
  const dayOfWeek = (monthStart.getDay() + 6) % 7; // 0=Mon
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - dayOfWeek);

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

  const symptomLabel: Record<SymptomKey, string> = {
    energy: 'Energy',
    sleep: 'Sleep',
    pain: 'Pain',
    flow: 'Bleeding/spotting',
    stress: 'Stress',
    focus: 'Focus',
    bloating: 'Bloating',
    hairShedding: 'Hair shedding',
    facialSpots: 'Facial spots',
    cysts: 'Cysts',
    brainFog: 'Brain fog',
    fatigue: 'Fatigue',
    nightSweats: 'Night sweats',
  };

  const overlayLabel: Record<OverlayKey, string> = {
    ...symptomLabel,
    mood: 'Overall mood',
  };

  const symptomOptions: OverlayKey[] = [
    'flow',
    'mood',
    'energy',
    'sleep',
    'pain',
    'stress',
    'focus',
    'bloating',
    'hairShedding',
    'facialSpots',
    'cysts',
    'brainFog',
    'fatigue',
    'nightSweats',
  ];

  return (
    <div className="eb-page">
      <div className="eb-page-inner">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onNavigate('dashboard')} className="eb-btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            <span className="ml-2">Back</span>
          </button>
          <div>
            <h1 className="mb-1">Calendar</h1>
            {cycleEnabled && cycleStats.predictedNextStartISO ? (
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Predicted next start: {new Date(cycleStats.predictedNextStartISO + 'T00:00:00').toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {cycleEnabled ? 'Add more check-ins to improve predictions.' : 'Cycle features are off. You can still view symptom patterns.'}
              </p>
            )}
          </div>
        </div>

        <div className="eb-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="eb-btn-secondary"
                onClick={() => setMonthCursor((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() - 1, 1)))}
              >
                Prev
              </button>
              <div className="font-medium">{monthLabel}</div>
              <button
                type="button"
                className="eb-btn-secondary"
                onClick={() => setMonthCursor((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() + 1, 1)))}
              >
                Next
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-[rgb(var(--color-text-secondary))]">Overlay</label>
              <select
                className="border border-[rgba(0,0,0,0.12)] rounded-xl px-3 py-2 bg-white"
                value={overlayKey}
                onChange={(e) => setOverlayKey(e.target.value as OverlayKey)}
              >
                {symptomOptions.map((k) => (
                  <option key={k} value={k}>
                    {overlayLabel[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mt-5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-xs opacity-70 px-2">
                {d}
              </div>
            ))}

            {days.map((d) => {
              const iso = toISO(d);
              const inMonth = d >= monthStart && d <= monthEnd;
              const e = byISO.get(iso);
              const isMood = overlayKey === 'mood';
              const v = !isMood ? e?.values?.[overlayKey as SymptomKey] : undefined;
              const mood = isMood ? (e?.mood as 1 | 2 | 3 | undefined) : undefined;

              const has = isMood ? typeof mood === 'number' : typeof v === 'number' && v > 0;
              const isFlow = overlayKey === 'flow';
              const flowStrong = isFlow && typeof v === 'number' && v >= 25;

              // Theme-based dots (avoid red/amber/green)
              const moodDotClass =
                mood === 1
                  ? 'bg-[rgb(var(--color-primary-dark))]'
                  : mood === 2
                    ? 'bg-[rgb(var(--color-accent))]'
                    : mood === 3
                      ? 'bg-[rgb(var(--color-primary))]'
                      : '';
              const moodText = mood === 1 ? 'Low' : mood === 2 ? 'Okay' : mood === 3 ? 'Good' : '';

              return (
                <div
                  key={iso}
                  className={`rounded-xl border px-2 py-2 min-h-[56px] ${
                    inMonth ? 'border-[rgba(0,0,0,0.08)]' : 'border-transparent opacity-50'
                  } ${flowStrong ? 'bg-[rgba(var(--color-accent),0.20)]' : ''}`}
                  title={
                    e
                      ? isMood
                        ? `${iso} • Mood: ${moodText || '—'}`
                        : `${iso} • ${overlayLabel[overlayKey]}: ${Math.round(v ?? 0)}%`
                      : iso
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm">{d.getDate()}</div>
                    {has && !flowStrong && !isMood && <div className="w-2 h-2 rounded-full bg-[rgb(var(--color-primary))]" />}
                    {has && isMood && <div className={`w-2.5 h-2.5 rounded-full ${moodDotClass}`} />}
                  </div>
                  {flowStrong && <div className="text-xs mt-2 opacity-80">Bleeding</div>}
                </div>
              );
            })}
          </div>

          <div className="text-xs text-[rgb(var(--color-text-secondary))] mt-4">
            Tip: switch the overlay to <span className="font-medium">Overall mood</span> to see how your month felt at a glance.
          </div>
        </div>
      </div>
    </div>
  );
}
