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
} from 'lucide-react';

import type { CheckInEntry, SymptomKey, UserData } from '../types';
import { isoToday } from '../lib/analytics';
import { useEntries } from '../lib/appStore';

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
const sliderMeta: Record<SymptomKey, { label: string; icon: React.ElementType }> = {
  energy: { label: 'Energy', icon: Battery },
  sleep: { label: 'Sleep quality', icon: Moon },
  stress: { label: 'Stress', icon: Zap },
  focus: { label: 'Clarity', icon: Brain },
  bloating: { label: 'Bloating', icon: Wind },
  pain: { label: 'Pain', icon: Heart },
  flow: { label: 'Bleeding / spotting (optional)', icon: Droplet },
  hairShedding: { label: 'Hair shedding', icon: Sparkles },
  facialSpots: { label: 'Facial spots', icon: Sparkles },
  cysts: { label: 'Cysts', icon: Heart },
  brainFog: { label: 'Brain fog', icon: Brain },
  fatigue: { label: 'Fatigue', icon: Battery },
  nightSweats: { label: 'Night sweats', icon: Moon },
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
  return (
    <div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={v}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-[rgb(var(--color-primary))]"
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

  const { entries, upsertEntry } = useEntries();
  const existingEntry = useMemo(
    () => entries.find((e) => e.dateISO === activeDateISO) ?? null,
    [entries, activeDateISO]
  );

  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | null>(null);
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Partial<Record<SymptomKey, number>>>({});

  // Quick log (under mood)
  const [markNewCycle, setMarkNewCycle] = useState(false);
  const [markBleedingStarted, setMarkBleedingStarted] = useState(false);
  const [markSex, setMarkSex] = useState(false);

  const isCycleEnabled = userData.cycleTrackingMode === 'cycle';
  const isFertilityEnabled = Boolean(userData.fertilityMode) && isCycleEnabled;

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

      setMarkNewCycle(Boolean((existingEntry as any).cycleStartOverride));
      setMarkBleedingStarted(Boolean((existingEntry as any)?.values?.flow && normalise10((existingEntry as any).values.flow) > 0));
      setMarkSex(Boolean((existingEntry as any)?.events?.sex));
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
    setMarkNewCycle(false);
    setMarkBleedingStarted(false);
    setMarkSex(false);
  }, [existingEntry, userData.enabledModules, activeDateISO]);

  const enabledSliders = useMemo(() => {
    return userData.enabledModules.filter((k) => Boolean(sliderMeta[k]));
  }, [userData.enabledModules]);

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

    if (isCycleEnabled) {
      // If user marks bleeding started, ensure a non-zero flow exists.
      if (markBleedingStarted && (!nextValues.flow || normalise10(nextValues.flow) <= 0)) nextValues.flow = 6;
      // If user unchecks bleeding started, do NOT wipe their flow slider value.
    } else {
      // If cycle features off, still allow flow if they enabled it. Otherwise keep whatever is there.
    }

    const nextEvents: any = { ...((existingEntry as any)?.events ?? {}) };
    if (isFertilityEnabled) {
      if (markSex) nextEvents.sex = true;
      else delete nextEvents.sex;
    } else {
      delete nextEvents.sex;
    }

    const next: CheckInEntry = {
      id: existingEntry?.id ?? `${Date.now()}`,
      dateISO: activeDateISO,
      mood: selectedMood ?? undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      values: nextValues,
      events: Object.keys(nextEvents).length ? nextEvents : undefined,
      cycleStartOverride: isCycleEnabled && markNewCycle ? true : undefined,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
    };

    upsertEntry(next as any);
    onDone();
  };

  return (
    <div className="eb-page">
      <div className="eb-page-inner max-w-3xl">
        <div className="flex items-start justify-between gap-4 mb-6">
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
              className="eb-btn-secondary"
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
        <div className="eb-card mb-6">
          <h3 className="mb-4">Overall mood</h3>
          <div className="flex gap-4 justify-center">
            {moodIcons.map((m) => {
              const Icon = m.icon;
              const selected = selectedMood === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setSelectedMood(m.value)}
                  className={
                    'flex flex-col items-center gap-2 p-4 rounded-xl transition-all border ' +
                    (selected
                      ? 'bg-[rgb(var(--color-primary)/0.14)] border-[rgb(var(--color-primary)/0.45)] shadow-sm'
                      : 'bg-white hover:bg-neutral-50 border-[rgba(0,0,0,0.08)]')
                  }
                  aria-pressed={selected}
                >
                  <Icon
                    className={'w-8 h-8 ' + (selected ? 'text-[rgb(var(--color-primary-dark))]' : 'text-neutral-500')}
                    strokeWidth={2.25}
                  />
                  <span className={'text-sm ' + (selected ? 'text-[rgb(var(--color-primary-dark))]' : '')}>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick log under mood */}
          {isCycleEnabled && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3">Quick log</h4>
              <div className="grid grid-cols-1 gap-3">
                <SwitchRow
                  checked={markNewCycle}
                  onChange={setMarkNewCycle}
                  label="New cycle started"
                  hint="Use this if bleeding is unclear, or you just want to mark Day 1 manually."
                />
                <SwitchRow
                  checked={markBleedingStarted}
                  onChange={setMarkBleedingStarted}
                  label="Bleeding / spotting started"
                  hint="Helps the calendar show a 7-day window."
                />
                {isFertilityEnabled && (
                  <SwitchRow
                    checked={markSex}
                    onChange={setMarkSex}
                    label="Sex"
                    hint="Logged privately. Used for fertility insights if you want them."
                  />
                )}
              </div>
            </div>
          )}
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
            {enabledSliders.map((key) => {
              const meta = sliderMeta[key];
              const Icon = meta.icon;
              const current = normalise10((values as any)?.[key]);

              return (
                <div key={key} className="rounded-2xl border border-[rgba(0,0,0,0.06)] p-4 bg-white">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{meta.label}</div>
                        <div className="text-xs text-[rgb(var(--color-text-secondary))]">{current}/10</div>
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

        {/* Notes */}
        <div className="eb-card mb-6">
          <h3 className="mb-3">Notes (optional)</h3>
          <textarea
            className="eb-input min-h-[120px]"
            placeholder="Anything worth remembering today?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
  );
}
