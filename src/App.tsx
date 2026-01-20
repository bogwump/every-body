import React, { useEffect, useMemo, useState } from 'react';
import { QuickStart } from './components/onboarding/QuickStart';
import { DailyCheckIn } from './components/DailyCheckIn';
import { Dashboard } from './components/Dashboard';
import { Insights } from './components/Insights';
import { AIChat } from './components/AIChat';
import { Resources } from './components/Resources';
import { ProfileSettings } from './components/ProfileSettings';
import { Navigation } from './components/Navigation';

import type { ColorTheme, UserData, UserGoal } from './types';
import { USER_KEY, loadFromStorage, saveToStorage } from './lib/storage';

const DEFAULT_USER: UserData = {
  name: '',
  goal: null,
  colorTheme: 'sage',
  onboardingComplete: false,
  cycleTrackingMode: 'cycle',
  enabledModules: ['energy', 'sleep', 'stress', 'focus', 'bloating', 'pain', 'flow'],
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [userData, setUserData] = useState<UserData>(() => loadFromStorage<UserData>(USER_KEY, DEFAULT_USER));

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userData.colorTheme);
  }, [userData.colorTheme]);

  // Persist user profile
  useEffect(() => {
    saveToStorage(USER_KEY, userData);
  }, [userData]);

  const onboardingComplete = userData.onboardingComplete;

  const handleQuickStart = (goal: UserGoal | null) => {
    setUserData((prev) => ({ ...prev, goal, onboardingComplete: true }));
    // Do-first: drop them straight into the check-in
    setCurrentScreen('check-in');
  };

  const main = useMemo(() => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard userName={userData.name} userGoal={userData.goal} onNavigate={setCurrentScreen} />;
      case 'check-in':
        return (
          <DailyCheckIn
            userData={userData}
            onUpdateUserData={setUserData}
            onDone={() => setCurrentScreen('dashboard')}
          />
        );
      case 'insights':
        return <Insights userData={userData} />;
      case 'chat':
        return <AIChat userName={userData.name || 'there'} userData={userData} />;
      case 'resources':
        return <Resources userGoal={userData.goal} />;
      case 'profile':
        return (
          <ProfileSettings
            userData={userData}
            onUpdateTheme={(theme) => setUserData((prev) => ({ ...prev, colorTheme: theme as ColorTheme }))}
            onUpdateUserData={setUserData}
          />
        );
      default:
        return <Dashboard userName={userData.name} userGoal={userData.goal} onNavigate={setCurrentScreen} />;
    }
  }, [currentScreen, userData]);

  if (!onboardingComplete) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <QuickStart selectedGoal={userData.goal} onStart={handleQuickStart} />
      </div>
    );
  }

  return (
    <>
      <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="md:ml-64 min-h-screen bg-neutral-50 pb-20 md:pb-0 md:pl-8">{main}</div>
    </>
  );
}
