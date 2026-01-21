import React, { useMemo, useState } from 'react';
import { User, Palette, Bell, Lock, HelpCircle, LogOut, ChevronRight, Check, Download } from 'lucide-react';
import type { CheckInEntry, ColorTheme, SymptomKey, UserData } from '../types';
import { downloadTextFile } from '../lib/storage';
import { useEntries } from '../lib/appStore';
import { calculateStreak } from '../lib/analytics';

interface ProfileSettingsProps {
  userData: UserData;
  onUpdateTheme: (theme: ColorTheme) => void;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
}

const themes = [
  {
    id: 'sage' as ColorTheme,
    name: 'Sage',
    colors: ['rgb(132, 155, 130)', 'rgb(169, 189, 167)', 'rgb(203, 186, 159)'],
  },
  {
    id: 'lavender' as ColorTheme,
    name: 'Lavender',
    colors: ['rgb(156, 136, 177)', 'rgb(190, 175, 207)', 'rgb(217, 186, 203)'],
  },
  {
    id: 'ocean' as ColorTheme,
    name: 'Ocean',
    colors: ['rgb(115, 155, 175)', 'rgb(158, 191, 207)', 'rgb(186, 216, 217)'],
  },
  {
    id: 'terracotta' as ColorTheme,
    name: 'Terracotta',
    colors: ['rgb(190, 130, 110)', 'rgb(215, 170, 155)', 'rgb(225, 195, 170)'],
  },
];

const moduleMeta: Array<{ key: SymptomKey; label: string; description: string }> = [
  { key: 'energy', label: 'Energy', description: 'How much fuel you have in the tank' },
  { key: 'sleep', label: 'Sleep', description: 'Quality of sleep, not just hours' },
  { key: 'stress', label: 'Stress', description: 'Mental load and tension' },
  { key: 'focus', label: 'Clarity', description: 'Brain fog vs clear thinking' },
  { key: 'bloating', label: 'Bloating', description: 'Digestive discomfort and swelling' },
  { key: 'pain', label: 'Pain', description: 'Cramps, aches, headaches, etc' },
  { key: 'hairShedding', label: 'Hair shedding', description: 'Shedding or thinning today' },
  { key: 'facialSpots', label: 'Facial spots', description: 'Breakouts or skin changes' },
  { key: 'cysts', label: 'Cysts', description: 'Cystic spots or tenderness' },
  { key: 'brainFog', label: 'Brain fog', description: 'Foggy thinking, forgetfulness' },
  { key: 'fatigue', label: 'Fatigue', description: 'Heavy tiredness or drained feeling' },
  { key: 'nightSweats', label: 'Night sweats', description: 'Sweats or overheating at night' },
  { key: 'flow', label: 'Bleeding / spotting', description: 'Optional, only if it’s relevant to you' },
];

function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function ProfileSettings({ userData, onUpdateTheme, onUpdateUserData }: ProfileSettingsProps) {
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [notifications, setNotifications] = useState({
    dailyReminder: true,
    insights: true,
    periodPrediction: true,
  });

  const { entries } = useEntries();
  const daysTracked = entries.length;
  const streak = calculateStreak(entries);

  const insightsUnlocked = useMemo(() => {
    // keep it honest but encouraging
    if (daysTracked < 3) return 0;
    if (daysTracked < 7) return 1;
    if (daysTracked < 14) return 3;
    return 6;
  }, [daysTracked]);

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Personal Information', onClick: () => {} },
        { icon: Lock, label: 'Privacy & Security', onClick: () => {} },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: Palette, label: 'Theme', onClick: () => setShowThemeSelector(!showThemeSelector) },
        { icon: Bell, label: 'Notifications', onClick: () => {} },
      ],
    },
    {
      title: 'Support',
      items: [{ icon: HelpCircle, label: 'Help Center', onClick: () => {} }],
    },
  ];

  const exportJson = () => {
    const payload = {
      user: userData,
      entries,
      exportedAt: new Date().toISOString(),
    };
    downloadTextFile('everybody-data.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  const exportCsv = () => {
    const header = ['date', 'mood', 'energy', 'sleep', 'stress', 'focus', 'pain', 'bloating', 'flow', 'notes'];
    const rows = entries
      .slice()
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      .map((e) => {
        const v = e.values;
        const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
        return [
          e.dateISO,
          e.mood ?? '',
          v.energy ?? '',
          v.sleep ?? '',
          v.stress ?? '',
          v.focus ?? '',
          v.pain ?? '',
          v.bloating ?? '',
          v.flow ?? '',
          esc(e.notes ?? ''),
        ].join(',');
      });
    downloadTextFile('everybody-data.csv', [header.join(','), ...rows].join('\n'), 'text/csv');
  };

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Profile & Settings</h1>
          <p>Make it feel like yours</p>
        </div>

        {/* Profile Card */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] rounded-2xl p-6 mb-6 text-[rgb(var(--color-text))] shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[rgba(255,255,255,0.45)] border border-[rgba(0,0,0,0.12)] flex items-center justify-center text-2xl font-medium">
              {(userData.name?.trim()?.charAt(0) || '?').toUpperCase()}
            </div>
            <div>
              <h2 className="mb-1">{userData.name?.trim() || 'Friend'}</h2>
              <p className="text-sm text-[rgba(0,0,0,0.85)]">
                {userData.goal === 'cycle-health' && 'Tracking cycle health'}
                {userData.goal === 'perimenopause' && 'Perimenopause support'}
                {userData.goal === 'post-contraception' && 'Post-contraception journey'}
                {userData.goal === 'wellbeing' && 'Wellbeing support'}
                {!userData.goal && 'Just exploring'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[rgba(0,0,0,0.12)]">
            <div>
              <p className="text-xs opacity-80 mb-1">Days tracked</p>
              <p className="text-xl font-medium">{daysTracked}</p>
            </div>
            <div>
              <p className="text-xs opacity-80 mb-1">Current streak</p>
              <p className="text-xl font-medium">{streak}</p>
            </div>
            <div>
              <p className="text-xs opacity-80 mb-1">Insights</p>
              <p className="text-xl font-medium">{insightsUnlocked}</p>
            </div>
          </div>
        </div>

        {/* Cycle mode (override) */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">Cycle tracking</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
            Symptoms and cycle are not mutually exclusive. You can track symptoms with no periods (coil, menopause, hysterectomy, etc). Turn cycle tracking on only if you want phase-based insights.
          </p>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium mb-1">Use cycle phases</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {userData.cycleTrackingMode === 'cycle'
                  ? 'On (phase insights available when you log bleeding/spotting)'
                  : 'Off (symptom-only mode)'}
              </p>
            </div>
            <button
              onClick={() =>
                onUpdateUserData((prev) => ({
                  ...prev,
                  cycleTrackingMode: prev.cycleTrackingMode === 'cycle' ? 'no-cycle' : 'cycle',
                  // if user turns cycle off, do not remove flow module automatically
                }))
              }
              className={`w-12 h-6 rounded-full transition-all ${
                userData.cycleTrackingMode === 'cycle' ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
              }`}
              type="button"
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  userData.cycleTrackingMode === 'cycle' ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* What to track */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">What you track</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
            Turn modules on or off. Nothing is required, including bleeding.
          </p>
          <div className="space-y-4">
            {moduleMeta.map((m) => {
              const enabled = userData.enabledModules.includes(m.key);
              return (
                <div key={m.key} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium mb-1">{m.label}</p>
                    <p className="text-sm text-[rgb(var(--color-text-secondary))]">{m.description}</p>
                  </div>
                  <button
                    onClick={() => onUpdateUserData((prev) => ({ ...prev, enabledModules: toggleInList(prev.enabledModules, m.key) }))}
                    className={`w-12 h-6 rounded-full transition-all ${enabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                    type="button"
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Theme Selector */}
        {showThemeSelector && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-[rgb(var(--color-primary))]">
            <h3 className="mb-4">Choose your theme</h3>
            <div className="grid grid-cols-2 gap-4">
              {themes.map((theme) => {
                const isSelected = userData.colorTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => onUpdateTheme(theme.id)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] bg-opacity-5'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                    type="button"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex gap-2">
                        {theme.colors.map((color, i) => (
                          <div key={i} className="w-6 h-6 rounded-full" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-[rgb(var(--color-primary))]" />}
                    </div>
                    <p className="text-sm font-medium text-left">{theme.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notifications */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-4">Notifications</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Daily check-in reminder</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Get reminded to log your symptoms</p>
              </div>
              <button
                onClick={() => setNotifications({ ...notifications, dailyReminder: !notifications.dailyReminder })}
                className={`w-12 h-6 rounded-full transition-all ${
                  notifications.dailyReminder ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                }`}
                type="button"
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    notifications.dailyReminder ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Insights</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Receive gentle nudges when patterns appear</p>
              </div>
              <button
                onClick={() => setNotifications({ ...notifications, insights: !notifications.insights })}
                className={`w-12 h-6 rounded-full transition-all ${
                  notifications.insights ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                }`}
                type="button"
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${notifications.insights ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Period predictions</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Only relevant if you track a cycle</p>
              </div>
              <button
                onClick={() => setNotifications({ ...notifications, periodPrediction: !notifications.periodPrediction })}
                className={`w-12 h-6 rounded-full transition-all ${
                  notifications.periodPrediction ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                }`}
                type="button"
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${notifications.periodPrediction ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Settings Sections */}
        {settingsSections.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="mb-3 px-2">{section.title}</h3>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={index}
                    onClick={item.onClick}
                    className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-b-0"
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Data Export */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 mb-6 border border-[rgb(var(--color-accent))] border-opacity-30">
          <h3 className="mb-2">Export your data</h3>
          <p className="text-sm mb-4 text-[rgb(var(--color-text-secondary))]">Download your check-ins (CSV or JSON)</p>
          <div className="flex gap-3">
            <button
              onClick={exportCsv}
              className="px-4 py-3 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 transition-all font-medium flex items-center gap-2"
              type="button"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={exportJson}
              className="px-4 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium flex items-center gap-2"
              type="button"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
          </div>
        </div>

        {/* Logout */}
        <button className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl text-red-600 hover:bg-red-50 transition-all" type="button">
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}
