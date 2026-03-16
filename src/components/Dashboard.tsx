import React, { useMemo, useRef, useState } from 'react';
import { Calendar, TrendingUp, Sparkles, ArrowRight, ChevronRight, Lightbulb, Upload, History as HistoryIcon, Settings2, Droplets, FlaskConical } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DashboardMetric, SymptomKey, UserData, UserGoal } from '../types';
import { useEntries, useExperiment } from '../lib/appStore';
import { buildHomepageHeroModel, computeCycleStats, estimatePhaseByFlow, filterByDays, isoToday, sortByDateAsc } from '../lib/analytics';
import { isoFromDateLocal } from '../lib/date';
import { getDailyTip } from '../lib/tips';
import { importBackupFile, parseBackupJson, looksLikeInsightsExport } from '../lib/backup';
import { getArchivedMomentSnapshots, getHighestPriorityMoment } from '../lib/companionMoments';
import { getRhythmPhaseState } from '../lib/phaseChange';
import { generateMoments } from '../lib/generateMoments';
import { CompanionMomentCard } from './CompanionMomentCard';

interface DashboardProps {
  userName: string;
  userGoal: UserGoal | null;
  userData: UserData;
  onNavigate: (screen: string) => void;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onOpenCheckIn: (dateISO?: string) => void;
}


function labelDayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

const METRIC_LABELS: Record<DashboardMetric, string> = {
  mood: 'Mood',
  energy: 'Energy',
  sleep: 'Sleep',
  stress: 'Stress',
  anxiety: 'Anxiety',
  irritability: 'Irritability',
  focus: 'Clarity',
  bloating: 'Bloating',
  digestion: 'Digestion',
  nausea: 'Nausea',
  pain: 'Pain',
  headache: 'Headache',
  cramps: 'Cramps',
  jointPain: 'Joint pain',
  flow: 'Flow',
  hairShedding: 'Hair shedding',
  facialSpots: 'Facial spots',
  cysts: 'Cysts',
  brainFog: 'Brain fog',
  fatigue: 'Fatigue',
  dizziness: 'Dizziness',
  appetite: 'Appetite',
  libido: 'Libido',
  breastTenderness: 'Breast tenderness',
  hotFlushes: 'Hot flushes',
  nightSweats: 'Night sweats',
};

// A mixed palette pulled from all theme families so multi-line charts stay readable
// even when the current theme uses similar tones.
const MIXED_CHART_PALETTE = [
  'rgb(96, 115, 94)',    // sage dark
  'rgb(156, 136, 177)',  // lavender primary
  'rgb(82, 125, 145)',   // ocean dark
  'rgb(190, 130, 110)',  // terracotta primary
  'rgb(203, 186, 159)',  // sage accent
  'rgb(217, 186, 203)',  // lavender accent
  'rgb(186, 216, 217)',  // ocean accent
  'rgb(160, 100, 80)',   // terracotta dark
];


function metricValue(entry: any | undefined, metric: DashboardMetric): number | undefined {
  if (!entry) return undefined;
  if (metric === 'mood') {
    const m = entry?.mood as 1 | 2 | 3 | undefined;
    // Keep everything on a 0-10 feel for the chart.
    if (m === 1) return 3;
    if (m === 2) return 6;
    if (m === 3) return 9;
    return undefined;
  }
  const v = entry?.values?.[metric as SymptomKey];
  return typeof v === 'number' ? v : undefined;
}

function buildWeekSeries(dateISOs: string[], entriesByDate: Map<string, any>, metrics: DashboardMetric[]) {
  return dateISOs.map((iso) => {
    const e = entriesByDate.get(iso);
    const row: any = { day: labelDayShort(iso), dateISO: iso };
    for (const m of metrics) row[m] = metricValue(e, m);
    return row;
  });
}




type GuideCardId =
  | 'missed-day'
  | 'low-coverage'
  | 'cycle-optional'
  | 'history-saved'
  | 'building-rhythm'
  | 'first-week-taking-shape'
  | 'patterns-starting-to-settle'
  | 'rhythm-getting-easier'
  | 'stronger-baseline'
  | 'it-grows'
  | 'spotting-patterns'
  | 'quick-checkin'
  | 'patterns-take-time'
  | 'small-experiments';

type GuideCTA =
  | { label: string; action: 'navigate'; screen: string }
  | { label: string; action: 'check-in' };

type GuideCardModel = {
  id: GuideCardId;
  title: string;
  body: string;
  supporting?: string;
  cta: GuideCTA;
  priority: number;
  contextual?: boolean;
  icon: React.ReactNode;
};

type GuideMemory = {
  lastShownAtISO?: string;
  timesShown?: number;
  lastClickedAtISO?: string;
};

const GUIDE_MEMORY_KEY = 'everybody:v2:homepage_guide_memory';

function readGuideMemory(): Partial<Record<GuideCardId, GuideMemory>> {
  try {
    const raw = localStorage.getItem(GUIDE_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeGuideMemory(memory: Partial<Record<GuideCardId, GuideMemory>>) {
  try {
    localStorage.setItem(GUIDE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

function daysBetweenISO(a: string, b: string): number {
  const start = new Date(`${a}T00:00:00`).getTime();
  const end = new Date(`${b}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function getGuideCoverageTier(userData: UserData): 'logging-only' | 'basic-patterns' | 'full-insights' {
  const enabled = new Set<SymptomKey>(userData.enabledModules ?? []);
  const signalCount = enabled.size + 1; // mood is always available

  const hasRecovery = enabled.has('sleep') || enabled.has('energy') || enabled.has('fatigue');
  const hasCycle = userData.cycleTrackingMode === 'cycle' || enabled.has('flow');
  const hasMind = true;
  const bodySignals: SymptomKey[] = ['pain', 'cramps', 'bloating', 'headache', 'jointPain', 'hotFlushes', 'nightSweats', 'hairShedding', 'facialSpots', 'cysts', 'breastTenderness', 'digestion', 'nausea'];
  const hasBody = bodySignals.some((key) => enabled.has(key));
  const categoryCount = [hasRecovery, hasCycle, hasMind, hasBody].filter(Boolean).length;

  if (signalCount >= 5 && categoryCount >= 4) return 'full-insights';
  if (signalCount >= 3 && categoryCount >= 3) return 'basic-patterns';
  return 'logging-only';
}

function buildGuideCard(options: {
  daysTracked: number;
  daysSinceStart: number;
  hasRecentGap: boolean;
  lowCoverage: boolean;
  hasHistory: boolean;
  cycleOptionalRelevant: boolean;
  experimentRelevant: boolean;
}): GuideCardModel | null {
  const memory = readGuideMemory();
  const cooldownDays = 2;
  const { daysTracked, daysSinceStart } = options;

  const cards: GuideCardModel[] = [];

  const addCard = (card: GuideCardModel, condition = true) => {
    if (condition) cards.push(card);
  };

  const inFirstDays = daysSinceStart <= 7 || daysTracked < 5;
  const inFirstWeekShape = daysTracked >= 5 && daysTracked <= 8 && daysSinceStart <= 10;
  const settlingStage = daysTracked >= 8 && daysTracked <= 14 && daysSinceStart <= 18;
  const easierReadStage = daysTracked >= 12 && daysTracked <= 20 && daysSinceStart <= 28;
  const baselineStage = daysTracked >= 16 && daysTracked <= 28 && daysSinceStart <= 35;
  const growthStage = daysTracked >= 3 && daysTracked < 14 && daysSinceStart <= 21;
  const spottingStage = daysTracked >= 2 && daysTracked <= 8 && daysSinceStart <= 12;
  const quickCheckinStage = daysTracked < 7 && daysSinceStart <= 10;
  const patternsTakeTimeStage = daysTracked >= 4 && daysTracked < 12 && daysSinceStart <= 21;

  addCard({
    id: 'missed-day',
    title: 'Missed a day?',
    body: 'That’s completely fine. You can tap any day in Calendar and fill it in later.',
    cta: { label: 'Open Calendar', action: 'navigate', screen: 'calendar' },
    priority: 1,
    contextual: true,
    icon: <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.hasRecentGap);

  addCard({
    id: 'low-coverage',
    title: 'Track what matters to you',
    body: 'You can keep things simple or add more symptoms over time. A few active signals across mood, body, recovery and cycle usually helps patterns come through more clearly.',
    cta: { label: 'Customise symptoms', action: 'navigate', screen: 'profile' },
    priority: 2,
    contextual: true,
    icon: <Settings2 className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.lowCoverage);

  addCard({
    id: 'cycle-optional',
    title: 'Cycle insights are there when you want them',
    body: 'If you log bleeding or spotting, the app can estimate phases and show how symptoms shift across the month. You can still track without it.',
    cta: { label: 'Edit cycle', action: 'navigate', screen: 'calendar' },
    priority: 3,
    contextual: true,
    icon: <Droplets className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.cycleOptionalRelevant);

  addCard({
    id: 'history-saved',
    title: 'Want to see what’s saved?',
    body: 'Your past companion moments and milestones are kept in History, so you can look back without losing the story.',
    cta: { label: 'Open History', action: 'navigate', screen: 'history' },
    priority: 4,
    contextual: true,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.hasHistory);

  addCard({
    id: 'building-rhythm',
    title: 'You’re building your rhythm',
    body: 'A few more check-ins will help this start turning into personalised guidance.',
    cta: { label: 'Keep going', action: 'check-in' },
    priority: 5,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, inFirstDays);

  addCard({
    id: 'first-week-taking-shape',
    title: 'Your first week is taking shape',
    body: 'You have enough check-ins now for early patterns to feel a little more trustworthy.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 6,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, inFirstWeekShape);

  addCard({
    id: 'patterns-starting-to-settle',
    title: 'Your patterns are starting to settle',
    body: 'Patterns are repeating a bit more now, so the app can be calmer and more specific.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 7,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, settlingStage);

  addCard({
    id: 'rhythm-getting-easier',
    title: 'Your rhythm is getting easier to read',
    body: 'With more check-ins in place, the app can start making steadier sense of what tends to shift together.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 8,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, easierReadStage);

  addCard({
    id: 'stronger-baseline',
    title: 'You have built a stronger baseline',
    body: 'With a stronger baseline in place, small changes and experiments should be easier to interpret.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 9,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, baselineStage);

  addCard({
    id: 'it-grows',
    title: 'It grows with you',
    body: 'This space gets smarter as you use it. You’ll see helpful reflections from day one, but clearer patterns usually take a little time. Keep logging, and we’ll build your rhythm together.',
    supporting: 'Early patterns are starting to show. This will get clearer with a little more time.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 10,
    icon: <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, growthStage);

  addCard({
    id: 'small-experiments',
    title: 'Keep experiments small',
    body: 'If you want to test what helps, small changes are easier to notice and easier to compare over time.',
    cta: { label: 'View experiments', action: 'navigate', screen: 'insights' },
    priority: 10,
    contextual: true,
    icon: <FlaskConical className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.experimentRelevant);

  addCard({
    id: 'spotting-patterns',
    title: 'Start spotting patterns',
    body: 'Log a few more days and the app will begin showing more meaningful links between symptoms. Small patterns often start softly, then get clearer over time.',
    cta: { label: 'Open check-in', action: 'check-in' },
    priority: 11,
    icon: <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, spottingStage);

  addCard({
    id: 'quick-checkin',
    title: 'A quick check-in goes a long way',
    body: 'Short, regular check-ins help the app learn your rhythm. It does not have to be perfect to be useful.',
    cta: { label: 'Open check-in', action: 'check-in' },
    priority: 12,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, quickCheckinStage);

  addCard({
    id: 'patterns-take-time',
    title: 'Patterns take a little time',
    body: 'You may notice early reflections quickly, but stronger patterns usually build over a few weeks of check-ins. There’s no need to get everything perfect.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 13,
    icon: <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, patternsTakeTimeStage);

  const eligible = cards.filter((card) => {
    const entry = memory[card.id];
    if (!entry?.lastShownAtISO) return true;
    return daysBetweenISO(entry.lastShownAtISO, isoToday()) >= cooldownDays;
  });

  const pool = eligible.length ? eligible : cards;
  if (!pool.length) return null;

  return [...pool].sort((a, b) => a.priority - b.priority)[0] ?? null;
}

type DashboardTileProps = {
  title: string;
  subtitle: string;
  cta?: string;
  icon: React.ReactNode;
  onClick: () => void;
};

function DashboardTile({ title, subtitle, cta, icon, onClick }: DashboardTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="eb-card hover:shadow-md transition-all text-left group h-full flex flex-col justify-start"
    >
      <div className="flex items-start gap-4 w-full h-full">
        <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.20)] flex items-center justify-center shrink-0">
          <div className="text-[rgb(var(--color-primary))]">{icon}</div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col items-start h-full">
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-[rgba(0,0,0,0.65)]">{subtitle}</p>
          {cta ? (
            <span className="mt-auto pt-3 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))]">
              {cta} <ArrowRight className="w-4 h-4" />
            </span>
          ) : null}
        </div>

        <ChevronRight className="w-5 h-5 text-[rgba(0,0,0,0.45)] group-hover:text-[rgba(0,0,0,0.65)] mt-1" />
      </div>
    </button>
  );
}

export function Dashboard({
  userName,
  userGoal,
  userData,
  onNavigate,
  onUpdateUserData,
  onOpenCheckIn,
}: DashboardProps) {
  const { entries: entriesAll } = useEntries();
  const { experiment } = useExperiment();
  const entriesSorted = useMemo(() => sortByDateAsc(entriesAll), [entriesAll]);

  const todayISO = isoToday();
  const todayEntry = useMemo(
    () => entriesSorted.find((e) => e.dateISO === todayISO) ?? null,
    [entriesSorted, todayISO]
  );

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }, []);

  const checkedInToday = Boolean(todayEntry);
  const daysTracked = entriesSorted.length;
  // We want Insights to hook users early. Three days is enough to show a meaningful nudge.
  const insightsMinDays = 3;
  const insightsRemaining = Math.max(0, insightsMinDays - daysTracked);
  const insightsReady = daysTracked >= insightsMinDays;

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted), [entriesSorted]);

  const heroModel = useMemo(() => {
    // IMPORTANT: Version the cache key.
    // We have iterated on the hero model shape/logic a lot, and stale cached JSON can
    // make the UI look "stuck" even when the underlying logic has changed.
    // Bump when hero copy/logic changes, to avoid users seeing stale cached text.
    const HERO_CACHE_VERSION = 5;

    // The hero model is derived from (entries + user). We cache per-day for lightness,
    // but we MUST ensure the cache matches the current data. Otherwise after a
    // restore-from-backup, users can see a stale "pre-restore" hero.
    const latestUpdatedAt = (() => {
      const last = [...entriesSorted].reverse().find((e: any) => e?.updatedAt);
      return last?.updatedAt ?? '';
    })();
    const hasCycleOverride = entriesSorted.some((e: any) => (e as any)?.cycleStartOverride === true);
    const fingerprint = [
      entriesSorted.length,
      latestUpdatedAt,
      userData.goal ?? '',
      userData.cycleTrackingMode ?? '',
      hasCycleOverride ? '1' : '0',
    ].join('|');

    const key = `eb:homeHero:v${HERO_CACHE_VERSION}:${isoToday()}`;
    try {
      const cachedRaw = localStorage.getItem(key);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        // If the cached payload looks incomplete OR doesn't match current data, ignore it and rebuild.
        if (
          cached &&
          cached.dateISO === isoToday() &&
          cached._fp === fingerprint &&
          (cached.rhythmBody || cached.howLines)
        ) {
          return cached;
        }
      }
    } catch {
      // ignore cache issues
    }

    const model: any = buildHomepageHeroModel(entriesSorted, userData);
    model._fp = fingerprint;
    try {
      localStorage.setItem(key, JSON.stringify(model));
    } catch {
      // ignore storage issues
    }
    return model;
  }, [entriesSorted, userData]);

  const todayPhase = useMemo(() => {
    if (userData.cycleTrackingMode !== 'cycle') return null;
    return estimatePhaseByFlow(todayISO, entriesSorted);
  }, [userData.cycleTrackingMode, todayISO, entriesSorted]);

  const [momentRefresh, setMomentRefresh] = useState(0);
  const rhythmPhaseState = useMemo(() => getRhythmPhaseState(), [entriesSorted.length, todayISO]);
  const highestMoment = useMemo(() => getHighestPriorityMoment(todayISO), [todayISO, entriesSorted.length, momentRefresh]);

  const guideCard = useMemo(() => {
    const daysSinceStart = userData.createdAt ? Math.max(0, daysBetweenISO(userData.createdAt.slice(0, 10), todayISO)) : daysTracked;
    const lastEntryISO = entriesSorted[entriesSorted.length - 1]?.dateISO ?? null;
    const hasRecentGap = Boolean(lastEntryISO && daysBetweenISO(lastEntryISO, todayISO) >= 2);
    const coverageTier = getGuideCoverageTier(userData);
    const hasHistory = getArchivedMomentSnapshots(1).length > 0;
    const cycleOptionalRelevant = userData.cycleTrackingMode !== 'cycle';
    const experimentRelevant = Boolean(experiment && !(experiment as any)?.outcome?.completedAtISO);

    return buildGuideCard({
      daysTracked,
      daysSinceStart,
      hasRecentGap,
      lowCoverage: coverageTier === 'logging-only',
      hasHistory,
      cycleOptionalRelevant,
      experimentRelevant,
    });
  }, [todayISO, userData, entriesSorted, daysTracked, experiment, momentRefresh]);

  React.useEffect(() => {
    if (!guideCard) return;
    const memory = readGuideMemory();
    const existing = memory[guideCard.id] ?? {};
    if (existing.lastShownAtISO === todayISO) return;
    memory[guideCard.id] = {
      ...existing,
      lastShownAtISO: todayISO,
      timesShown: (existing.timesShown ?? 0) + 1,
    };
    writeGuideMemory(memory);
  }, [guideCard, todayISO]);

  React.useEffect(() => {
    generateMoments(entriesSorted as any, userData, todayISO);
    setMomentRefresh((value) => value + 1);
  }, [entriesSorted, userData, todayISO]);

  function dayPhaseKey(p: any) {
    if (p === 'Ovulatory') return 'Ovulation';
    return p;
  }

  const [tipOffset, setTipOffset] = React.useState(0);

  // Restore nudge (local-first app means different "installs" can have separate storage,
  // e.g. iOS Safari tab vs Add-to-Home-Screen). Import gives users a way to recover quickly.
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string>('');

  const tip = useMemo(() => {
    const phase = userData.cycleTrackingMode === 'cycle' ? (dayPhaseKey(todayPhase) as any) : null;
    return getDailyTip({
      dateISO: todayISO,
      phase,
      goal: userData.goal ?? null,
      daysTracked,
      offset: tipOffset,
    });
  }, [todayISO, todayPhase, userData.cycleTrackingMode, userData.goal, daysTracked, tipOffset]);

  const addDaysISO = (dateISO: string, days: number) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return isoFromDateLocal(d);
  };

  const restoreFromBackup = async (file: File) => {
    try {
      setRestoreMsg('');
      const text = await file.text();
      const json = parseBackupJson(text);
      if (!json) {
        setRestoreMsg(looksLikeInsightsExport(text) ? 'That file is an Insights export, not a backup.' : 'That backup file does not look valid.');
        return;
      }
      importBackupFile(json);
      setRestoreMsg('Backup imported.');
    } catch (err: any) {
      setRestoreMsg(err?.message || 'Could not import backup.');
    }
  };

  const yesterdayISO = useMemo(() => addDaysISO(todayISO, -1), [todayISO]);
  const yesterdayEntry = useMemo(
    () => entriesSorted.find((e: any) => (e as any).dateISO === yesterdayISO) ?? null,
    [entriesSorted, yesterdayISO]
  );

  // Dashboard chart metrics (user chooses 3)
  const availableMetrics = useMemo(() => {
    const set = new Set<DashboardMetric>();
    set.add('mood');
    (userData.enabledModules || []).forEach((k) => set.add(k));
    return Array.from(set);
  }, [userData.enabledModules]);

  const chartMetrics: [DashboardMetric, DashboardMetric, DashboardMetric] = useMemo(() => {
    const saved = userData.dashboardChartMetrics;
    if (
      saved &&
      saved.length === 3 &&
      saved.every((m) => availableMetrics.includes(m))
    ) {
      return saved;
    }

    const preferred: DashboardMetric[] = ['mood', 'energy', 'sleep'];
    const picked: DashboardMetric[] = [];
    for (const p of preferred) {
      if (availableMetrics.includes(p) && !picked.includes(p)) picked.push(p);
    }
    for (const m of availableMetrics) {
      if (picked.length >= 3) break;
      if (!picked.includes(m)) picked.push(m);
    }
    // Fallback safety
    while (picked.length < 3) picked.push('mood');
    return [picked[0], picked[1], picked[2]] as [DashboardMetric, DashboardMetric, DashboardMetric];
  }, [userData.dashboardChartMetrics, availableMetrics]);

  // Week chart
  const weekSeries = useMemo(() => {
    const today = new Date();
    const dateISOs: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateISOs.push(isoFromDateLocal(d));
    }
    const map = new Map(entriesSorted.map((e: any) => [e.dateISO, e]));
    return buildWeekSeries(dateISOs, map, chartMetrics);
  }, [entriesSorted, chartMetrics]);

  const quickHookLines = useMemo(() => {
    // Generate 2-3 lines that feel useful even from day 1.
    if (entriesSorted.length === 0) return [] as string[];
    const last7 = filterByDays(entriesSorted, 7);
    const lines: string[] = [];

    // 1) Encourage progress toward insights
    if (!insightsReady) {
      lines.push(
        insightsRemaining === 1
          ? 'Log 1 more day to unlock your first insights.'
          : `Log ${insightsRemaining} more days to unlock your first insights.`
      );
    } else {
      lines.push('Insights are ready. Tap View insights to spot patterns.' );
    }

    // 2) Pick a “best so far” from the first non-mood metric available
    const bestMetric = chartMetrics.find((m) => m !== 'mood') ?? chartMetrics[0];
    let best: { iso: string; v: number } | null = null;
    for (const e of last7) {
      const v = metricValue(e as any, bestMetric);
      if (typeof v !== 'number') continue;
      if (!best || v > best.v) best = { iso: (e as any).dateISO, v };
    }
    if (best) {
      const day = labelDayShort(best.iso);
      lines.push(`${METRIC_LABELS[bestMetric]} peak (last 7 days): ${best.v}/10 on ${day}.`);
    }

    // 3) Mood line if available
    let bestMood: { iso: string; v: number } | null = null;
    for (const e of last7) {
      const v = metricValue(e as any, 'mood');
      if (typeof v !== 'number') continue;
      if (!bestMood || v > bestMood.v) bestMood = { iso: (e as any).dateISO, v };
    }
    if (bestMood) {
      const day = labelDayShort(bestMood.iso);
      lines.push(`Best mood (last 7 days): ${bestMood.v}/10 on ${day}.`);
    }

    // 4) Add a tiny "stability" hint if we have a few points
    if (last7.length >= 3 && lines.length < 4) {
      const candidates = (chartMetrics.length ? chartMetrics : (['mood', 'energy', 'sleep', 'stress'] as any))
        .slice(0, 6);

      const stats = candidates
        .map((k: any) => {
          const vals = last7
            .map((e) => metricValue(e as any, k))
            .filter((v) => typeof v === 'number') as number[];
          if (vals.length < 3) return null;
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          return { k, range: max - min };
        })
        .filter(Boolean) as Array<{ k: any; range: number }>;

      if (stats.length) {
        stats.sort((a, b) => a.range - b.range);
        const mostConsistent = stats[0];
        const biggestSwing = stats[stats.length - 1];
        lines.push(`Most consistent (last 7 days): ${METRIC_LABELS[mostConsistent.k]}.`);
        if (lines.length < 4) {
          lines.push(`Biggest swing (last 7 days): ${METRIC_LABELS[biggestSwing.k]}.`);
        }
      }
    }


    // 3b) A lightweight "micro-insight" if we have enough sleep+energy points
    if (lines.length < 3) {
      const pts = last7
        .map((e) => ({
          sleep: metricValue(e as any, 'sleep'),
          energy: metricValue(e as any, 'energy'),
        }))
        .filter((p) => typeof p.sleep === 'number' && typeof p.energy === 'number') as Array<{ sleep: number; energy: number }>;

      if (pts.length >= 4) {
        const low = pts.filter((p) => p.sleep <= 5).map((p) => p.energy);
        const high = pts.filter((p) => p.sleep >= 7).map((p) => p.energy);
        const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
        const a = mean(low);
        const b = mean(high);
        if (a != null && b != null && Math.abs(b - a) >= 1) {
          lines.push(`Early pattern: on lower-sleep days, energy averaged ${Math.round(a)}/10 (vs ${Math.round(b)}/10 on better-sleep days).`);
        }
      }
    }

    // 4) A simple “since yesterday” comparison (if we have both days)
    if (todayEntry && yesterdayEntry) {
      const candidates: DashboardMetric[] = ['mood', ...chartMetrics.filter((m) => m !== 'mood')];
      for (const m of candidates) {
        const a = metricValue(todayEntry as any, m);
        const b = metricValue(yesterdayEntry as any, m);
        if (typeof a === 'number' && typeof b === 'number') {
          const arrow = a > b ? '↑' : a < b ? '↓' : '→';
          lines.push(`Since yesterday: ${METRIC_LABELS[m]} ${b}→${a} ${arrow}`);
          break;
        }
      }
    }

    // 5) Gentle nudge to customise without making day 1 feel heavy
    const coreDefaultCount = 8;
    if (lines.length < 3 && (userData.enabledModules?.length ?? 0) <= coreDefaultCount) {
      lines.push('Want more personalised insights? Add 1–2 symptoms in Profile (it stays lightweight).');
    }

    return lines.slice(0, 4);
  }, [entriesSorted, chartMetrics, insightsReady, insightsRemaining, todayEntry, yesterdayEntry, userData.enabledModules]);

  const setChartMetric = (index: 0 | 1 | 2, next: DashboardMetric) => {
    onUpdateUserData((prev) => {
      const current = (prev.dashboardChartMetrics && prev.dashboardChartMetrics.length === 3
        ? [...prev.dashboardChartMetrics]
        : [...chartMetrics]) as DashboardMetric[];

      // If the user picks a metric already used elsewhere, swap them so we always keep 3 unique choices.
      const otherIndex = current.findIndex((m, i) => m === next && i !== index);
      const copy = [...current];
      if (otherIndex >= 0) {
        const tmp = copy[index];
        copy[index] = copy[otherIndex];
        copy[otherIndex] = tmp;
      }
      copy[index] = next;
      return { ...prev, dashboardChartMetrics: [copy[0], copy[1], copy[2]] as any };
    });
  };

  return (
    <div className="eb-page">
      <div className="eb-page-inner">
        {/* Header */}
        <div>
          <h1 className="mb-2">Welcome back{userName ? `, ${userName}` : ''}</h1>
          <p>{todayLabel}</p>
        </div>


        {/* HERO: Symptom tracking */}

        <div className="eb-card eb-hero eb-hero-surface rounded-2xl p-6 relative">
          {/* Calendar icon */}
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="absolute top-4 right-4 z-10 opacity-80 hover:opacity-100 transition"
            title="Calendar"
          >
            <Calendar className="w-5 h-5" />
          </button>

          {/* View full rhythm */}
          <button
            type="button"
            onClick={() => onNavigate('rhythm')}
            className="absolute top-4 right-12 z-10 text-sm text-white/85 hover:text-white transition"
          >
            View full rhythm
          </button>

          <h3 className="mb-3 eb-hero-title eb-hero-on-dark text-white">Symptom tracking</h3>

          {/* Today in your rhythm */}
          <div className="eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.14)] border border-[rgba(255,255,255,0.18)]">
            <div className="text-sm font-semibold text-[rgba(0,0,0,0.70)]">{heroModel.rhythmTitle}</div>
            {heroModel.rhythmHeadline ? (
              <div className="mt-1 text-lg font-semibold text-black">{heroModel.rhythmHeadline}</div>
            ) : null}
            <div className="mt-2 text-sm text-[rgba(0,0,0,0.65)]">{heroModel.rhythmBody}</div>
            {rhythmPhaseState && (rhythmPhaseState as any).gapMode === 'stale' ? (
              <div className="mt-2 text-xs text-[rgba(0,0,0,0.55)]">Estimated current phase after a longer gap in logging. A few more check-ins will help firm this up again.</div>
            ) : rhythmPhaseState && (rhythmPhaseState as any).gapMode === 'catchup' ? (
              <div className="mt-2 text-xs text-[rgba(0,0,0,0.55)]">Estimated current phase after a gap in logging. Rhythm has caught up using elapsed time and recent anchors.</div>
            ) : null}
          </div>

          {/* How you've been */}
          <div className="mt-4 eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.10)] border border-[rgba(255,255,255,0.16)]">
            <div className="text-sm font-semibold text-black">{heroModel.howTitle}</div>
            <div className="mt-2 space-y-1">
              {heroModel.howLines.map((line: string, i: number) => (
                <div key={i} className="text-sm text-[rgba(0,0,0,0.65)]">
                  {line}
                </div>
              ))}
            </div>
            {heroModel.relationshipLine ? (
              <div className="mt-3 text-sm text-[rgba(0,0,0,0.65)]">
                {heroModel.relationshipLine}
              </div>
            ) : null}
          </div>
        </div>

        {highestMoment ? (
          <CompanionMomentCard
            moment={highestMoment}
            onNavigate={onNavigate}
            onDismiss={() => setMomentRefresh((value) => value + 1)}
          />
        ) : null}

        {guideCard ? (
          <div className="eb-card">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0">
                {guideCard.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-[0.08em] text-[rgba(0,0,0,0.52)] font-semibold">Guide</div>
                <h3 className="mt-1 mb-1">{guideCard.title}</h3>
                <p className="text-sm text-[rgba(0,0,0,0.72)]">{guideCard.body}</p>
                {guideCard.supporting ? (
                  <p className="text-sm text-[rgba(0,0,0,0.60)] mt-2">{guideCard.supporting}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    const memory = readGuideMemory();
                    const existing = memory[guideCard.id] ?? {};
                    memory[guideCard.id] = { ...existing, lastClickedAtISO: todayISO };
                    writeGuideMemory(memory);
                    if (guideCard.cta.action === 'check-in') onOpenCheckIn(todayISO);
                    else onNavigate(guideCard.cta.screen);
                  }}
                  className="mt-4 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))] hover:underline"
                >
                  {guideCard.cta.label} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="eb-card">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.08em] text-[rgba(0,0,0,0.52)] font-semibold">Today</div>
              <h3 className="mt-1 mb-1">{checkedInToday ? 'Today is logged' : 'Today is ready for a check-in'}</h3>
              <p className="text-sm text-[rgba(0,0,0,0.68)]">
                {checkedInToday
                  ? 'You have already logged today. Reopen it if anything changed.'
                  : 'A quick check-in today helps the app make better sense of what matters right now.'}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Status</div>
                  <div className="mt-1 font-semibold">{checkedInToday ? 'Logged today' : 'Not logged yet'}</div>
                </div>
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Days tracked</div>
                  <div className="mt-1 font-semibold">{daysTracked}</div>
                </div>
                {experiment && !(experiment as any)?.outcome?.completedAtISO ? (
                  <div className="eb-inset rounded-2xl p-3 sm:col-span-2">
                    <div className="text-xs text-[rgb(var(--color-text-secondary))]">Active experiment</div>
                    <div className="mt-1 font-semibold">{(experiment as any)?.title || 'Your experiment'}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button type="button" className="eb-btn-primary" onClick={() => onOpenCheckIn(todayISO)}>
                  {checkedInToday ? "Open today’s check-in" : "Do today’s check-in"}
                </button>
                <button type="button" className="eb-btn-secondary" onClick={() => onNavigate('calendar')}>
                  Open calendar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Restore from backup nudge (only when there is no data yet) */}
        {daysTracked === 0 ? (
          <div className="eb-card">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-primary)/0.12)] flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1">Got a backup to restore?</h3>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                  If you used EveryBody on another phone or browser, import your backup JSON to bring your check-ins back.
                </p>

                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void restoreFromBackup(file);
                    (e.currentTarget as HTMLInputElement).value = '';
                  }}
                />

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    className="eb-btn eb-btn-secondary inline-flex items-center gap-2"
                    onClick={() => restoreInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Import backup
                  </button>
                  <button type="button" className="eb-btn eb-btn-secondary" onClick={() => onNavigate('profile')}>
                    Go to Profile
                  </button>
                </div>

                {restoreMsg ? (
                  <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">{restoreMsg}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}


        <div className="eb-card">
          <div className="flex items-start gap-4 w-full h-full">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.08em] text-[rgba(0,0,0,0.52)] font-semibold">Snapshot</div>
              <h3 className="mt-1 mb-2">What looks most useful right now</h3>
              {quickHookLines.length > 0 ? (
                <div className="text-sm text-[rgba(0,0,0,0.75)] space-y-1">
                  {quickHookLines.map((l, idx) => (
                    <div key={idx}>{l}</div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[rgba(0,0,0,0.75)]">
                  Log a few days and your first patterns will show up here.
                </p>
              )}

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Insights</div>
                  <div className="mt-1 font-semibold">{insightsReady ? 'Ready' : `${insightsRemaining} to unlock`}</div>
                </div>
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Best next page</div>
                  <div className="mt-1 font-semibold">{insightsReady ? 'Insights' : 'Check-in'}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => (insightsReady ? onNavigate('insights') : onOpenCheckIn(todayISO))}
                className="mt-4 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))] hover:underline"
              >
                {insightsReady ? 'View insights' : "Do today’s check-in"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="eb-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="mb-1">Your week at a glance</h3>
              <p className="text-xs text-[rgb(var(--color-text-secondary))]">A small trend snapshot. Pick 3 metrics to show.</p>
            </div>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={weekSeries} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis domain={[0, 10]} width={32} tickMargin={6} />
                <Tooltip />
                <Legend />
                {chartMetrics.map((m, idx) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={METRIC_LABELS[m]}
                    stroke={MIXED_CHART_PALETTE[idx % MIXED_CHART_PALETTE.length]}
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            {[0, 1, 2].map((idx) => (
              <select
                key={idx}
                className="eb-input !py-2 !px-3 !text-sm flex-1"
                value={chartMetrics[idx as 0 | 1 | 2]}
                onChange={(e) => setChartMetric(idx as 0 | 1 | 2, e.target.value as DashboardMetric)}
              >
                {availableMetrics.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <p className="text-sm mt-3">
            You will see dots from day 1. Lines connect across missed days so you can still spot the overall trend.
          </p>
        </div>
        {/* Tip for today */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
          <div className="flex items-start gap-4 w-full h-full">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0">
              <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setTipOffset((v) => v + 1)}
                // Chrome can sometimes let later-flowing text overlap and steal the click.
                // Keep this above the header/text.
                className="text-sm text-[rgb(var(--color-primary))] hover:underline absolute top-0 right-0 z-10"
              >
                Another tip
              </button>

              <h3 className="mb-1 pr-24">Tip for today</h3>
              <p className="text-sm font-semibold pr-24">{tip.title}</p>

              <p className="text-sm text-[rgba(0,0,0,0.75)] mt-2">{tip.body}</p>

              {tip.cta ? (
                <button
                  type="button"
                  onClick={() => {
                    if (tip.cta?.screen === 'check-in') onOpenCheckIn(todayISO);
                    else onNavigate(tip.cta.screen);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))] hover:underline"
                >
                  {tip.cta.label} <ArrowRight className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
