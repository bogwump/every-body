import React, { useEffect, useState } from 'react';
import type { ColorTheme, UserGoal } from '../../types';
import { WelcomeScreen } from './WelcomeScreen';
import { GoalSelection } from './GoalSelection';
import { ColorThemeSelection } from './ColorThemeSelection';

type Step = 'welcome' | 'goal' | 'theme';

interface OnboardingFlowProps {
  initialName: string;
  initialGoal: UserGoal | null;
  initialTheme: ColorTheme;
  onComplete: (data: { name: string; goal: UserGoal; colorTheme: ColorTheme }) => void;
}

export function OnboardingFlow({
  initialName,
  initialGoal,
  initialTheme,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(initialName || '');
  const [goal, setGoal] = useState<UserGoal | null>(initialGoal ?? null);
  const [theme, setTheme] = useState<ColorTheme>(initialTheme);

  // Live preview theme during onboarding
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        onContinue={(n) => {
          setName(n);
          setStep('goal');
        }}
      />
    );
  }

  if (step === 'goal') {
    return (
      <GoalSelection
        selectedGoal={goal}
        onSelectGoal={(g) => {
          setGoal(g);
          setStep('theme');
        }}
        onBack={() => setStep('welcome')}
      />
    );
  }

  // theme step
  return (
    <ColorThemeSelection
      selectedTheme={theme}
      onSelectTheme={setTheme}
      onBack={() => setStep('goal')}
      onComplete={() => {
        if (!goal) return;
        onComplete({ name: name.trim(), goal, colorTheme: theme });
      }}
    />
  );
}
