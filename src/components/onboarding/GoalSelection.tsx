import React from 'react';
import { Heart, Sunrise, Leaf, Sparkles, ChevronLeft } from 'lucide-react';
import type { UserGoal } from '../../types';

interface GoalSelectionProps {
  selectedGoal: UserGoal | null;
  onSelectGoal: (goal: UserGoal) => void;
  onBack: () => void;
}

const goals = [
  {
    id: 'cycle-health' as UserGoal,
    title: 'Cycle Health',
    description: 'Track and understand your menstrual cycle patterns',
    icon: Heart,
  },
  {
    id: 'perimenopause' as UserGoal,
    title: 'Perimenopause Support',
    description: 'Navigate hormonal changes with confidence',
    icon: Sunrise,
  },
  {
    id: 'post-contraception' as UserGoal,
    title: 'Post-Contraception',
    description: 'Reconnect with your natural cycle',
    icon: Leaf,
  },
  {
    id: 'wellbeing' as UserGoal,
    title: 'Wellbeing Optimization',
    description: 'Optimize energy, mood and overall health',
    icon: Sparkles,
  },
];

export function GoalSelection({ selectedGoal, onSelectGoal, onBack }: GoalSelectionProps) {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <div className="mb-12">
          <h1 className="mb-4">What brings you here?</h1>
          <p className="text-lg">
            This helps us personalize your experience and provide relevant insights
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const Icon = goal.icon;
            const isSelected = selectedGoal === goal.id;
            
            return (
              <button
                key={goal.id}
                onClick={() => onSelectGoal(goal.id)}
                className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                  isSelected
                    ? 'border-[rgb(var(--color-primary))] bg-[rgba(var(--color-primary),0.05)]'
                    : 'border-neutral-200 bg-white hover:border-[rgb(var(--color-primary-light))]'
                }`}
              >
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${
                    isSelected
                      ? 'bg-[rgb(var(--color-primary))]'
                      : 'bg-[rgba(var(--color-primary),0.1)]'
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${
                      isSelected ? 'text-white' : 'text-[rgb(var(--color-primary))]'
                    }`}
                  />
                </div>
                <h3 className="mb-2">{goal.title}</h3>
                <p className="text-sm">{goal.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}