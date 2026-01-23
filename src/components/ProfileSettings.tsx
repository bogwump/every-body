import React, { useMemo, useRef, useState } from 'react';
import {
  User,
  Palette,
  Bell,
  Lock,
  HelpCircle,
  LogOut,
  ChevronRight,
  Check,
  Download,
  ArrowLeft,
  Camera,
} from 'lucide-react';
import type { ColorTheme, SymptomKey, UserData } from '../types';
import { downloadTextFile } from '../lib/storage';
import {
  cloudPullAndApply,
  cloudPush,
  cloudSignInEmail,
  cloudSignOut,
  cloudStatus,
} from '../lib/cloudSync';
import { useEntries } from '../lib/appStore';
import { calculateStreak } from '../lib/analytics';

interface ProfileSettingsProps {
  userData: UserData;
  onUpdateTheme: (theme: ColorTheme) => void;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  /** Dev/testing helper: lets you re-run onboarding without wiping saved data */
  onPreviewOnboarding?: () => void;
}

const themes = [
  { id: 'sage' as ColorTheme, name: 'Sage', colors: ['rgb(132, 155, 130)', 'rgb(169, 189, 167)', 'rgb(203, 186, 159)'] },
  { id: 'lavender' as ColorTheme, name: 'Lavender', colors: ['rgb(156, 136, 177)', 'rgb(190, 175, 207)', 'rgb(217, 186, 203)'] },
  { id: 'ocean' as ColorTheme, name: 'Ocean', colors: ['rgb(115, 155, 175)', 'rgb(158, 191, 207)', 'rgb(186, 216, 217)'] },
  { id: 'terracotta' as ColorTheme, name: 'Terracotta', colors: ['rgb(190, 130, 110)', 'rgb(215, 170, 155)', 'rgb(225, 195, 170)'] },
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

const STOCK_AVATARS: Array<{ id: string; label: string }> = [
  { id: 'moon', label: 'Moon' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'spark', label: 'Spark' },
  { id: 'drop', label: 'Drop' },
];

function StockAvatar({ id, className }: { id: string; className?: string }) {
  const cls = className ?? 'w-10 h-10';
  switch (id) {
    case 'moon':
      return (
        <svg viewBox="0 0 48 48" className={cls} fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2" opacity="0.9" />
          <circle cx="30" cy="18" r="14" fill="currentColor" opacity="0.22" />
        </svg>
      );
    case 'leaf':
      return (
        <svg viewBox="0 0 48 48" className={cls} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 30c12-18 26-18 24-18-2 0-6 1-10 5-6 6-7 15-14 20"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path d="M20 24c4 0 8 2 12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case 'spark':
      return (
        <svg viewBox="0 0 48 48" className={cls} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M24 10l2.6 8.3L35 21l-8.4 2.7L24 32l-2.6-8.3L13 21l8.4-2.7L24 10z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path
            d="M14 34l1.4 4.2L20 40l-4.6 1.5L14 46l-1.4-4.5L8 40l4.6-1.8L14 34z"
            fill="currentColor"
            opacity="0.18"
          />
        </svg>
      );
    case 'drop':
      return (
        <svg viewBox="0 0 48 48" className={cls} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M24 10c6 8 10 13 10 19a10 10 0 1 1-20 0c0-6 4-11 10-19z"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path d="M18.5 30.5c1.5 3 4 4.5 7.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
    default:
      return null;
  }
}

function initialsFromName(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function ProfileSettings({ userData, onUpdateTheme, onUpdateUserData, onPreviewOnboarding }: ProfileSettingsProps) {
  const [view, setView] = useState<'main' | 'personal'>('main');
  const [showThemeSelector, setShowThemeSelector] = useState(false);

  // Personal info editing
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState<string>(userData.name || '');
  const [draftAvatarDataUrl, setDraftAvatarDataUrl] = useState<string | undefined>((userData as any).avatarDataUrl);
  const [draftAvatarStockId, setDraftAvatarStockId] = useState<string | undefined>((userData as any).avatarStockId);

  const openPersonal = () => {
    setDraftName(userData.name || '');
    setDraftAvatarDataUrl((userData as any).avatarDataUrl);
    setDraftAvatarStockId((userData as any).avatarStockId);
    setView('personal');
  };

  const savePersonal = () => {
    onUpdateUserData((prev) => ({
      ...(prev as any),
      name: draftName,
      avatarDataUrl: draftAvatarDataUrl,
      avatarStockId: draftAvatarStockId,
    }));
    setView('main');
  };

  const { entries } = useEntries();
  const daysTracked = entries.length;
  const streak = calculateStreak(entries);

  const insightsUnlocked = useMemo(() => {
    if (daysTracked < 3) return 0;
    if (daysTracked < 7) return 1;
    if (daysTracked < 14) return 3;
    return 6;
  }, [daysTracked]);

  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string>('');

  const [notifications, setNotifications] = useState({
    dailyReminder: true,
    insights: true,
    periodPrediction: true,
  });

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

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Personal Information', onClick: () => openPersonal() },
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
      items: [{ icon: HelpCircle, label: 'Help Centre', onClick: () => {} }],
    },
  ];

  if (view === 'personal') {
    return (
      <div className="eb-page">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('main')}
              className="w-10 h-10 rounded-full border border-[rgb(var(--color-border))] flex items-center justify-center bg-white shadow-sm"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="mb-1">Personal information</h1>
              <p className="text-[rgb(var(--color-text-secondary))]">Update your name and photo</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full bg-[rgb(var(--color-primary)/0.14)] flex items-center justify-center overflow-hidden border border-[rgb(var(--color-border))]">
                {draftAvatarDataUrl ? (
                  <img src={draftAvatarDataUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : draftAvatarStockId ? (
                  <div className="text-[rgb(var(--color-primary))]">
                    <StockAvatar id={draftAvatarStockId} className="w-12 h-12" />
                  </div>
                ) : (
                  <div className="text-[rgb(var(--color-primary))] text-2xl font-semibold">{initialsFromName(draftName)}</div>
                )}
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  className="eb-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Your name"
                />
                <p className="text-xs text-[rgb(var(--color-text-secondary))] mt-2">This is what you’ll see across the app.</p>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium mb-2">Profile photo</label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = typeof reader.result === 'string' ? reader.result : undefined;
                    setDraftAvatarDataUrl(result);
                    setDraftAvatarStockId(undefined);
                  };
                  reader.readAsDataURL(file);
                }}
              />

              <div className="flex flex-wrap gap-2">
                <button type="button" className="eb-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="w-4 h-4" />
                  Upload photo
                </button>
                <button
                  type="button"
                  className="eb-btn-secondary"
                  onClick={() => {
                    setDraftAvatarDataUrl(undefined);
                    setDraftAvatarStockId(undefined);
                  }}
                >
                  Use initials
                </button>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Or choose an icon</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {STOCK_AVATARS.map((a) => {
                    const selected = draftAvatarStockId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setDraftAvatarStockId(a.id);
                          setDraftAvatarDataUrl(undefined);
                        }}
                        className={`w-14 h-14 rounded-2xl border flex items-center justify-center bg-white shadow-sm transition ${
                          selected ? 'border-[rgb(var(--color-primary))]' : 'border-[rgb(var(--color-border))]'
                        }`}
                        aria-label={a.label}
                        title={a.label}
                      >
                        <div className={selected ? 'text-[rgb(var(--color-primary))]' : 'text-[rgb(var(--color-text-secondary))]'}>
                          <StockAvatar id={a.id} className="w-8 h-8" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-2">
                <button type="button" className="eb-btn-secondary" onClick={() => setView('main')}>
                  Cancel
                </button>
                <button type="button" className="eb-btn-primary" onClick={savePersonal}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="eb-page">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="mb-2">Profile & Settings</h1>
          <p className="text-[rgb(var(--color-text-secondary))]">Make it personal</p>
        </div>

        {/* Profile hero card */}
        <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-6 mb-6 shadow-lg overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[rgba(255,255,255,0.22)] border border-[rgba(255,255,255,0.28)] flex items-center justify-center overflow-hidden">
              {(userData as any).avatarDataUrl ? (
                <img src={(userData as any).avatarDataUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (userData as any).avatarStockId ? (
                <div className="text-white/90">
                  <StockAvatar id={(userData as any).avatarStockId} className="w-10 h-10" />
                </div>
              ) : (
                <div className="text-white text-2xl font-semibold">{initialsFromName(userData.name)}</div>
              )}
            </div>

            <div>
              <h2 className="mb-1 text-white">{userData.name?.trim() || 'Friend'}</h2>
              <p className="text-sm text-white/80">
                {userData.goal === 'cycle-health' && 'Tracking cycle health'}
                {userData.goal === 'perimenopause' && 'Perimenopause support'}
                {userData.goal === 'post-contraception' && 'Post-contraception journey'}
                {userData.goal === 'wellbeing' && 'Wellbeing support'}
                {!userData.goal && 'Just exploring'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[rgba(255,255,255,0.22)]">
            <div>
              <p className="text-xs text-white/80 mb-1">Days tracked</p>
              <p className="text-xl font-medium text-white">{daysTracked}</p>
            </div>
            <div>
              <p className="text-xs text-white/80 mb-1">Current streak</p>
              <p className="text-xl font-medium text-white">{streak}</p>
            </div>
            <div>
              <p className="text-xs text-white/80 mb-1">Insights</p>
              <p className="text-xl font-medium text-white">{insightsUnlocked}</p>
            </div>
          </div>
        </div>

        {/* Cycle tracking */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">Cycle tracking</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
            Symptoms and cycle are not mutually exclusive. You can track symptoms with no periods (coil, menopause, hysterectomy, etc).
            Turn cycle tracking on only if you want phase-based insights.
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
              type="button"
              onClick={() =>
                onUpdateUserData((prev) => ({
                  ...prev,
                  cycleTrackingMode: prev.cycleTrackingMode === 'cycle' ? 'no-cycle' : 'cycle',
                }))
              }
              className={`w-12 h-6 rounded-full transition-all ${
                userData.cycleTrackingMode === 'cycle' ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  userData.cycleTrackingMode === 'cycle' ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-medium mb-1">Fertility mode</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {userData.fertilityMode ? 'On (shows fertile window shading and a discreet sex log)' : 'Off'}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onUpdateUserData((prev) => ({
                  ...prev,
                  fertilityMode: !prev.fertilityMode,
                }))
              }
              className={`w-12 h-6 rounded-full transition-all ${
                userData.fertilityMode ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  userData.fertilityMode ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Cloud sync (optional) */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">Cloud sync (optional)</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
            Local-first by default. Turn this on only if you want backup and cross-device syncing. (Beta)
          </p>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium mb-1">Enable cloud sync</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {(() => {
                  const st = cloudStatus(userData);
                  if (st.kind === 'off') return 'Off';
                  if (st.kind === 'not_configured') return 'Needs Supabase keys in your .env';
                  return 'Ready (sign in to link your data)';
                })()}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onUpdateUserData((prev) => ({
                  ...prev,
                  cloudSyncEnabled: !prev.cloudSyncEnabled,
                  cloudProvider: 'supabase',
                }))
              }
              className={`w-12 h-6 rounded-full transition-all ${
                userData.cloudSyncEnabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  userData.cloudSyncEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {userData.cloudSyncEnabled && (
            <div className="mt-4 space-y-3">
              {cloudStatus(userData).kind === 'not_configured' ? (
                <div className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4 bg-neutral-50 text-sm text-[rgb(var(--color-text-secondary))]">
                  Add <span className="font-medium">VITE_SUPABASE_URL</span> and <span className="font-medium">VITE_SUPABASE_ANON_KEY</span> to your{' '}
                  <span className="font-medium">.env</span>, then restart the dev server.
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="eb-input"
                      placeholder="Email for magic link sign-in"
                      value={cloudEmail}
                      onChange={(e) => setCloudEmail(e.target.value)}
                    />
                    <button
                      type="button"
                      className="eb-btn-secondary"
                      disabled={cloudBusy}
                      onClick={async () => {
                        try {
                          setCloudBusy(true);
                          setCloudMessage('');
                          await cloudSignInEmail(cloudEmail);
                          setCloudMessage('Magic link sent. Open your email on this device and click the link, then come back here.');
                        } catch (err: any) {
                          setCloudMessage(err?.message || 'Could not start sign-in');
                        } finally {
                          setCloudBusy(false);
                        }
                      }}
                    >
                      Send magic link
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="eb-btn-secondary"
                      disabled={cloudBusy}
                      onClick={async () => {
                        try {
                          setCloudBusy(true);
                          setCloudMessage('');
                          await cloudPush(userData);
                          setCloudMessage('Uploaded your current data to cloud.');
                        } catch (err: any) {
                          setCloudMessage(err?.message || 'Sync failed');
                        } finally {
                          setCloudBusy(false);
                        }
                      }}
                    >
                      Upload now
                    </button>

                    <button
                      type="button"
                      className="eb-btn-secondary"
                      disabled={cloudBusy}
                      onClick={async () => {
                        try {
                          setCloudBusy(true);
                          setCloudMessage('');
                          const changed = await cloudPullAndApply(userData);
                          setCloudMessage(
                            changed ? 'Downloaded cloud data to this device. Refreshing now...' : 'No cloud snapshot found yet.'
                          );
                          if (changed) window.location.reload();
                        } catch (err: any) {
                          setCloudMessage(err?.message || 'Sync failed');
                        } finally {
                          setCloudBusy(false);
                        }
                      }}
                    >
                      Download now
                    </button>

                    <button
                      type="button"
                      className="eb-btn-secondary"
                      disabled={cloudBusy}
                      onClick={async () => {
                        try {
                          setCloudBusy(true);
                          setCloudMessage('');
                          await cloudSignOut();
                          setCloudMessage('Signed out.');
                        } catch (err: any) {
                          setCloudMessage(err?.message || 'Sign out failed');
                        } finally {
                          setCloudBusy(false);
                        }
                      }}
                    >
                      Sign out
                    </button>
                  </div>

                  {cloudMessage && <div className="text-sm text-[rgb(var(--color-text-secondary))]">{cloudMessage}</div>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Eve testing */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">Eve</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">Settings for testing and cost control.</p>

          <div className="flex items-center justify-between py-3 border-t border-[rgb(var(--color-border))]">
            <div>
              <p className="font-medium mb-1">Mock Eve (testing)</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {userData.useMockEve ? 'On (no API calls, free to test)' : 'Off (uses OpenAI API)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateUserData((prev) => ({ ...prev, useMockEve: !prev.useMockEve }))}
              className="px-3 py-2 rounded-xl border border-[rgb(var(--color-border))] text-sm"
            >
              {userData.useMockEve ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-[rgb(var(--color-border))]">
            <div>
              <p className="font-medium mb-1">Low-cost mode</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {userData.eveLowCostMode ? 'On (shorter context, shorter replies)' : 'Off'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateUserData((prev) => ({ ...prev, eveLowCostMode: !prev.eveLowCostMode }))}
              className="px-3 py-2 rounded-xl border border-[rgb(var(--color-border))] text-sm"
            >
              {userData.eveLowCostMode ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        </div>

        {/* What to track */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="mb-2">What you track</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">Turn modules on or off. Nothing is required, including bleeding.</p>
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
                    type="button"
                    onClick={() => onUpdateUserData((prev) => ({ ...prev, enabledModules: toggleInList(prev.enabledModules, m.key) }))}
                    className={`w-12 h-6 rounded-full transition-all ${enabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Theme selector */}
        {showThemeSelector && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-[rgb(var(--color-primary))]">
            <h3 className="mb-4">Choose your theme</h3>
            <div className="grid grid-cols-2 gap-4">
              {themes.map((theme) => {
                const isSelected = userData.colorTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onUpdateTheme(theme.id)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isSelected ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.06)]' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
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
            {(
              [
                {
                  key: 'dailyReminder' as const,
                  title: 'Daily check-in reminder',
                  desc: 'Get reminded to log your symptoms',
                },
                {
                  key: 'insights' as const,
                  title: 'Insights',
                  desc: 'Receive gentle nudges when patterns appear',
                },
                {
                  key: 'periodPrediction' as const,
                  title: 'Period predictions',
                  desc: 'Only relevant if you track a cycle',
                },
              ]
            ).map((row) => (
              <div key={row.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium mb-1">{row.title}</p>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">{row.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifications((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                  className={`w-12 h-6 rounded-full transition-all ${notifications[row.key] ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      notifications[row.key] ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Settings list */}
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

        {/* Export */}
        <div className="bg-[rgb(var(--color-accent)/0.16)] rounded-2xl p-6 mb-6 border border-[rgb(var(--color-accent)/0.22)]">
          <h3 className="mb-2">Export your data</h3>
          <p className="text-sm mb-4 text-[rgb(var(--color-text-secondary))]">Download your check-ins (CSV or JSON)</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-3 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 transition-all font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="px-4 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
          </div>
        </div>

        {/* Testing */}
        {onPreviewOnboarding && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-neutral-100">
            <h3 className="mb-2">Testing</h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">Want to re-run onboarding without losing your saved data?</p>
            <button type="button" onClick={onPreviewOnboarding} className="w-full eb-btn-primary">
              Preview onboarding
            </button>
          </div>
        )}

        <button className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl text-red-600 hover:bg-red-50 transition-all" type="button">
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}
