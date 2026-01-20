import React, { useEffect, useMemo, useState } from 'react';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { DailyCheckIn } from './components/DailyCheckIn';
import { Dashboard } from './components/Dashboard';
import { Insights } from './components/Insights';
import { AIChat } from './components/AIChat';
import { Resources } from './components/Resources';
import { ProfileSettings } from './components/ProfileSettings';
import { Navigation } from './components/Navigation';

import type { UserData } from './types';
import { APP_NAME, useUser } from './lib/appStore';

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
  const { user: userData, updateUser: setUserData } = useUser(DEFAULT_USER);

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userData.colorTheme);
  }, [userData.colorTheme]);

  // Page title (nice in iOS Safari PWA contexts)
  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  const onboardingComplete = userData.onboardingComplete;

  const main = useMemo(() => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard userName={userData.name} userGoal={userData.goal} userData={userData} onNavigate={setCurrentScreen} />;
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
            onUpdateTheme={(theme) => setUserData((prev) => ({ ...prev, colorTheme: theme }))}
            onUpdateUserData={setUserData}
          />
        );
      default:
        return <Dashboard userName={userData.name} userGoal={userData.goal} userData={userData} onNavigate={setCurrentScreen} />;
    }
  }, [currentScreen, userData]);

  const shouldShowOnboarding =
    !onboardingComplete || !userData.name.trim() || userData.goal == null;

  if (shouldShowOnboarding) {
    return (
      <div className="min-h-screen eb-surface">
        <OnboardingFlow
          initialName={userData.name}
          initialGoal={userData.goal}
          initialTheme={userData.colorTheme}
          onComplete={({ name, goal, colorTheme }) => {
            setUserData((prev) => ({
              ...prev,
              name,
              goal,
              colorTheme,
              onboardingComplete: true,
            }));
            setCurrentScreen('check-in');
          }}
        />
      </div>
    );
  }

  return (
    <>
      <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="md:ml-64 min-h-screen eb-surface pb-20 md:pb-0 md:pl-8">
        {main}
      </div>
    </>
  );
}
