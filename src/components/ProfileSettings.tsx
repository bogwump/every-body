import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Upload,
  ArrowLeft,
  Camera,
  Heart as HeartIcon,
  Leaf as LeafIcon,
  Sparkles as SparklesIcon,
  Moon as MoonIcon,
  Sun as SunIcon,
  X,
} from 'lucide-react';
import { makeBackupFile, shareOrDownloadBackup, parseBackupJson, looksLikeInsightsExport, importBackupFile } from '../lib/backup';
import type { ColorTheme, SymptomKey, SymptomKind, UserData, InfluenceKey } from '../types';
import { kindLabel } from '../lib/symptomMeta';
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

import appLogo from '../assets/everybody-logo-256.png';

interface ProfileSettingsProps {
  userData: UserData;
  onUpdateTheme: (theme: ColorTheme) => void;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  /** Dev/testing helper: lets you re-run onboarding without wiping saved data */
  onPreviewOnboarding?: () => void;
}

const themes = [
  { id: 'sage' as ColorTheme, name: 'Sage', description: 'Calm and grounding', colors: ['rgb(132, 155, 130)', 'rgb(169, 189, 167)', 'rgb(203, 186, 159)'] },
  { id: 'lavender' as ColorTheme, name: 'Lavender', description: 'Gentle and soothing', colors: ['rgb(156, 136, 177)', 'rgb(190, 175, 207)', 'rgb(217, 186, 203)'] },
  { id: 'ocean' as ColorTheme, name: 'Ocean', description: 'Clear and refreshing', colors: ['rgb(115, 155, 175)', 'rgb(158, 191, 207)', 'rgb(186, 216, 217)'] },
  { id: 'terracotta' as ColorTheme, name: 'Terracotta', description: 'Warm and nurturing', colors: ['rgb(190, 130, 110)', 'rgb(215, 170, 155)', 'rgb(225, 195, 170)'] },
];

const moduleMeta: Array<{ key: SymptomKey; label: string; description: string }> = [
  // Energy + sleep
  { key: 'energy', label: 'Energy', description: 'How much fuel you have in the tank' },
  { key: 'motivation', label: 'Motivation', description: 'Drive and willingness to do things' },
  { key: 'sleep', label: 'Sleep', description: 'Quality of sleep, not just hours' },
  { key: 'insomnia', label: 'Insomnia', description: 'Trouble falling or staying asleep' },
  { key: 'fatigue', label: 'Fatigue', description: 'Heavy tiredness or drained feeling (optional)' },
  { key: 'restlessLegs', label: 'Restless legs', description: 'Urge to move your legs or uncomfortable leg sensations at night' },

  // Mind
  { key: 'stress', label: 'Stress', description: 'Mental load and tension' },
  { key: 'anxiety', label: 'Anxiety', description: 'Worry, unease, or a tight chest feeling' },
  { key: 'irritability', label: 'Irritability', description: 'Short fuse, snappy, easily overwhelmed' },
  { key: 'focus', label: 'Focus', description: 'Concentration and mental sharpness' },
  { key: 'brainFog', label: 'Brain fog', description: 'Foggy thinking, forgetfulness' },

  // Body & pain
  { key: 'headache', label: 'Headache', description: 'Head pain or pressure today' },
  { key: 'migraine', label: 'Migraine', description: 'Migraine-type headache (light/sound sensitivity etc)' },
  { key: 'cramps', label: 'Cramps', description: 'Pelvic cramps or period-type pain' },
  { key: 'jointPain', label: 'Joint pain', description: 'Aches or stiffness in joints' },
  { key: 'backPain', label: 'Back pain', description: 'Upper or lower back pain' },
  { key: 'breastTenderness', label: 'Breast tenderness', description: 'Soreness or sensitivity' },
  { key: 'dizziness', label: 'Dizziness', description: 'Light-headed, off balance, spaced out' },
  { key: 'pain', label: 'General aches', description: 'Overall aches or pain (optional)' },

  // Digestion
  { key: 'bloating', label: 'Bloating', description: 'Digestive discomfort and swelling' },
  { key: 'digestion', label: 'Digestion', description: 'How your tummy feels overall today' },
  { key: 'acidReflux', label: 'Acid reflux', description: 'Heartburn or reflux symptoms' },
  { key: 'nausea', label: 'Nausea', description: 'Queasy, unsettled stomach' },
  { key: 'constipation', label: 'Constipation', description: 'Hard stools or difficulty going' },
  { key: 'diarrhoea', label: 'Diarrhoea', description: 'Loose stools or urgency' },
  { key: 'appetite', label: 'Appetite', description: 'Hunger, cravings, or low appetite' },

  // Skin & hair
  { key: 'hairShedding', label: 'Hair shedding', description: 'Shedding or thinning today' },
  { key: 'facialSpots', label: 'Facial spots', description: 'Breakouts or skin changes' },
  { key: 'cysts', label: 'Cysts', description: 'Cystic spots or tenderness' },
  { key: 'skinDryness', label: 'Skin dryness', description: 'Dry, itchy, or sensitive skin' },

  // Hormones
  { key: 'hotFlushes', label: 'Hot flushes', description: 'Sudden heat, flushing, or sweating' },
  { key: 'nightSweats', label: 'Night sweats', description: 'Sweats or overheating at night' },
  { key: 'libido', label: 'Libido', description: 'Sex drive or interest' },

  // Cycle (optional)
  { key: 'flow', label: 'Bleeding / spotting', description: 'Optional, only if it’s relevant to you' },

  // Optional extras
];



const moduleGroups: Array<{ id: string; title: string; keys: SymptomKey[] }> = [
  { id: 'energySleep', title: 'Energy & sleep', keys: ['energy', 'motivation', 'sleep', 'insomnia', 'fatigue'] },
  { id: 'mind', title: 'Mind', keys: ['stress', 'anxiety', 'irritability', 'focus', 'brainFog'] },
  { id: 'bodyPain', title: 'Body & pain', keys: ['headache', 'migraine', 'cramps', 'jointPain', 'backPain', 'breastTenderness', 'dizziness', 'restlessLegs', 'pain'] },
  { id: 'digestion', title: 'Digestion', keys: ['bloating', 'digestion', 'acidReflux', 'nausea', 'constipation', 'diarrhoea', 'appetite'] },
  { id: 'skinHair', title: 'Skin & hair', keys: ['hairShedding', 'facialSpots', 'cysts', 'skinDryness'] },
  { id: 'hormones', title: 'Hormones', keys: ['hotFlushes', 'nightSweats', 'libido', 'flow'] },];



const influenceMeta: Array<{ key: InfluenceKey; label: string; description: string }> = [
  { key: 'sex', label: 'Intimacy', description: 'Logged privately. Helps spot patterns with mood, confidence, bleeding and more.' },
  { key: 'exercise', label: 'Workout', description: 'Any workout or brisk activity.' },
  { key: 'travel', label: 'Travel', description: 'Travel, long drives, or time zone changes.' },
  { key: 'illness', label: 'Illness', description: 'Cold, flu, infection, or feeling unwell.' },
  { key: 'alcohol', label: 'Alcohol', description: 'More than your usual.' },
  { key: 'caffeine', label: 'Caffeine', description: 'More caffeine than usual.' },
  { key: 'lateNight', label: 'Late night', description: 'Later bedtime or disrupted routine.' },
  { key: 'stressfulDay', label: 'Stressful day', description: 'High stress or emotional strain.' },
  { key: 'medication', label: 'Medication', description: 'Any medication today (yes/no). Useful for pattern spotting.' },
  { key: 'socialising', label: 'Socialising', description: 'More social than usual (or a big event).' },
  { key: 'lowHydration', label: 'Low hydration', description: 'Less water than usual.' },
];

const STOCK_AVATARS: Array<{ id: string; label: string }> = [
  { id: 'moon', label: 'Moon' },
  { id: 'spark', label: 'Star' },
  { id: 'sun', label: 'Sun' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'flower', label: 'Flower' },
  { id: 'heart', label: 'Heart' },
];


function FivePetalFlowerIcon({ className }: { className?: string }) {
  // Clean 5-petal outline flower. No shading, matches the onboarding icon vibe.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g>
        <ellipse cx="12" cy="6.4" rx="3" ry="4" />
        <ellipse cx="17" cy="9" rx="3" ry="4" transform="rotate(72 17 9)" />
        <ellipse cx="16" cy="15.6" rx="3" ry="4" transform="rotate(144 16 15.6)" />
        <ellipse cx="8" cy="15.6" rx="3" ry="4" transform="rotate(216 8 15.6)" />
        <ellipse cx="7" cy="9" rx="3" ry="4" transform="rotate(288 7 9)" />
      </g>
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

function StockAvatar({ id, className }: { id: string; className?: string }) {
  const cls = className ?? 'w-10 h-10';
  switch (id) {
    case 'moon':
      return <MoonIcon className={cls} />;
    case 'spark':
      return <SparklesIcon className={cls} />;
    case 'sun':
      return <SunIcon className={cls} />;
    case 'leaf':
      return <LeafIcon className={cls} />;
    case 'flower':
      return <FivePetalFlowerIcon className={cls} />;
    case 'heart':
      return <HeartIcon className={cls} />;
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

function cloudStatusLabel(userData: UserData): string {
  const st = cloudStatus(userData);
  if (st.kind === 'off') return 'Off';
  if (st.kind === 'not_configured') return 'Needs Supabase keys in your .env';
  return 'Ready (sign in to link your data)';
}

export function ProfileSettings({ userData, onUpdateTheme, onUpdateUserData, onPreviewOnboarding }: ProfileSettingsProps) {
  const [view, setView] = useState<'main' | 'personal'>('main');

  // iOS Safari often preserves scroll position when navigating within an SPA.
  // When opening a sub-view (like Personal information), ensure the top content is visible.
  useEffect(() => {
    try {
      setTimeout(() => window.scrollTo(0, 0), 0);
    } catch {
      // ignore
    }
  }, [view]);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showLogoutPanel, setShowLogoutPanel] = useState(false);

  // Simple feedback form (Help centre)
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  const [moduleSearch, setModuleSearch] = useState<string>('');
  const [customSymptomText, setCustomSymptomText] = useState<string>('');
  const [customSymptomKind, setCustomSymptomKind] = useState<SymptomKind>('other');
  const [customSymptomError, setCustomSymptomError] = useState<string>('');

  const [lifestyleOpen, setLifestyleOpen] = useState(false);

  const setEnabledModules = (next: SymptomKey[]) => {
    onUpdateUserData((prev) => ({ ...prev, enabledModules: next }));
  };

  const setEnabledInfluences = (next: InfluenceKey[]) => {
    onUpdateUserData((prev) => ({ ...prev, enabledInfluences: next }));
  };

  // Cycle behaviour
  const autoStartPeriodFromBleeding = !!(userData as any).autoStartPeriodFromBleeding;
  const autoStartPeriodFromBleedingLabel = autoStartPeriodFromBleeding
    ? 'On (a new bleed will start a period automatically)'
    : "Off (we will ask if it is a new period or just spotting)";


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

  const exportBackup = async () => {
    const file = makeBackupFile();
    await shareOrDownloadBackup(file);
  };

  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const importBackup = async (file: File) => {
    const raw = await file.text();
    const parsed = parseBackupJson(raw);
    if (!parsed) {
  alert(
    looksLikeInsightsExport(raw)
      ? `That file is an Insights export. It cannot be restored as a full backup.

To restore, use a file named everybody-backup-YYYY-MM-DD.json.`
      : `That backup file does not look valid.

To restore, choose a file named everybody-backup-YYYY-MM-DD.json.`
  );
  return;
}
    importBackupFile(parsed);
    // Hard reload to ensure all pages pick up the restored state cleanly.
    window.location.reload();
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
        { icon: Lock, label: 'Privacy & Security', onClick: () => setShowPrivacyPanel(!showPrivacyPanel) },
        { icon: Bell, label: 'Notifications', onClick: () => setShowNotificationsPanel(!showNotificationsPanel) },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: Palette, label: 'Theme', onClick: () => setShowThemeSelector(!showThemeSelector) },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Centre', onClick: () => setShowHelpPanel(!showHelpPanel) },
        { icon: LogOut, label: 'Log out', onClick: () => setShowLogoutPanel(!showLogoutPanel) },
      ],
    },
  ];

  return view === 'personal' ? (
<div className="eb-page">
        <div className="eb-page-inner">
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
                        <div
                          className={
                            selected
                              ? 'text-[rgb(var(--color-primary))]'
                              : 'text-[rgb(var(--color-primary))] opacity-60'
                          }
                        >
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
  ) : (
<div className="eb-page">
      <div className="eb-page-inner">
        <div className="mb-8">
          <h1 className="mb-2">Profile & Settings</h1>
          <p className="text-[rgb(var(--color-text-secondary))]">Make it personal</p>
        </div>

        {/* Profile hero card */}
        <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-6 mb-6 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between gap-4">
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

            {/* App icon (helps brand recognition on mobile) */}
            <div className="eb-appicon w-12 h-12 p-1 shrink-0" aria-label="EveryBody">
              <img src={appLogo} alt="EveryBody" className="w-full h-full" />
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
        <div className="eb-card mb-6">
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
              className={`shrink-0 w-12 h-6 rounded-full transition-all ${
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
              className={`shrink-0 w-12 h-6 rounded-full transition-all ${
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

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-medium mb-1">Auto-start periods from bleeding</p>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {autoStartPeriodFromBleedingLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onUpdateUserData((prev) => ({
                  ...prev,
                  autoStartPeriodFromBleeding: !prev.autoStartPeriodFromBleeding,
                }))
              }
              className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                autoStartPeriodFromBleeding ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  autoStartPeriodFromBleeding ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        
{/* What to track */}
                <div className="eb-card mb-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h3 className="mb-1">What you track</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Choose what shows up in your daily check-in. Nothing is required, including bleeding.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-[rgb(var(--color-text-secondary))]">Enabled</p>
              <p className="font-semibold">{userData.enabledModules.length}/{moduleMeta.length}</p>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border border-neutral-200 overflow-hidden group">
            <summary className="list-none cursor-pointer select-none p-4 flex items-center justify-between hover:bg-neutral-50">
              <span className="font-medium">Customise symptoms</span>
              <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
            </summary>

            <div className="p-4 pt-0">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
                Turning a symptom off hides it from your check-in. Your past data stays saved, so Insights can still use it when you turn it back on.
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <input
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    placeholder="Search symptoms..."
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                  {moduleSearch ? (
                    <button
                      type="button"
                      onClick={() => setModuleSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setEnabledModules(moduleMeta.map((m) => m.key));
                    }}
                    className="px-3 py-2 border rounded-lg"
                  >
                    Enable all
                  </button>
                  <button
                    onClick={() => setEnabledModules([])}
                    className="px-3 py-2 border rounded-lg"
                  >
                    Clear all
                  </button>
                </div>
              </div>


              {/* Custom symptoms */}
              <div className="mt-4 mb-5 rounded-2xl border border-neutral-200 bg-white/60 p-4">
                <p className="font-medium mb-1">Add your own symptom</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">
                  Freeform labels like “Jaw pain”, “Sugar cravings”, “Tinnitus”. You can turn them on and off any time.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    value={customSymptomText}
                    onChange={(e) => {
                      setCustomSymptomText(e.target.value);
                      setCustomSymptomError('');
                    }}
                    placeholder="Type a symptom name..."
                    className="w-full sm:flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.35)]"
                  />

                  <select
                    value={customSymptomKind}
                    onChange={(e) => setCustomSymptomKind(e.target.value as SymptomKind)}
                    className="w-full sm:w-44 rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.35)]"
                    aria-label="What kind of symptom is this"
                    title="What kind of symptom is this"
                  >
                    {(
                      [
                        'other',
                        'state',
                        'behaviour',
                        'physio',
                        'hormonal',
                      ] as SymptomKind[]
                    ).map((k) => (
                      <option key={k} value={k}>
                        {kindLabel(k)}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const label = customSymptomText.trim();
                      if (!label) {
                        setCustomSymptomError('Type a symptom name first.');
                        return;
                      }
                      if (label.length > 28) {
                        setCustomSymptomError('Keep it short (28 characters max).');
                        return;
                      }
                      onUpdateUserData((prev) => {
                        const existing = (prev.customSymptoms ?? []);
                        const exists = existing.some((s) => s.label.toLowerCase() === label.toLowerCase());
                        if (exists) return prev;
                        const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
                        return {
                          ...prev,
                          customSymptoms: [
                            ...existing,
                            { id, label, enabled: true, kind: customSymptomKind },
                          ],
                        };
                      });
                      setCustomSymptomText('');
                      setCustomSymptomError('');
                    }}
                    className="text-sm px-4 py-2 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:opacity-95 transition-colors whitespace-nowrap"
                  >
                    Add symptom
                  </button>
                </div>

                {customSymptomError && (
                  <div className="mt-2 text-sm text-[rgb(170,60,60)]">{customSymptomError}</div>
                )}

                {!!(userData.customSymptoms?.length) && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-text-secondary))]">Your custom symptoms</p>
                    <div className="space-y-2">
                      {(userData.customSymptoms ?? []).map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{s.label}</div>
                            <div className="text-xs text-[rgb(var(--color-text-secondary))]">{kindLabel(s.kind)}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateUserData((prev) => ({
                                  ...prev,
                                  customSymptoms: (prev.customSymptoms ?? []).map((x) =>
                                    x.id === s.id ? { ...x, enabled: !x.enabled } : x
                                  ),
                                }))
                              }
                              className={`shrink-0 w-12 h-6 rounded-full transition-all ${s.enabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                              aria-label={s.enabled ? `Disable ${s.label}` : `Enable ${s.label}`}
                            >
                              <div
                                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                  s.enabled ? 'translate-x-6' : 'translate-x-0.5'
                                }`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdateUserData((prev) => ({
                                  ...prev,
                                  customSymptoms: (prev.customSymptoms ?? []).filter((x) => x.id !== s.id),
                                }))
                              }
                              className="text-sm px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {moduleGroups.map((group) => {
                  const query = moduleSearch.trim().toLowerCase();
                  const items = group.keys
                    .map((k) => moduleMeta.find((m) => m.key === k))
                    .filter(Boolean)
                    .filter((m) => {
                      if (!query) return true;
                      const hay = `${m!.label} ${m!.description}`.toLowerCase();
                      return hay.includes(query);
                    }) as Array<(typeof moduleMeta)[number]>;

                  if (items.length === 0) return null;

                  return (
                    <details key={group.id} className="rounded-2xl border border-neutral-200 overflow-hidden group">
                      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-neutral-50">
                        <span className="font-medium">{group.title}</span>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="px-4 pb-3">
                        <div className="space-y-3 pt-1">
                          {items.map((m) => {
                            const enabled = userData.enabledModules.includes(m.key);
                            return (
                              <div key={m.key} className="flex items-center justify-between gap-4 py-2 border-b border-neutral-100 last:border-b-0">
                                <div className="min-w-0">
                                  <p className="font-medium mb-1">{m.label}</p>
                                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">{m.description}</p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateUserData((prev) => ({
                                      ...prev,
                                      enabledModules: toggleInList(prev.enabledModules, m.key),
                                    }))
                                  }
                                  className={`shrink-0 w-12 h-6 rounded-full transition-all ${enabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                                  aria-label={enabled ? `Disable ${m.label}` : `Enable ${m.label}`}
                                >
                                  <div
                                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                      enabled ? 'translate-x-6' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                          {group.id === 'energySleep' ? (
                            <>
                              <div className="flex items-center justify-between gap-4 py-2 border-b border-neutral-100">
                                <div className="min-w-0">
                                  <p className="font-medium mb-1">Sleep details</p>
                                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                                    Optional extra sleep questions (collapsed by default in check-in).
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateUserData((prev) => {
                                      const next = !prev.sleepDetailsEnabled;
                                      return {
                                        ...prev,
                                        sleepDetailsEnabled: next,
                                        // If someone turns on sleep details, also show the Sleep section in Insights by default.
                                        sleepInsightsEnabled: next ? true : prev.sleepInsightsEnabled,
                                      };
                                    })
                                  }
                                  className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                    userData.sleepDetailsEnabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                  }`}
                                  aria-label="Toggle sleep details"
                                >
                                  <span
                                    className={`block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                                      userData.sleepDetailsEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-4 py-2 border-b border-neutral-100 last:border-b-0">
                                <div className="min-w-0">
                                  <p className="font-medium mb-1">Sleep insights</p>
                                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                                    Adds a Sleep section to Insights, so your sleep patterns don’t get lost.
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateUserData((prev) => ({
                                      ...prev,
                                      sleepInsightsEnabled: !prev.sleepInsightsEnabled,
                                    }))
                                  }
                                  className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                    userData.sleepInsightsEnabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                  }`}
                                  aria-label="Toggle sleep insights"
                                >
                                  <span
                                    className={`block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                                      userData.sleepInsightsEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            </>
                          ) : null}

                        </div>
                      </div>
                    </details>


                  );
                })}

                {/* iOS Safari can be picky with <details>/<summary> click targets, so we use a simple toggle button here. */}
                <div className="mt-3 rounded-2xl border border-neutral-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLifestyleOpen((v) => !v)}
                    className="w-full p-4 flex items-center justify-between hover:bg-neutral-50"
                  >
                    <span className="font-medium">Lifestyle and influences</span>
                    <ChevronRight
                      className={`w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform ${
                        lifestyleOpen ? 'rotate-90' : ''
                      }`}
                    />
                  </button>

                  {lifestyleOpen ? (
                    <div className="p-4 pt-0">
                      <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">
                        This controls what shows up under “Other influences” in your daily check-in, so it stays short and relevant.
                      </p>

                      <div className="flex gap-2 justify-end mb-3">
                        <button
                          type="button"
                          onClick={() => setEnabledInfluences(influenceMeta.map((m) => m.key))}
                          className="px-3 py-2 border rounded-lg"
                        >
                          Enable all
                        </button>
                        <button type="button" onClick={() => setEnabledInfluences([])} className="px-3 py-2 border rounded-lg">
                          Clear all
                        </button>
                      </div>

                      <div className="space-y-3">
                        {influenceMeta.map((m) => {
                          const enabled = (userData.enabledInfluences ?? []).includes(m.key);
                          return (
                            <div
                              key={m.key}
                              className="flex items-center justify-between gap-4 py-2 border-b border-neutral-100 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <p className="font-medium mb-1">{m.label}</p>
                                <p className="text-sm text-[rgb(var(--color-text-secondary))]">{m.description}</p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateUserData((prev) => ({
                                    ...prev,
                                    enabledInfluences: toggleInList((prev.enabledInfluences ?? []) as InfluenceKey[], m.key),
                                  }))
                                }
                                className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                  enabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                }`}
                                aria-label={enabled ? `Disable ${m.label}` : `Enable ${m.label}`}
                              >
                                <div
                                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                    enabled ? 'translate-x-6' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>


                {moduleSearch.trim() && (
                  (() => {
                    const query = moduleSearch.trim().toLowerCase();
                    const anyMatch = moduleMeta.some((m) => (`${m.label} ${m.description}`.toLowerCase().includes(query)));
                    if (anyMatch) return null;
                    return (
                      <p className="text-sm text-[rgb(var(--color-text-secondary))] px-1">
                        No matches. Try a different search.
                      </p>
                    );
                  })()
                )}
              </div>
            </div>
          </details>
        </div>

<div className="eb-card mb-6">
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
                  className={`shrink-0 w-12 h-6 rounded-full transition-all ${notifications[row.key] ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
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
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[rgb(var(--color-primary)/0.22)]">
              {section.items.map((item, index) => {
                const Icon = item.icon;

                if (item.label === 'Theme') {
                  return (
                    <details
                      key="theme"
                      className="border-b border-neutral-100 last:border-b-0 group"
                      open={showThemeSelector}
                      onToggle={(e) => setShowThemeSelector((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="list-none cursor-pointer select-none w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                          <span>Theme</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="px-4 pb-4 pt-0">
                        <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">
                          Select colours that feel right for you. You can change this anytime.
                        </p>

                        {/*
                          Responsive bounding for desktop resizing:
                          keep 2 columns until medium screens so the cards don't get squeezed and misalign.
                        */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {themes.map((t) => {
                            const selected = userData.colorTheme === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  onUpdateTheme(t.id);
                                  // keep the panel open so it feels like a picker, not a navigation
                                  setShowThemeSelector(true);
                                }}
                                className={[
                                  'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                                  selected
                                    ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.06)]'
                                    : 'border-neutral-200 hover:bg-neutral-50',
                                ].join(' ')}
                                aria-pressed={selected}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="text-sm font-medium block leading-tight">{t.name}</span>
                                    <span className="text-xs text-[rgb(var(--color-text-secondary))] block mt-0.5">
                                      {t.description}
                                    </span>
                                  </div>
                                  <span className="flex items-center gap-1.5">
                                    {t.colors.map((c) => (
                                      <span
                                        key={c}
                                        className="w-3.5 h-3.5 rounded-full border border-neutral-200"
                                        style={{ background: c }}
                                      />
                                    ))}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  );
                }
                if (item.label === 'Privacy & Security') {
                  return (
                    <details
                      key="privacy"
                      className="border-b border-neutral-100 last:border-b-0 group"
                      open={showPrivacyPanel}
                      onToggle={(e) => setShowPrivacyPanel((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="list-none cursor-pointer select-none w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                          <span>Privacy &amp; security</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="p-4 pt-0">
                        <div className="eb-card eb-inset p-4">
                          <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                            Your check-ins are stored on this device. Cloud sync and account features can be added later,
                            but you can already export your data anytime.
                          </p>

                              <input
                                ref={backupInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  void importBackup(file);
                                  // reset so importing the same file twice still triggers
                                  (e.currentTarget as HTMLInputElement).value = '';
                                }}
                              />

                              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                <button
                                  type="button"
                                  onClick={() => backupInputRef.current?.click()}
                                  className="eb-btn eb-btn-secondary inline-flex items-center gap-2"
                                >
                                  <Upload className="w-4 h-4" />
                                  Restore from backup
                                </button>
                            <button
                              type="button"
                              onClick={exportBackup}
                              className="eb-btn eb-btn-secondary inline-flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Create full backup
                            </button>
                            <button
                              type="button"
                              onClick={exportCsv}
                              className="eb-btn eb-btn-secondary inline-flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Export CSV
                            </button>
                          </div>
                              <p className="mt-2 text-sm opacity-80">
                                <strong>Backups</strong> restore your full app data (check-ins, settings and anything else stored on this device).
                                Insights exports are separate and can’t be restored here.
                              </p>

                              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
                                <div className="min-w-0">
                                  <p className="font-medium mb-1">Fitbit import</p>
                                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                                    Ready for later. Switch this on when Fitbit support is available for sleep and workouts.
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateUserData((prev) => ({
                                      ...prev,
                                      fitbitEnabled: !prev.fitbitEnabled,
                                    }))
                                  }
                                  className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                    userData.fitbitEnabled ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                  }`}
                                  aria-label="Toggle Fitbit import"
                                >
                                  <span
                                    className={`block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                                      userData.fitbitEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>

                          <div className="mt-4 rounded-xl border border-neutral-200 p-3 bg-white">
                            <p className="text-sm font-medium mb-1">Coming soon</p>
                            <ul className="text-sm text-[rgb(var(--color-text-secondary))] list-disc pl-5 space-y-1">
                              <li>Passcode / Face ID lock</li>
                                                            <li>Delete my data (with confirmation)</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                }

                if (item.label === 'Notifications') {
                  return (
                    <details
                      key="notifications"
                      className="border-b border-neutral-100 last:border-b-0 group"
                      open={showNotificationsPanel}
                      onToggle={(e) => setShowNotificationsPanel((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="list-none cursor-pointer select-none w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                          <span>Notifications</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="p-4 pt-0">
                        <div className="eb-card eb-inset p-4">
                          <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">
                            These switches are ready now. Actual phone notifications can be wired up later when we add push
                            support.
                          </p>

                          <div className="space-y-3">
                            <label className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">Daily reminder</span>
                              <button
                                type="button"
                                onClick={() => setNotifications((p) => ({ ...p, dailyReminder: !p.dailyReminder }))}
                                className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                  notifications.dailyReminder ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                }`}
                                aria-pressed={notifications.dailyReminder}
                              >
                                <div
                                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                    notifications.dailyReminder ? 'translate-x-6' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </label>

                            <label className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">Insights nudges</span>
                              <button
                                type="button"
                                onClick={() => setNotifications((p) => ({ ...p, insights: !p.insights }))}
                                className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                  notifications.insights ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                }`}
                                aria-pressed={notifications.insights}
                              >
                                <div
                                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                    notifications.insights ? 'translate-x-6' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </label>

                            <label className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">Cycle predictions</span>
                              <button
                                type="button"
                                onClick={() => setNotifications((p) => ({ ...p, periodPrediction: !p.periodPrediction }))}
                                className={`shrink-0 w-12 h-6 rounded-full transition-all ${
                                  notifications.periodPrediction ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'
                                }`}
                                aria-pressed={notifications.periodPrediction}
                              >
                                <div
                                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                                    notifications.periodPrediction ? 'translate-x-6' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </label>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                }

                if (item.label === 'Help Centre') {
                  return (
                    <details
                      key="help"
                      className="border-b border-neutral-100 last:border-b-0 group"
                      open={showHelpPanel}
                      onToggle={(e) => setShowHelpPanel((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="list-none cursor-pointer select-none w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                          <span>Help centre</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="p-4 pt-0">
                        <div className="eb-card eb-inset p-4">
                          <div className="space-y-2 text-sm text-[rgb(var(--color-text-secondary))]">
                            <p><span className="font-medium text-[rgb(var(--color-text-primary))]">What is this?</span> A simple daily symptom tracker with optional cycle predictions.</p>
                            <p><span className="font-medium text-[rgb(var(--color-text-primary))]">How do insights work?</span> You need a few days of check-ins before patterns appear. More data = better signals.</p>
                            <p><span className="font-medium text-[rgb(var(--color-text-primary))]">Something broken?</span> This is a work-in-progress build. We can add a “Report a bug” flow once hosted.</p>
                          </div>

                          {/* Feedback / contact */}
                          <div className="mt-4 rounded-2xl border border-neutral-200 p-4 bg-white">
                            <p className="font-medium mb-1">Contact / feedback</p>
                            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">
                              Send a quick note. Your message goes straight to the app maker.
                            </p>

                            <div className="space-y-2">
                              <input
                                className="eb-input"
                                placeholder="Subject"
                                value={feedbackSubject}
                                onChange={(e) => setFeedbackSubject(e.target.value)}
                              />
                              <textarea
                                className="eb-input"
                                placeholder="What’s on your mind?"
                                rows={4}
                                value={feedbackMessage}
                                onChange={(e) => setFeedbackMessage(e.target.value)}
                              />
                              <input
                                className="eb-input"
                                placeholder="Your email (optional, if you want a reply)"
                                value={feedbackEmail}
                                onChange={(e) => setFeedbackEmail(e.target.value)}
                              />

                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="eb-btn"
                                  disabled={feedbackBusy || !feedbackMessage.trim()}
                                  onClick={async () => {
                                    setFeedbackStatus(null);
                                    setFeedbackBusy(true);
                                    try {
                                      const res = await fetch('/api/feedback', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          subject: feedbackSubject,
                                          message: feedbackMessage,
                                          email: feedbackEmail,
                                          // Helpful context for debugging
                                          meta: {
                                            ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                                            ts: new Date().toISOString(),
                                          },
                                        }),
                                      });
                                      const json = await res.json().catch(() => ({}));
                                      if (!res.ok) throw new Error(json?.error || 'Could not send');
                                      setFeedbackStatus('Sent. Thank you!');
                                      setFeedbackSubject('');
                                      setFeedbackMessage('');
                                      setFeedbackEmail('');
                                    } catch (err: any) {
                                      setFeedbackStatus(err?.message || 'Could not send right now');
                                    } finally {
                                      setFeedbackBusy(false);
                                    }
                                  }}
                                >
                                  {feedbackBusy ? 'Sending…' : 'Send'}
                                </button>
                                {feedbackStatus ? (
                                  <div className="text-sm text-[rgb(var(--color-text-secondary))]">{feedbackStatus}</div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          
                          <div className="mt-4 rounded-2xl border border-neutral-200 p-4 bg-white">
                            <p className="font-medium mb-1">Cloud sync (optional)</p>
                            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">
                              Local-first by default. Enable this only if you want backup and cross-device syncing. (Beta)
                            </p>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-medium mb-1">Enable cloud sync</p>
                                <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                                  {cloudStatusLabel(userData)}
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
                                className={`shrink-0 w-12 h-6 rounded-full transition-all ${
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
                                    Add <span className="font-medium">VITE_SUPABASE_URL</span> and{' '}
                                    <span className="font-medium">VITE_SUPABASE_ANON_KEY</span> to your{' '}
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
                                            const next = await cloudPullAndApply(userData);
                                            onUpdateUserData(next as any);
                                            setCloudMessage('Downloaded latest cloud data to this device.');
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
                                            setCloudMessage(err?.message || 'Could not sign out');
                                          } finally {
                                            setCloudBusy(false);
                                          }
                                        }}
                                      >
                                        Sign out
                                      </button>
                                    </div>

                                    {cloudMessage && (
                                      <div className="text-sm text-[rgb(var(--color-text-secondary))]">{cloudMessage}</div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
<div className="mt-4 rounded-xl border border-neutral-200 p-3 bg-white">
                            <p className="text-sm font-medium mb-1">Coming soon</p>
                            <ul className="text-sm text-[rgb(var(--color-text-secondary))] list-disc pl-5 space-y-1">
                              <li>Searchable FAQ</li>
                              <li>Contact / feedback form</li>
                              <li>Troubleshooting for sync and notifications</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                }

                if (item.label === 'Log out') {
                  return (
                    <details
                      key="logout"
                      className="border-b border-neutral-100 last:border-b-0 group"
                      open={showLogoutPanel}
                      onToggle={(e) => setShowLogoutPanel((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="list-none cursor-pointer select-none w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-[rgb(var(--color-text-secondary))]" />
                          <span>Log out</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] transition-transform group-open:rotate-90" />
                      </summary>

                      <div className="p-4 pt-0">
                        <div className="eb-card eb-inset p-4">
                          <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                            Log out is only relevant once you are signed in to cloud sync. For now, this will just sign out of the cloud session if one exists.
                          </p>

                          <div className="mt-4 flex gap-2">
                            <button
                              type="button"
                              className="eb-btn eb-btn-secondary inline-flex items-center gap-2"
                              onClick={async () => {
                                setCloudBusy(true);
                                setCloudMessage('');
                                try {
                                  await cloudSignOut();
                                  setCloudMessage('Signed out.');
                                } catch (e: any) {
                                  setCloudMessage(e?.message ?? 'Could not sign out.');
                                } finally {
                                  setCloudBusy(false);
                                }
                              }}
                              disabled={cloudBusy}
                            >
                              <LogOut className="w-4 h-4" />
                              Sign out
                            </button>
                          </div>

                          {cloudMessage ? (
                            <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">{cloudMessage}</p>
                          ) : null}
                        </div>
                      </div>
                    </details>
                  );
                }

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

        {/* Testing */}
        
        {/* Eve testing */}
        <div className="eb-card mb-6">
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
              disabled
              onClick={() => onUpdateUserData((prev) => ({ ...prev, useMockEve: !prev.useMockEve }))}
              className="px-3 py-2 rounded-xl border border-[rgb(var(--color-border))] text-sm opacity-50 cursor-not-allowed"
            >
              {'Locked'}
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
              disabled
              onClick={() => onUpdateUserData((prev) => ({ ...prev, eveLowCostMode: !prev.eveLowCostMode }))}
              className="px-3 py-2 rounded-xl border border-[rgb(var(--color-border))] text-sm opacity-50 cursor-not-allowed"
            >
              {'Locked'}
            </button>
          </div>
        </div>

        {onPreviewOnboarding && (
          <div className="eb-card mb-6">
            <h3 className="mb-2">Testing</h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-4">Want to re-run onboarding without losing your saved data?</p>
            <button type="button" onClick={onPreviewOnboarding} className="w-full eb-btn-primary">
              Preview onboarding
            </button>
          </div>
        )}
</div>
    </div>
  );
}
