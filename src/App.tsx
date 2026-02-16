import React, { useEffect, useMemo, useState } from 'react';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { DailyCheckIn } from './components/DailyCheckIn';
import { Dashboard } from './components/Dashboard';
import { Insights } from './components/Insights';
import { AIChat } from './components/AIChat';
import { Resources } from './components/Resources';
import { ProfileSettings } from './components/ProfileSettings';
import { CalendarView } from './components/CalendarView';
import { Navigation } from './components/Navigation';

import type { UserData } from './types';
import { APP_NAME, useUser, initSelfHealingStorage} from './lib/appStore';

const DEFAULT_USER: UserData = {
  name: '',
  goal: null,
  colorTheme: 'sage',
  onboardingComplete: false,
  cycleTrackingMode: 'cycle',
    showCycleBubble: true,
  useMockEve: true,
  eveLowCostMode: true,
  fertilityMode: false,
  autoStartPeriodFromBleeding: false,
  ovulationOverrideISOs: [],
  customSymptoms: [],
  enabledModules: [
    // Keep the app light on day 1. Users can turn on more in Profile.
    'energy',
    'sleep',
    'stress',
    'focus',
    'bloating',
    'flow',
  ],
  enabledInfluences: ['stressfulDay', 'lateNight', 'alcohol'],
  onboardingPresetApplied: false,
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [checkInDateISO, setCheckInDateISO] = useState<string | undefined>(undefined);
  const { user: userData, updateUser: setUserData } = useUser(DEFAULT_USER);

  // Best-effort request for persistent storage (helps on some browsers; harmless if unsupported)
  useEffect(() => {
    (async () => {
      try {
        const nav: any = navigator;
        if (nav?.storage?.persist) {
          await nav.storage.persist();
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const FORCE_ONBOARDING_KEY = 'eb_force_onboarding_preview';
  const [forceOnboarding, setForceOnboarding] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(FORCE_ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  });

  const clearForceOnboarding = () => {
    try {
      sessionStorage.removeItem(FORCE_ONBOARDING_KEY);
    } catch {
      // ignore
    }
    setForceOnboarding(false);
  };

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userData.colorTheme);
  }, [userData.colorTheme]);

  // Page title (nice on iOS Safari)
  useEffect(() => {
    document.title = `${APP_NAME}${currentScreen === 'dashboard' ? '' : ' • ' + currentScreen}`;
  }, [currentScreen]);

  // Ensure each screen loads from the top (SPA nav otherwise keeps prior scroll position)
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      // ignore
    }
  }, [currentScreen]);

    const navigateToCheckIn = (dateISO?: string) => {
    setCheckInDateISO(dateISO);
    setCurrentScreen('check-in');
  };
const handleOnboardingComplete = (data: { name: string; goal: UserData['goal']; colorTheme: UserData['colorTheme'] }) => {
    if (!data.goal) return;

    setUserData((prev) => {
      // Only apply goal-based defaults the FIRST time someone completes onboarding.
      // If they re-run onboarding later (preview) or change goal in Profile,
      // we do not auto-reset their settings.
      const shouldApplyPresets = !prev.onboardingPresetApplied && !prev.onboardingComplete;

      if (!shouldApplyPresets) {
        return {
          ...prev,
          name: data.name,
          goal: data.goal,
          colorTheme: data.colorTheme,
          onboardingComplete: true,
        };
      }

      // Goal-based defaults (lightweight, sensible starting point).
      // Note: we never enable BOTH energy + fatigue by default (fatigue can be turned on manually).
      const presetsByGoal: Record<NonNullable<UserData['goal']>, Partial<UserData>> = {
        'cycle-health': {
          cycleTrackingMode: 'cycle',
          showCycleBubble: true,
          fertilityMode: true,
          enabledModules: ['energy', 'sleep', 'stress', 'focus', 'bloating', 'cramps', 'flow'],
          enabledInfluences: ['sex', 'exercise', 'stressfulDay', 'lateNight', 'alcohol'],
        },
        'perimenopause': {
          cycleTrackingMode: 'cycle',
          showCycleBubble: true,
          fertilityMode: false,
          enabledModules: ['energy', 'sleep', 'stress', 'brainFog', 'hotFlushes', 'nightSweats', 'hairShedding', 'facialSpots'],
          enabledInfluences: ['stressfulDay', 'lateNight', 'alcohol', 'caffeine', 'medication'],
        },
        'post-contraception': {
          cycleTrackingMode: 'cycle',
          showCycleBubble: true,
          fertilityMode: true,
          enabledModules: ['energy', 'sleep', 'stress', 'focus', 'bloating', 'flow'],
          enabledInfluences: ['sex', 'stressfulDay', 'lateNight', 'alcohol'],
        },
        'wellbeing': {
          cycleTrackingMode: 'no-cycle',
          showCycleBubble: false,
          fertilityMode: false,
          enabledModules: ['energy', 'sleep', 'stress', 'focus', 'digestion', 'appetite'],
          enabledInfluences: ['stressfulDay', 'lateNight', 'alcohol', 'exercise', 'caffeine'],
        },
      };

      const preset = presetsByGoal[data.goal];

      return {
        ...prev,
        ...preset,
        name: data.name,
        goal: data.goal,
        colorTheme: data.colorTheme,
        onboardingComplete: true,
        onboardingPresetApplied: true,
      };
    });

    clearForceOnboarding();
    // Do-first: drop them straight into the check-in
    setCurrentScreen('check-in');
  };

  const main = useMemo(() => {
    if (!userData.onboardingComplete || forceOnboarding) {
      const showBack = forceOnboarding && userData.onboardingComplete;
      return (
        <div className="min-h-screen bg-neutral-50">
          {showBack && (
            <div className="px-6 pt-6">
              <button
                type="button"
                onClick={clearForceOnboarding}
                className="text-sm text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"
              >
                Back to app
              </button>
            </div>
          )}
          <OnboardingFlow
            initialName={userData.name}
            initialGoal={userData.goal}
            initialTheme={userData.colorTheme}
            onComplete={handleOnboardingComplete}
          />
        </div>
      );
    }

    switch (currentScreen) {
      case 'dashboard':
        return (
          <Dashboard userName={userData.name} userGoal={userData.goal} userData={userData} onNavigate={setCurrentScreen} onUpdateUserData={setUserData} onOpenCheckIn={(iso) => navigateToCheckIn(iso)} />
        );

      case 'check-in':
        return (
          <DailyCheckIn
            userData={userData}
            onUpdateUserData={setUserData}
            initialDateISO={checkInDateISO}
            onDone={() => {
              try { (document.activeElement as HTMLElement | null)?.blur(); } catch {}
              try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); }
              setCheckInDateISO(undefined);
              setCurrentScreen('dashboard');
            }}
            onNavigate={setCurrentScreen}
          />
        );

        case 'insights':
          return <Insights userData={userData} onOpenCheckIn={navigateToCheckIn} />;

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
            onPreviewOnboarding={() => {
              try {
                sessionStorage.setItem('eb_force_onboarding_preview', '1');
              } catch {
                // ignore
              }
              setForceOnboarding(true);
              setCurrentScreen('dashboard');
            }}
          />
        );


      case 'calendar':
        return <CalendarView userData={userData} onNavigate={setCurrentScreen} onOpenCheckIn={(iso) => navigateToCheckIn(iso)} onUpdateUser={setUserData} />;
      default:
        return (
          <Dashboard userName={userData.name} userGoal={userData.goal} userData={userData} onNavigate={setCurrentScreen} onUpdateUserData={setUserData} onOpenCheckIn={(iso) => navigateToCheckIn(iso)} />
        );
    }
  }, [currentScreen, userData, setUserData]);

  return (
    <div className="min-h-screen">
      {userData.onboardingComplete && !forceOnboarding && (
        <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      )}
      <main className={userData.onboardingComplete && !forceOnboarding ? 'pb-20 md:pb-0 md:pl-64' : ''}>{main}</main>
    </div>
  );
}