import React, { useEffect, useMemo, useState } from 'react';
import { QuickStart } from './components/onboarding/QuickStart';
import { DailyCheckIn } from './components/DailyCheckIn';
import { Dashboard } from './components/Dashboard';
import { Insights } from './components/Insights';
import { AIChat } from './components/AIChat';
import { Resources } from './components/Resources';
import { ProfileSettings } from './components/ProfileSettings';
import { CalendarView } from './components/CalendarView';
import { Navigation } from './components/Navigation';

import type { UserData } from './types';
import { APP_NAME, useUser } from './lib/appStore';

const DEFAULT_USER: UserData = {
  name: '',
  goal: null,
  colorTheme: 'sage',
  onboardingComplete: false,
  cycleTrackingMode: 'cycle',
    showCycleBubble: true,
  useMockEve: true,
  eveLowCostMode: true,
enabledModules: [
    'energy',
    'sleep',
    'stress',
    'focus',
    'bloating',
    'pain',
    'fatigue',
    'brainFog',
    'nightSweats',
    'hairShedding',
    'facialSpots',
    'cysts',
    'flow',
  ],
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const { user: userData, updateUser: setUserData } = useUser(DEFAULT_USER);

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userData.colorTheme);
  }, [userData.colorTheme]);

  // Page title (nice on iOS Safari)
  useEffect(() => {
    document.title = `${APP_NAME}${currentScreen === 'dashboard' ? '' : ' • ' + currentScreen}`;
  }, [currentScreen]);

  const startOnboarding = (goal: UserData['goal']) => {
    setUserData((prev) => ({
      ...prev,
      goal,
      onboardingComplete: true,
    }));
    setCurrentScreen('dashboard');
  };

  const main = useMemo(() => {
    if (!userData.onboardingComplete) {
      return <QuickStart selectedGoal={userData.goal} onStart={startOnboarding} />;
    }

    switch (currentScreen) {
      case 'dashboard':
        return (
          <Dashboard
            userName={userData.name}
            userGoal={userData.goal}
            userData={userData}
            onNavigate={setCurrentScreen}
          />
        );

      case 'check-in':
        return (
          <DailyCheckIn
            userData={userData}
            onUpdateUserData={setUserData}
            onDone={() => setCurrentScreen('dashboard')}
            onNavigate={setCurrentScreen}
          />
        );

      case 'insights':
        return <Insights userData={userData} />;

      case 'chat':
        return <AIChat userName={userData.name || 'there'} userData={userData} />;

      case 'resources':
        return <Resources />;

      case 'profile':
        return (
          <ProfileSettings
            userData={userData}
            onUpdateTheme={(theme) => setUserData((prev) => ({ ...prev, colorTheme: theme }))}
            onUpdateUserData={setUserData}
          />
        );


      case 'calendar':
        return <CalendarView userData={userData} onNavigate={setCurrentScreen} />;
      default:
        return (
          <Dashboard
            userName={userData.name}
            userGoal={userData.goal}
            userData={userData}
            onNavigate={setCurrentScreen}
          />
        );
    }
  }, [currentScreen, userData, setUserData]);

  return (
    <div className="min-h-screen">
      {userData.onboardingComplete && (
        <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      )}
      <main className={userData.onboardingComplete ? 'pb-20 md:pb-0 md:pl-64' : ''}>{main}</main>
    </div>
  );
}
