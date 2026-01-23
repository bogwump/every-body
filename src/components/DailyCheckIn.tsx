import React, { useEffect, useMemo, useState } from 'react';
import { Battery, Moon, Heart, Droplet, Zap, Brain, Wind, Check, Smile, Meh, Frown, Sparkles } from 'lucide-react';
import type { CheckInEntry, SymptomKey, UserData } from '../types';
import { isoToday } from '../lib/analytics';
import { useEntries } from '../lib/appStore';

interface DailyCheckInProps {
  userData: UserData;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onDone: () => void;
  onNavigate?: (screen: string) => void;
}

const moodIcons: Array<{ value: 1 | 2 | 3; icon: React.ElementType; label: string }> = [
  { value: 1, icon: Frown, label: 'Low' },
  { value: 2, icon: Meh, label: 'Okay' },
  { value: 3, icon: Smile, label: 'Good' },
];

const sliderMeta: Record<Exclude<SymptomKey, never>, { label: string; icon: React.ElementType; color: string }> = {
  energy: { label: 'Energy', icon: Battery, color: 'text-amber-500' },
  sleep: { label: 'Sleep Quality', icon: Moon, color: 'text-indigo-500' },
  pain: { label: 'Pain Level', icon: Heart, color: 'text-rose-500' },
  flow: { label: 'Bleeding / Spotting', icon: Droplet, color: 'text-red-400' },
  stress: { label: 'Stress', icon: Zap, color: 'text-orange-500' },
  focus: { label: 'Mental Clarity', icon: Brain, color: 'text-purple-500' },
  bloating: { label: 'Bloating', icon: Wind, color: 'text-teal-500' },

  hairShedding: { label: 'Hair shedding', icon: Sparkles, color: 'text-emerald-600' },
  facialSpots: { label: 'Facial spots', icon: Sparkles, color: 'text-amber-600' },
  cysts: { label: 'Cysts', icon: Heart, color: 'text-rose-600' },
  brainFog: { label: 'Brain fog', icon: Brain, color: 'text-purple-600' },
  fatigue: { label: 'Fatigue', icon: Battery, color: 'text-amber-500' },
  nightSweats: { label: 'Night sweats', icon: Moon, color: 'text-sky-600' },
};

function moodFill(v: 1 | 2 | 3): string {
  // Match the same calm scale as the 0–10 buttons.
  if (v === 1) return 'bg-[rgb(var(--color-primary-light)_/_0.25)]';
  if (v === 2) return 'bg-[rgb(var(--color-accent)_/_0.22)]';
  return 'bg-[rgb(var(--color-primary-dark)_/_0.20)]';
}

function moodBorder(v: 1 | 2 | 3): string {
  if (v === 1) return 'border-[rgb(var(--color-primary-light)_/_0.70)]';
  if (v === 2) return 'border-[rgb(var(--color-accent)_/_0.70)]';
  return 'border-[rgb(var(--color-primary-dark)_/_0.70)]';
}

function moodInk(v: 1 | 2 | 3): string {
  if (v === 1) return 'text-[rgb(var(--color-primary))]';
  if (v === 2) return 'text-[rgb(var(--color-accent-ink,0,0,0))]';
  return 'text-[rgb(var(--color-primary-dark))]';
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toScale10(percent: number): number {
  // Stored values are 0-100. UI shows a simpler 0-10 scale.
  return clamp(Math.round((percent ?? 0) / 10), 0, 10);
}

function fromScale10(scale: number): number {
  return clamp(Math.round(scale), 0, 10) * 10;
}

function scaleFill(n: number): string {
  // Theme-based gentle shift (no traffic-light colours).
  // Low: primary-light (soft)
  // Mid: accent (warm)
  // High: primary / primary-dark (deeper)
  if (n <= 2) return 'bg-[rgb(var(--color-primary-light)_/_0.22)]';
  if (n <= 4) return 'bg-[rgb(var(--color-primary-light)_/_0.30)]';
  if (n <= 6) return 'bg-[rgb(var(--color-accent)_/_0.26)]';
  if (n <= 8) return 'bg-[rgb(var(--color-primary)_/_0.22)]';
  return 'bg-[rgb(var(--color-primary-dark)_/_0.20)]';
}

function scaleBorder(n: number): string {
  if (n <= 4) return 'border-[rgb(var(--color-primary-light)_/_0.65)]';
  if (n <= 6) return 'border-[rgb(var(--color-accent)_/_0.65)]';
  if (n <= 8) return 'border-[rgb(var(--color-primary)_/_0.65)]';
  return 'border-[rgb(var(--color-primary-dark)_/_0.65)]';
}

function scaleInk(n: number): string {
  if (n <= 4) return 'text-[rgb(var(--color-primary))]';
  if (n <= 6) return 'text-[rgb(var(--color-accent-ink,0,0,0))]';
  if (n <= 8) return 'text-[rgb(var(--color-primary))]';
  return 'text-[rgb(var(--color-primary-dark))]';
}

function Scale10({ value, onChange, showZeroLabel }: { value: number; onChange: (n: number) => void; showZeroLabel?: boolean }) {
  const current = clamp(value, 0, 10);
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {Array.from({ length: 11 }).map((_, idx) => {
        const n = idx;
        const selected = n === current;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={
              'shrink-0 w-8 h-9 rounded-lg border transition-all text-sm font-medium ' +
              (selected
                ? `${scaleFill(n)} ${scaleBorder(n)} ${scaleInk(n)} shadow-sm`
                : 'bg-white border-[rgba(0,0,0,0.10)] text-[rgb(var(--color-text))] hover:bg-neutral-50')
            }
            aria-pressed={selected}
            title={n === 0 && showZeroLabel ? 'None' : String(n)}
          >
            {n === 0 && showZeroLabel ? '0' : n}
          </button>
        );
      })}
    </div>
  );
}

export function DailyCheckIn({ userData, onUpdateUserData, onDone, onNavigate }: DailyCheckInProps) {
  const todayISO = isoToday();
  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | null>(null);
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Partial<Record<SymptomKey, number>>>({});
  const [markNewCycle, setMarkNewCycle] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState(false);

  const { entries, upsertEntry } = useEntries();
  const existingToday = useMemo(() => entries.find((e) => e.dateISO === todayISO), [entries, todayISO]);

  // Populate defaults / existing entry
  useEffect(() => {
    if (existingToday) {
      setMarkNewCycle(Boolean((existingToday as any)?.cycleStartOverride));
      setSelectedMood(existingToday.mood ?? null);
      setNotes(existingToday.notes ?? '');
      setValues(existingToday.values ?? {});
      return;
    }

    // defaults if no existing entry
    setMarkNewCycle(false);
    const defaults: Partial<Record<SymptomKey, number>> = {};
    for (const k of userData.enabledModules) {
      defaults[k] = k === 'pain' || k === 'flow' || k === 'bloating' ? 0 : 50;
    }
    setValues(defaults);
    setSelectedMood(null);
    setNotes('');
  }, [existingToday, userData.enabledModules]);

  const enabledModulesEffective = useMemo(() => {
    // symptoms are never blocked by cycle tracking mode
    // but if user says they have no cycle, we gently hide flow by default unless they explicitly enabled it
    if (userData.cycleTrackingMode === 'no-cycle') {
      return userData.enabledModules;
    }
    return userData.enabledModules;
  }, [userData.cycleTrackingMode, userData.enabledModules]);

  const sliders = enabledModulesEffective
    .map((key) => ({ key, ...sliderMeta[key] }))
    // keep flow optional and never required
    .filter(Boolean);

  const handleSliderChange = (key: SymptomKey, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const now = new Date().toISOString();
    const next: CheckInEntry = {
      id: existingToday?.id ?? `${Date.now()}`,
      dateISO: todayISO,
      mood: selectedMood ?? undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      values: (() => {
        const nextValues = { ...(values ?? {}) } as any;
        // If user toggles "Bleeding/spotting started" but didn't touch the slider, log a minimal flow value.
        if (userData.cycleTrackingMode === 'cycle' && userData.enabledModules.includes('flow')) {
          if (markBleedingStarted && (!nextValues.flow || nextValues.flow <= 0)) nextValues.flow = 1;
        }
        return nextValues;
      })(),
      events: (() => {
        const ev: any = { ...((existingEntry as any)?.events ?? {}) };
        if (userData.cycleTrackingMode === 'cycle' && userData.fertilityMode) {
          if (markSex) ev.sex = true;
          else delete ev.sex;
        }
        return Object.keys(ev).length ? ev : undefined;
      })(),
      cycleStartOverride: markNewCycle ? true : undefined,
      createdAt: existingToday?.createdAt ?? now,
      updatedAt: now,
    };

    upsertEntry(next);

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onDone();
    }, 450);
  };

  const showCycleNudge = userData.cycleTrackingMode === 'no-cycle' && userData.enabledModules.includes('flow');

  return (
    <div className="min-h-screen">
      <div className="eb-container py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2">Daily Check-in</h1>
          <p className="text-[rgb(var(--color-text-secondary))]">
            {new Date(activeDateISO + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {activeDateISO !== todayISO ? ' (edit)' : ''}
          </p>
        </div>

        {/* Friendly note for no-cycle users */}
        {userData.cycleTrackingMode === 'no-cycle' && (
          <div className="eb-card mb-6 p-5">
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              You can track symptoms even without a cycle. If you ever want to use cycle-phase insights, you can switch it on in Profile.
            </p>
          </div>
        )}

        {/* Mood Selection */}
        <div className="eb-card mb-6">
          <h3 className="mb-4">Overall Mood</h3>
          <div className="flex gap-4 justify-center">
            {moodIcons.map((mood) => {
              const Icon = mood.icon;
              const isSelected = selectedMood === mood.value;
              return (
                <button
                  key={mood.value}
                  onClick={() => setSelectedMood(mood.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all border ${
                    isSelected
                      ? `${moodFill(mood.value)} ${moodBorder(mood.value)} scale-110 shadow-sm`
                      : 'bg-white hover:bg-neutral-50 border-[rgba(0,0,0,0.08)]'
                  }`}
                >
                  <Icon
                    className={`w-8 h-8 ${isSelected ? moodInk(mood.value) : 'text-neutral-500'}`}
                    strokeWidth={2.25}
                  />
                  <span className={`text-sm ${isSelected ? moodInk(mood.value) : ''}`}>{mood.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        
        {/* Quick log (cycle & fertility) */}
        {(userData.cycleTrackingMode === 'cycle' || userData.fertilityMode) && (
          <div className="eb-card mb-6">
            <h3 className="mb-1">Quick log</h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
              Optional extras. These sit alongside your check-in (not in your symptom sliders).
            </p>

            {userData.cycleTrackingMode === 'cycle' && (
              <button
                type="button"
                onClick={() => setMarkNewCycle((v) => !v)}
                className="w-full flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm">New cycle started</span>
                <TogglePill checked={markNewCycle} />
              </button>
            )}

            {userData.cycleTrackingMode === 'cycle' && userData.enabledModules.includes('flow') && (
              <button
                type="button"
                onClick={() => setMarkBleedingStarted((v) => !v)}
                className="w-full flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm">Bleeding/spotting started</span>
                <TogglePill checked={markBleedingStarted} />
              </button>
            )}

            {userData.cycleTrackingMode === 'cycle' && userData.fertilityMode && (
              <button
                type="button"
                onClick={() => setMarkSex((v) => !v)}
                className="w-full flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm">Sex</span>
                <TogglePill checked={markSex} />
              </button>
            )}
          </div>
        )}

        {/* Symptom Sliders */}
        <div className="eb-card mb-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="mb-1">Your check-in</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Showing your chosen symptoms</p>
            </div>
            <button
              onClick={() => (onNavigate ? onNavigate('profile') : onUpdateUserData((prev) => ({ ...prev })))}
              className="text-sm text-[rgb(var(--color-primary))] hover:underline"
              title="You can customise what you track in Profile"
              type="button"
            >
              Customise
            </button>
          </div>

          {showCycleNudge && (
            <p className="text-xs text-[rgb(var(--color-text-secondary))] mb-4">
              Tip: If you don't bleed because of a coil or menopause, you can keep tracking symptoms and turn off cycle tracking in Profile.
            </p>
          )}

          <div className="space-y-6">
            {sliders.map((slider) => {
              const Icon = slider.icon;
              const v = typeof values[slider.key] === 'number' ? (values[slider.key] as number) : 0;
              return (
                <div key={slider.key}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${slider.color}`} />
                      <span className="text-sm">{slider.label}</span>
                    </div>
                    <span className="text-sm font-medium text-[rgb(var(--color-primary))]">{toScale10(v)}/10</span>
                  </div>
                  <Scale10
                    value={toScale10(v)}
                    onChange={(n) => handleSliderChange(slider.key, fromScale10(n))}
                    showZeroLabel={slider.key === 'flow' || slider.key === 'pain'}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="eb-card mb-6">
          <h3 className="mb-4">Notes (Optional)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you noticed today?"
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-[rgb(228_228_231_/_0.7)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))] focus:border-transparent resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className={`w-full py-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
            submitted
              ? 'bg-green-500 text-white'
              : 'bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))]'
          }`}
        >
          {submitted ? (
            <>
              <Check className="w-5 h-5" />
              Saved
            </>
          ) : (
            'Save check-in'
          )}
        </button>
      </div>
    </div>
  );

function TogglePill({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-12 h-6 rounded-full transition-all inline-flex items-center ${
        checked ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
      }`}
      aria-hidden="true"
    >
      <span
        className={`w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

}