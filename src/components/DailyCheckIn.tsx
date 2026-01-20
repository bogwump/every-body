import React, { useEffect, useMemo, useState } from 'react';
import { Battery, Moon, Heart, Droplet, Zap, Brain, Wind, Check, Smile, Meh, Frown } from 'lucide-react';
import type { CheckInEntry, SymptomKey, UserData } from '../types';
import { isoToday } from '../lib/analytics';
import { useEntries } from '../lib/appStore';

interface DailyCheckInProps {
  userData: UserData;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onDone: () => void;
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
};

export function DailyCheckIn({ userData, onUpdateUserData, onDone }: DailyCheckInProps) {
  const todayISO = isoToday();
  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | null>(null);
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Partial<Record<SymptomKey, number>>>({});
  const [submitted, setSubmitted] = useState(false);

  const { entries, upsertEntry } = useEntries();
  const existingToday = useMemo(() => entries.find((e) => e.dateISO === todayISO), [entries, todayISO]);

  // Populate defaults / existing entry
  useEffect(() => {
    if (existingToday) {
      setSelectedMood(existingToday.mood ?? null);
      setNotes(existingToday.notes ?? '');
      setValues(existingToday.values ?? {});
      return;
    }

    // defaults if no existing entry
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
      values: values ?? {},
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
    <div className="min-h-screen py-10">
      <div className="eb-container max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2">Daily Check-in</h1>
          <p>How are you feeling today?</p>
        </div>

        {/* Friendly note for no-cycle users */}
        {userData.cycleTrackingMode === 'no-cycle' && (
          <div className="eb-card mb-6">
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
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-[rgb(var(--color-primary))] bg-opacity-10 scale-110'
                      : 'bg-neutral-50 hover:bg-neutral-100'
                  }`}
                >
                  <Icon
                    className={`w-8 h-8 ${
                      isSelected ? 'text-[rgb(var(--color-primary))]' : 'text-neutral-400'
                    }`}
                  />
                  <span className="text-sm">{mood.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Symptom Sliders */}
        <div className="eb-card mb-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="mb-1">Your check-in</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Only what you chose to track</p>
            </div>
            <button
              onClick={() => onUpdateUserData((prev) => ({ ...prev }))}
              className="text-sm text-[rgb(var(--color-primary))] hover:underline"
              title="You can customise what you track in Profile"
              type="button"
            >
              Customise
            </button>
          </div>

          {showCycleNudge && (
            <p className="text-xs text-[rgb(var(--color-text-secondary))] mb-4">
              Tip: If you don’t bleed because of a coil or menopause, you can keep tracking symptoms and turn off cycle tracking in Profile.
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
                    <span className="text-sm font-medium text-[rgb(var(--color-primary))]">{v}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={v}
                    onChange={(e) => handleSliderChange(slider.key, parseInt(e.target.value, 10))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, rgb(var(--color-primary)) 0%, rgb(var(--color-primary)) ${v}%, rgb(229, 231, 235) ${v}%, rgb(229, 231, 235) 100%)`,
                    }}
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
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))] focus:border-transparent resize-none"
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
}
