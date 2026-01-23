import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { UserGoal } from '../../types';

interface QuickStartProps {
  selectedGoal: UserGoal | null;
  onStart: (goal: UserGoal | null) => void;
}

const options: Array<{ id: UserGoal; title: string; helper: string }> = [
  { id: 'cycle-health', title: 'Track my cycle', helper: 'Patterns, phases, and how you feel.' },
  { id: 'perimenopause', title: 'Make sense of changes', helper: 'Perimenopause and shifting symptoms.' },
  { id: 'post-contraception', title: 'Coming off contraception', helper: 'Track what your body is doing now.' },
  { id: 'wellbeing', title: 'Feel more in control', helper: 'Energy, mood, sleep, stress and more.' },
];

export function QuickStart({ selectedGoal, onStart }: QuickStartProps) {
  const [goal, setGoal] = useState<UserGoal | null>(selectedGoal ?? null);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgb(var(--color-primary)/0.10)] mb-6">
            <Sparkles className="w-8 h-8 text-[rgb(var(--color-primary))]" />
          </div>
          <h1 className="mb-3">What brought you here today?</h1>
          <p className="text-base text-[rgb(var(--color-text-secondary))]">
            Start straight away. You can personalise everything later.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {options.map((opt) => {
            const active = goal === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setGoal(opt.id)}
                className={`w-full text-left rounded-2xl border p-4 transition-all ${
                  active
                    ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.06)]'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="font-medium mb-1">{opt.title}</div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">{opt.helper}</div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onStart(goal)}
          className="w-full py-4 rounded-2xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all duration-200 font-medium"
        >
          Start now
        </button>

        <div className="text-center mt-6">
          <button
            onClick={() => onStart(null)}
            className="text-sm text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"
          >
            I’m not sure yet
          </button>
        </div>
      </div>
    </div>
  );
}
