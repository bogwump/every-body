import React, { useMemo, useRef, useState } from 'react';
import { Calendar, TrendingUp, Sparkles, ArrowRight, Lightbulb, Upload, History as HistoryIcon, Settings2, Droplets, FlaskConical, Star, BookOpen } from 'lucide-react';
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
import { useEntries, useExperiment, useExperimentHistory } from '../lib/appStore';
import { buildHomepageHeroModel, computeCycleStats, estimatePhaseByFlow, filterByDays, isoToday, sortByDateAsc } from '../lib/analytics';
import { isoFromDateLocal } from '../lib/date';
import { getDailyTip } from '../lib/tips';
import { importBackupFile, parseBackupJson, looksLikeInsightsExport } from '../lib/backup';
import { getArchivedMomentSnapshots, getHighestPriorityMoment } from '../lib/companionMoments';
import { getRecentPhaseChange, getRhythmPhaseState } from '../lib/phaseChange';
import { generateMoments } from '../lib/generateMoments';
import { CompanionMomentCard } from './CompanionMomentCard';
import { getCycleTrustModel } from '../lib/cycleTrust';
import { compareExperimentOutcomes, findPreviousExperimentRun } from '../lib/experimentMeta';
import { getMetricDisplayLabel, getMoodLabel, getMoodValue10, isPositiveMetric } from '../lib/metricSemantics';
import { SYMPTOM_META } from '../lib/symptomMeta';

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
  ...(Object.fromEntries(Object.values(SYMPTOM_META).map((item) => [item.key, item.label])) as Record<SymptomKey, string>),
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

const NEXT_STEP_SWING_METRICS: DashboardMetric[] = [
  'mood',
  'sleep',
  'energy',
  'stress',
  'anxiety',
  'irritability',
  'focus',
  'pain',
  'cramps',
  'headache',
  'bloating',
  'fatigue',
  'brainFog',
  'nightSweats',
  'hotFlushes',
  'breastTenderness',
  'jointPain',
  'libido',
];

type NextStepRecommendation = {
  body: string;
  actionLabel: string;
} & (
  | { action: 'check-in' }
  | { action: 'navigate'; screen: string }
);

type SwingSignal = {
  metric: DashboardMetric;
  label: string;
  range: number;
  lastDelta: number;
  direction: 'up' | 'down';
};

function formatCountLabel(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}

function dayDiff(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.round((to - from) / 86400000);
}

function getRecentSwingSignal(entries: any[], candidateMetrics: DashboardMetric[]): SwingSignal | null {
  let best: SwingSignal | null = null;

  for (const metric of candidateMetrics) {
    const values = entries
      .map((entry) => metricValue(entry, metric))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (values.length < 3) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const lastDelta = last - prev;
    const absLastDelta = Math.abs(lastDelta);

    if (range < 4 && absLastDelta < 3) continue;

    const label = METRIC_LABELS[metric] || metric;
    const candidate: SwingSignal = {
      metric,
      label,
      range,
      lastDelta: absLastDelta,
      direction: lastDelta >= 0 ? 'up' : 'down',
    };

    if (!best) {
      best = candidate;
      continue;
    }

    const bestScore = best.range * 10 + best.lastDelta;
    const candidateScore = candidate.range * 10 + candidate.lastDelta;
    if (candidateScore > bestScore) best = candidate;
  }

  return best;
}


function metricValue(entry: any | undefined, metric: DashboardMetric): number | undefined {
  if (!entry) return undefined;
  if (metric === 'mood') {
    const m = entry?.mood as 1 | 2 | 3 | undefined;
    // Keep everything on a 0-10 feel for the chart.
    return getMoodValue10(m);
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

function average(values: number[]): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1);
}

function metricSentenceLabel(metric: DashboardMetric): string {
  const label = METRIC_LABELS[metric] || metric;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function formatDashboardMetricValue(metric: DashboardMetric, value: number | null | undefined): string {
  if (metric === 'mood') return getMoodLabel(value) || '—';
  const rounded = Math.round((value ?? 0) * 10) / 10;
  return Number.isInteger(rounded) ? `${Math.trunc(rounded)}/10` : `${rounded.toFixed(1)}/10`;
}

function describeDirectionalDelta(metric: DashboardMetric, delta: number): string {
  if (metric === 'mood') return delta > 0 ? 'better' : 'lower';
  if (isPositiveMetric(metric)) return delta > 0 ? 'higher' : 'lower';
  return delta > 0 ? 'higher' : 'lower';
}

function formatPhaseName(phase: string | null | undefined): string {
  const raw = String(phase || '').trim();
  if (!raw) return 'this phase';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}


function pickTopMetricDeltasForWindows(beforeEntries: any[], afterEntries: any[], metrics: DashboardMetric[], limit = 2) {
  const candidates: Array<{ metric: DashboardMetric; beforeAvg: number; afterAvg: number; delta: number }> = [];
  for (const metric of metrics) {
    const beforeValues = beforeEntries.map((entry) => metricValue(entry, metric)).filter((value): value is number => typeof value === 'number');
    const afterValues = afterEntries.map((entry) => metricValue(entry, metric)).filter((value): value is number => typeof value === 'number');
    const beforeAvg = average(beforeValues);
    const afterAvg = average(afterValues);
    if (beforeAvg == null || afterAvg == null) continue;
    const delta = afterAvg - beforeAvg;
    if (Math.abs(delta) < 0.8) continue;
    candidates.push({ metric, beforeAvg, afterAvg, delta });
  }
  return candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

function joinNatural(parts: string[]): string {
  const cleaned = parts.filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] || '';
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function findPeriodStartISOs(entries: any[]): string[] {
  const starts: string[] = [];
  let previousFlow = 0;
  for (const entry of entries) {
    const flow = metricValue(entry, 'flow');
    const flowValue = typeof flow === 'number' ? flow : 0;
    if (flowValue > 0 && previousFlow <= 0 && typeof entry?.dateISO === 'string') starts.push(entry.dateISO);
    previousFlow = flowValue;
  }
  return starts;
}

function describeRelativeStart(diffDays: number): string | null {
  if (Math.abs(diffDays) < 2) return null;
  return diffDays > 0
    ? `This looks about ${formatCountLabel(Math.abs(diffDays), 'day')} later than your recent average.`
    : `This looks about ${formatCountLabel(Math.abs(diffDays), 'day')} earlier than your recent average.`;
}

function findMoodCompanionSignal(entries: any[]) {
  const candidateMetrics: DashboardMetric[] = ['sleep', 'stress', 'energy', 'pain'];
  let best: { metric: DashboardMetric; gap: number; direction: string } | null = null;
  for (const metric of candidateMetrics) {
    const points = entries
      .map((entry) => ({ mood: metricValue(entry, 'mood'), value: metricValue(entry, metric) }))
      .filter((point): point is { mood: number; value: number } => typeof point.mood === 'number' && typeof point.value === 'number');
    if (points.length < 4) continue;
    const high = points.filter((point) => point.value >= 7).map((point) => point.mood);
    const low = points.filter((point) => point.value <= 4).map((point) => point.mood);
    const highAvg = average(high);
    const lowAvg = average(low);
    if (highAvg == null || lowAvg == null) continue;
    const gap = highAvg - lowAvg;
    if (Math.abs(gap) < 1) continue;
    let direction = '';
    if (metric === 'sleep') direction = gap > 0 ? 'Mood has tended to be steadier after better sleep.' : 'Mood has tended to dip after better sleep.';
    else if (metric === 'stress') direction = gap < 0 ? 'Mood has tended to be lower on higher-stress days.' : 'Mood has tended to lift on higher-stress days.';
    else if (metric === 'energy') direction = gap > 0 ? 'Mood has tended to be better on higher-energy days.' : 'Mood has tended to dip on higher-energy days.';
    else direction = gap < 0 ? 'Mood has tended to dip on higher-pain days.' : 'Mood has tended to lift on higher-pain days.';
    const candidate = { metric, gap: Math.abs(gap), direction };
    if (!best || candidate.gap > best.gap) best = candidate;
  }
  return best;
}
function pickTopMetricDelta(entries: any[], metrics: DashboardMetric[]): { metric: DashboardMetric; beforeAvg: number; afterAvg: number; delta: number } | null {
  let best: { metric: DashboardMetric; beforeAvg: number; afterAvg: number; delta: number } | null = null;
  for (const metric of metrics) {
    const values = entries.map((entry) => metricValue(entry, metric)).filter((value): value is number => typeof value === 'number');
    if (values.length < 4) continue;
    const midpoint = Math.max(2, Math.floor(values.length / 2));
    const beforeAvg = average(values.slice(0, midpoint));
    const afterAvg = average(values.slice(midpoint));
    if (beforeAvg == null || afterAvg == null) continue;
    const delta = afterAvg - beforeAvg;
    if (Math.abs(delta) < 1) continue;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { metric, beforeAvg, afterAvg, delta };
  }
  return best;
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
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, options.hasHistory);

  addCard({
    id: 'building-rhythm',
    title: 'You’re building your rhythm',
    body: 'A few more check-ins will help this start turning into personalised guidance.',
    cta: { label: 'Keep going', action: 'check-in' },
    priority: 5,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, inFirstDays);

  addCard({
    id: 'first-week-taking-shape',
    title: 'Your first week is taking shape',
    body: 'You have enough check-ins now for early patterns to feel a little more trustworthy.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 6,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, inFirstWeekShape);

  addCard({
    id: 'patterns-starting-to-settle',
    title: 'Your patterns are starting to settle',
    body: 'Patterns are repeating a bit more now, so the app can be calmer and more specific.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 7,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, settlingStage);

  addCard({
    id: 'rhythm-getting-easier',
    title: 'Your rhythm is getting easier to read',
    body: 'With more check-ins in place, the app can start making steadier sense of what tends to shift together.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 8,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, easierReadStage);

  addCard({
    id: 'stronger-baseline',
    title: 'You have built a stronger baseline',
    body: 'With a stronger baseline in place, small changes and experiments should be easier to interpret.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 9,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
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
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
  }, quickCheckinStage);

  addCard({
    id: 'patterns-take-time',
    title: 'Patterns take a little time',
    body: 'You may notice early reflections quickly, but stronger patterns usually build over a few weeks of check-ins. There’s no need to get everything perfect.',
    cta: { label: 'View Insights', action: 'navigate', screen: 'insights' },
    priority: 13,
    icon: <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />,
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
      <div className="eb-card-header w-full">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-[rgba(0,0,0,0.65)]">{subtitle}</p>
        </div>
        <div className="eb-icon-frame">
          <div className="text-[rgb(var(--color-primary))]">{icon}</div>
        </div>
      </div>
      {cta ? (
        <span className="mt-auto pt-3 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))]">
          {cta} <ArrowRight className="w-4 h-4" />
        </span>
      ) : null}
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
  const { history: experimentHistory } = useExperimentHistory();
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
  const cycleTrust = useMemo(() => getCycleTrustModel(entriesSorted as any, userData, todayISO), [entriesSorted, userData, todayISO]);
  const highestMoment = useMemo(() => getHighestPriorityMoment(todayISO), [todayISO, entriesSorted.length, momentRefresh]);


  const dashboardRhythm = useMemo(() => {
    if (userData.cycleTrackingMode !== 'cycle') {
      return {
        title: heroModel.rhythmTitle,
        headline: heroModel.rhythmHeadline,
        body: heroModel.rhythmBody,
      };
    }
    if (!cycleTrust.hasCycleAnchor) {
      return {
        title: 'Your cycle is still learning',
        headline: 'Still learning your cycle',
        body: 'Log your first period or mark a cycle start in Calendar → Edit cycle before the app starts estimating phase and future timing.',
      };
    }
    if (cycleTrust.predictionTrust === 'stale') {
      return {
        title: 'Your rhythm lately',
        headline: 'Estimated current phase',
        body: 'Rhythm is waiting for a fresh cycle anchor after a longer gap in logging before it resumes forward predictions.',
      };
    }
    if (cycleTrust.phaseTrust !== 'confirmed') {
      const base = typeof heroModel.rhythmHeadline === 'string' ? heroModel.rhythmHeadline.replace(/^You’re in\s+/u, '').trim() : 'current phase';
      return {
        title: heroModel.rhythmTitle,
        headline: `Estimated ${base}`,
        body: cycleTrust.predictionTrust === 'early'
          ? 'Early estimate based on your latest cycle start. A few more cycles will help the timing settle.'
          : 'Estimated from your recent logs and cycle timing.',
      };
    }
    return {
      title: heroModel.rhythmTitle,
      headline: heroModel.rhythmHeadline,
      body: heroModel.rhythmBody,
    };
  }, [userData.cycleTrackingMode, cycleTrust, heroModel]);

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

  const nextStep = useMemo<NextStepRecommendation>(() => {
    const fallbackBody = insightsRemaining === 1
      ? 'A quick check-in today will help your patterns start to emerge.'
      : `A few more check-ins will help your patterns start to emerge. ${insightsRemaining} ${insightsRemaining === 1 ? 'day' : 'days'} to go for your first insights.`;

    if (!insightsReady) {
      return {
        body: fallbackBody,
        actionLabel: checkedInToday ? "Open today’s check-in" : "Do today’s check-in",
        action: 'check-in',
      };
    }

    const last7 = filterByDays(entriesSorted, 7, todayISO);
    const last14 = filterByDays(entriesSorted, 14, todayISO);
    const last35 = filterByDays(entriesSorted, 35, todayISO);
    const previous28 = last35.slice(0, Math.max(0, last35.length - last7.length));
    const enabledMetricCandidates = Array.from(new Set<DashboardMetric>([
      'mood',
      ...(userData.enabledModules || []).filter((key): key is DashboardMetric => NEXT_STEP_SWING_METRICS.includes(key as DashboardMetric)),
    ]));

    const candidates: Array<NextStepRecommendation & { score: number }> = [];
    const pushCandidate = (score: number, recommendation: NextStepRecommendation) => {
      candidates.push({ score, ...recommendation });
    };

    const activeExperiment = experiment && !(experiment as any)?.outcome?.completedAtISO ? experiment as any : null;
    if (activeExperiment) {
      const durationDays = Math.max(1, Number(activeExperiment.durationDays || 3));
      const elapsedDays = Math.max(0, dayDiff(activeExperiment.startDateISO || todayISO, todayISO)) + 1;
      const daysLeft = Math.max(0, durationDays - elapsedDays);
      const experimentMetrics = (Array.isArray(activeExperiment.metrics) ? activeExperiment.metrics : [])
        .filter((metric): metric is DashboardMetric => typeof metric === 'string' && metric in METRIC_LABELS) as DashboardMetric[];
      const experimentWindow = entriesSorted.filter((entry: any) => String(entry?.dateISO || '') >= String(activeExperiment.startDateISO || todayISO));
      const baselineWindow = entriesSorted.filter((entry: any) => String(entry?.dateISO || '') < String(activeExperiment.startDateISO || todayISO)).slice(-7);

      if (!checkedInToday) {
        pushCandidate(94, {
          body: `Your ${activeExperiment.title || 'experiment'} is still running. Today’s check-in will make it easier to see whether anything is starting to shift.`,
          actionLabel: 'Do today’s check-in',
          action: 'check-in',
        });
      } else {
        let experimentBody = `Your ${activeExperiment.title || 'experiment'} is running${daysLeft > 0 ? ` with about ${formatCountLabel(daysLeft, 'day')} left` : ''}. Open Insights for the fuller picture.`;
        let experimentScore = 90;

        const bestMetric = experimentMetrics.reduce<{ metric: DashboardMetric; baselineAvg: number; duringAvg: number; delta: number } | null>((best, metric) => {
          const baselineValues = baselineWindow.map((entry: any) => metricValue(entry, metric)).filter((value): value is number => typeof value === 'number');
          const duringValues = experimentWindow.map((entry: any) => metricValue(entry, metric)).filter((value): value is number => typeof value === 'number');
          const baselineAvg = average(baselineValues);
          const duringAvg = average(duringValues);
          if (baselineAvg == null || duringAvg == null || duringValues.length < 2) return best;
          const delta = duringAvg - baselineAvg;
          const candidate = { metric, baselineAvg, duringAvg, delta };
          if (!best || Math.abs(delta) > Math.abs(best.delta)) return candidate;
          return best;
        }, null);

        if (bestMetric && Math.abs(bestMetric.delta) >= 0.8) {
          const directionWord = bestMetric.delta > 0 ? 'higher' : 'lower';
          experimentBody = `Your ${activeExperiment.title || 'experiment'} is showing an early shift in ${metricSentenceLabel(bestMetric.metric)} so far, averaging about ${formatPoints(Math.abs(bestMetric.delta))} point${Math.abs(bestMetric.delta) >= 1.5 ? 's' : ''} ${directionWord} than the days just before it.`;
          experimentScore = 98;
        } else if (experimentWindow.length >= 2) {
          experimentBody = `Your ${activeExperiment.title || 'experiment'} is underway. You have ${formatCountLabel(experimentWindow.length, 'logged day')} so far, so the pattern is starting to take shape even if it is still early.`;
          experimentScore = 92;
        }

        pushCandidate(experimentScore, {
          body: experimentBody,
          actionLabel: 'Open Insights',
          action: 'navigate',
          screen: 'insights',
        });
      }
    }

    const latestCompletedExperiment = experimentHistory.find((item: any) => typeof item?.outcome?.completedAtISO === 'string' && item.outcome.completedAtISO);
    const completedAgo = latestCompletedExperiment?.outcome?.completedAtISO
      ? dayDiff(String(latestCompletedExperiment.outcome.completedAtISO), todayISO)
      : null;

    if (latestCompletedExperiment && completedAgo != null && completedAgo >= 0 && completedAgo <= 7) {
      const digestQuick = latestCompletedExperiment?.outcome?.digest?.quick || latestCompletedExperiment?.outcome?.digest;
      const topDigestMetric = Array.isArray(digestQuick?.metrics)
        ? [...digestQuick.metrics]
            .filter((metric: any) => typeof metric?.delta === 'number' && typeof metric?.key === 'string')
            .sort((a: any, b: any) => Math.abs(Number(b?.delta || 0)) - Math.abs(Number(a?.delta || 0)))[0]
        : null;
      const previousRun = findPreviousExperimentRun(experimentHistory as any, latestCompletedExperiment as any);
      const comparisonLine = compareExperimentOutcomes(previousRun?.outcome?.status, latestCompletedExperiment?.outcome?.status);
      const status = String(latestCompletedExperiment?.outcome?.status || '');

      let completedBody = `${latestCompletedExperiment.title || 'Your recent experiment'} has just finished.`;
      let completedScore = 91;
      if (topDigestMetric && Math.abs(Number(topDigestMetric.delta || 0)) >= 0.8) {
        const delta = Number(topDigestMetric.delta || 0);
        const directionWord = delta > 0 ? 'higher' : 'lower';
        completedBody = `${latestCompletedExperiment.title || 'Your recent experiment'} just finished. Its clearest shift was ${String(topDigestMetric.label || METRIC_LABELS[topDigestMetric.key as DashboardMetric] || 'that signal').toLowerCase()}, which ran about ${formatPoints(Math.abs(delta))} point${Math.abs(delta) >= 1.5 ? 's' : ''} ${directionWord} during the test.`;
        completedScore = 97;
      } else if (status === 'helped') {
        completedBody = `${latestCompletedExperiment.title || 'Your recent experiment'} just finished and looked genuinely helpful overall.`;
        completedScore = 94;
      } else if (status === 'notReally') {
        completedBody = `${latestCompletedExperiment.title || 'Your recent experiment'} just finished, but it did not show a strong enough shift to look clearly helpful.`;
      }
      if (comparisonLine) completedBody += ` ${comparisonLine}`;

      pushCandidate(completedScore, {
        body: completedBody,
        actionLabel: 'Review results',
        action: 'navigate',
        screen: 'insights',
      });
    }

    const recentPhaseChange = getRecentPhaseChange();
    if (userData.cycleTrackingMode === 'cycle' && recentPhaseChange && !recentPhaseChange.dismissed) {
      const changedDaysAgo = dayDiff(recentPhaseChange.changedAt, todayISO);
      if (changedDaysAgo >= 0 && changedDaysAgo <= 3) {
        const changedAtIndex = entriesSorted.findIndex((entry: any) => String(entry?.dateISO || '') >= recentPhaseChange.changedAt);
        const beforeShift = changedAtIndex > 0 ? entriesSorted.slice(Math.max(0, changedAtIndex - 4), changedAtIndex) : [];
        const afterShift = changedAtIndex >= 0 ? entriesSorted.slice(changedAtIndex, changedAtIndex + 4) : last7;
        const topDrivers = pickTopMetricDeltasForWindows(beforeShift, afterShift, enabledMetricCandidates.filter((metric) => metric !== 'flow'), 2);
        let phaseBody = `Your rhythm looks to have shifted into ${formatPhaseName(recentPhaseChange.phase)}.`;
        let phaseScore = 88;
        if (topDrivers.length > 0) {
          const driverText = topDrivers.map((driver) => `${metricSentenceLabel(driver.metric)} ${driver.delta > 0 ? 'rose' : 'eased'}`);
          phaseBody += ` ${joinNatural(driverText)} across your recent check-ins, which is part of why the app inferred the change.`;
          phaseScore = 93;
        } else {
          const recentFlow = afterShift.some((entry: any) => {
            const flow = metricValue(entry, 'flow');
            return typeof flow === 'number' && flow > 0;
          });
          if (recentFlow) {
            phaseBody += ' Recent bleeding is one reason the app inferred the change.';
            phaseScore = 90;
          } else {
            phaseBody += ' The recent signal mix looks different enough that Rhythm is probably the best place to look next.';
          }
        }
        pushCandidate(phaseScore, {
          body: phaseBody,
          actionLabel: 'Open Rhythm',
          action: 'navigate',
          screen: 'rhythm',
        });
      }
    }

    const todayEntry = entriesSorted.find((e: any) => (e as any).dateISO === todayISO);
    const todayFlow = metricValue(todayEntry as any, 'flow');
    const menstrualToday = userData.cycleTrackingMode === 'cycle' && (todayPhase === 'Menstrual' || (typeof todayFlow === 'number' && todayFlow > 0));
    if (menstrualToday) {
      const periodStarts = findPeriodStartISOs(entriesSorted);
      const currentStartISO = [...periodStarts].reverse().find((iso) => iso <= todayISO) || null;
      const previousStartISO = currentStartISO ? [...periodStarts].reverse().find((iso) => iso < currentStartISO) || null : null;
      const earlierStarts = previousStartISO ? periodStarts.filter((iso) => iso < previousStartISO) : [];
      const recentCycleLengths = previousStartISO ? earlierStarts.slice(-3).map((iso) => dayDiff(iso, previousStartISO)).filter((days) => days > 0 && days < 90) : [];
      const avgRecentCycleLength = recentCycleLengths.length ? average(recentCycleLengths) : null;
      const currentCycleLength = currentStartISO && previousStartISO ? dayDiff(previousStartISO, currentStartISO) : null;
      const relativeStart = currentCycleLength != null && avgRecentCycleLength != null ? describeRelativeStart(currentCycleLength - avgRecentCycleLength) : null;

      let periodBody = 'You appear to be in your reset window today.';
      let periodScore = 87;
      if (currentStartISO && previousStartISO) {
        const currentWindow = entriesSorted.filter((entry: any) => String(entry?.dateISO || '') >= currentStartISO).slice(0, 3);
        const previousWindow = entriesSorted.filter((entry: any) => String(entry?.dateISO || '') >= previousStartISO && String(entry?.dateISO || '') < currentStartISO).slice(0, 3);
        const currentPain = average(currentWindow.map((entry) => metricValue(entry as any, 'pain')).filter((value): value is number => typeof value === 'number'));
        const previousPain = average(previousWindow.map((entry) => metricValue(entry as any, 'pain')).filter((value): value is number => typeof value === 'number'));
        const currentFlowAvg = average(currentWindow.map((entry) => metricValue(entry as any, 'flow')).filter((value): value is number => typeof value === 'number'));
        const previousFlowAvg = average(previousWindow.map((entry) => metricValue(entry as any, 'flow')).filter((value): value is number => typeof value === 'number'));
        const comparisons: string[] = [];
        if (currentFlowAvg != null && previousFlowAvg != null && Math.abs(currentFlowAvg - previousFlowAvg) >= 1) {
          comparisons.push(`flow looks ${currentFlowAvg > previousFlowAvg ? 'heavier' : 'lighter'} than your last reset so far`);
          periodScore = 92;
        }
        if (currentPain != null && previousPain != null && Math.abs(currentPain - previousPain) >= 1) {
          comparisons.push(`pain looks ${currentPain > previousPain ? 'stronger' : 'steadier'} than last time`);
          periodScore = Math.max(periodScore, 91);
        }
        if (comparisons.length > 0) periodBody += ` So far, ${joinNatural(comparisons)}.`;
        else if (relativeStart) periodBody += ` ${relativeStart}`;
        else periodBody += ' Pain, energy, and bleeding are likely to be the clearest things to watch over the next couple of days.';
      } else {
        periodBody += ' Pain, energy, and bleeding are likely to be the clearest things to watch over the next couple of days.';
      }
      pushCandidate(periodScore, {
        body: periodBody,
        actionLabel: 'Open Rhythm',
        action: 'navigate',
        screen: 'rhythm',
      });
    }

    const recentSwing = getRecentSwingSignal(last7 as any[], enabledMetricCandidates);
    if (recentSwing) {
      const previousValues = previous28
        .map((entry) => metricValue(entry as any, recentSwing.metric))
        .filter((value): value is number => typeof value === 'number');
      const recentValues = last7
        .map((entry) => metricValue(entry as any, recentSwing.metric))
        .filter((value): value is number => typeof value === 'number');
      const previousRange = previousValues.length >= 3 ? Math.max(...previousValues) - Math.min(...previousValues) : null;
      const recentRange = recentValues.length >= 3 ? Math.max(...recentValues) - Math.min(...recentValues) : null;
      const previousAvg = average(previousValues);
      const recentAvg = average(recentValues);
      let swingBody = `${recentSwing.label} has been swinging more sharply over the last week and looks like one of your strongest recent shifts.`;
      let swingScore = 82;
      if (recentRange != null && previousRange != null && recentRange > previousRange + 1) {
        swingBody = `${recentSwing.label} has swung more sharply this week than it did over the rest of the last month.`;
        swingScore = 89;
        if (recentAvg != null && previousAvg != null && Math.abs(recentAvg - previousAvg) >= 1) {
          swingBody += ` It is also sitting about ${formatPoints(Math.abs(recentAvg - previousAvg))} point${Math.abs(recentAvg - previousAvg) >= 1.5 ? 's' : ''} ${describeDirectionalDelta(recentSwing.metric, recentAvg - previousAvg)} than your recent baseline.`;
          swingScore = 91;
        }
      } else if (recentAvg != null && previousAvg != null && Math.abs(recentAvg - previousAvg) >= 1) {
        swingBody = `${recentSwing.label} is one of your clearest recent shifts, sitting about ${formatPoints(Math.abs(recentAvg - previousAvg))} point${Math.abs(recentAvg - previousAvg) >= 1.5 ? 's' : ''} ${describeDirectionalDelta(recentSwing.metric, recentAvg - previousAvg)} than your recent baseline.`;
        swingScore = 87;
      }
      pushCandidate(swingScore, {
        body: swingBody,
        actionLabel: 'Open Insights',
        action: 'navigate',
        screen: 'insights',
      });
    }

    const sleepEnergyPoints = last7
      .map((e) => ({
        sleep: metricValue(e as any, 'sleep'),
        energy: metricValue(e as any, 'energy'),
      }))
      .filter((p) => typeof p.sleep === 'number' && typeof p.energy === 'number') as Array<{ sleep: number; energy: number }>;

    if (sleepEnergyPoints.length >= 4) {
      const lowSleepEnergy = sleepEnergyPoints.filter((p) => p.sleep <= 5).map((p) => p.energy);
      const highSleepEnergy = sleepEnergyPoints.filter((p) => p.sleep >= 7).map((p) => p.energy);
      const lowerSleepMean = average(lowSleepEnergy);
      const higherSleepMean = average(highSleepEnergy);

      if (lowerSleepMean != null && higherSleepMean != null && Math.abs(higherSleepMean - lowerSleepMean) >= 1) {
        const gap = Math.abs(higherSleepMean - lowerSleepMean);
        const dayType = higherSleepMean > lowerSleepMean ? 'lower-sleep days' : 'higher-sleep days';
        const resultDirection = higherSleepMean > lowerSleepMean ? 'lower' : 'higher';
        pushCandidate(gap >= 1.8 ? 85 : 79, {
          body: `Sleep and energy are moving together quite clearly right now. On ${dayType}, energy has been about ${formatPoints(gap)} point${gap >= 1.5 ? 's' : ''} ${resultDirection}.`,
          actionLabel: 'Open Insights',
          action: 'navigate',
          screen: 'insights',
        });
      }
    }

    const recentMoodEntries = last14
      .map((entry) => metricValue(entry as any, 'mood'))
      .filter((value): value is number => typeof value === 'number');
    const previousMoodEntries = previous28
      .map((entry) => metricValue(entry as any, 'mood'))
      .filter((value): value is number => typeof value === 'number');
    if (recentMoodEntries.length >= 5) {
      const moodRange = Math.max(...recentMoodEntries) - Math.min(...recentMoodEntries);
      const previousMoodRange = previousMoodEntries.length >= 5 ? Math.max(...previousMoodEntries) - Math.min(...previousMoodEntries) : null;
      if (moodRange >= 4) {
        const moodLink = findMoodCompanionSignal(last14 as any[]);
        let body = 'Your recent mood pattern has been moving around more than usual.';
        let moodScore = 74;
        if (previousMoodRange != null && moodRange > previousMoodRange + 1) {
          body = `Your recent mood pattern has been more up-and-down than it was over the rest of the last month.`;
          moodScore = 81;
        }
        if (moodLink?.direction) body += ` ${moodLink.direction}`;
        else body += ' Insights may be the best place to look next if you want to see what tends to shift with it.';
        pushCandidate(moodScore, {
          body,
          actionLabel: 'Open Insights',
          action: 'navigate',
          screen: 'insights',
        });
      }
    }

    const phaseHeadline = typeof dashboardRhythm.headline === 'string' ? dashboardRhythm.headline.toLowerCase() : '';
    const shouldPointToRhythm = userData.cycleTrackingMode === 'cycle' && (
      cycleTrust.phaseTrust !== 'confirmed'
      || cycleTrust.predictionTrust !== 'established'
      || phaseHeadline.includes('estimated')
      || Boolean(todayPhase)
    );

    if (shouldPointToRhythm) {
      const clarityHints: string[] = [];
      const recentFlowLogged = last7.some((entry) => {
        const flow = metricValue(entry as any, 'flow');
        return typeof flow === 'number' && flow > 0;
      });
      if (userData.cycleTrackingMode === 'cycle' && !recentFlowLogged) clarityHints.push('bleeding or spotting');
      const painRecent = last7.some((entry) => typeof metricValue(entry as any, 'pain') === 'number' || typeof metricValue(entry as any, 'cramps') === 'number');
      if (!painRecent) clarityHints.push('pain or cramps');
      const sleepRecent = last7.some((entry) => typeof metricValue(entry as any, 'sleep') === 'number');
      if (!sleepRecent) clarityHints.push('sleep');
      const energyRecent = last7.some((entry) => typeof metricValue(entry as any, 'energy') === 'number');
      if (!energyRecent) clarityHints.push('energy');
      const hintText = clarityHints.length ? ` Logging ${joinNatural(clarityHints.slice(0, 2))} over the next couple of days should help.` : '';
      if (checkedInToday) {
        pushCandidate(68, {
          body: `Your rhythm looks a little harder to place right now. The recent signal mix points in more than one direction.${hintText}`,
          actionLabel: 'Open Rhythm',
          action: 'navigate',
          screen: 'rhythm',
        });
      } else {
        pushCandidate(72, {
          body: `Your rhythm looks a little harder to place right now. A check-in today should make the next few days clearer.${hintText}`,
          actionLabel: 'Do today’s check-in',
          action: 'check-in',
        });
      }
    }

    if (candidates.length === 0) {
      return {
        body: 'You have enough recent data for a stronger read. Insights may be the best place to look next.',
        actionLabel: 'Open Insights',
        action: 'navigate',
        screen: 'insights',
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    const { score: _score, ...winner } = candidates[0];
    return winner;
  }, [
    insightsRemaining,
    insightsReady,
    checkedInToday,
    entriesSorted,
    todayISO,
    dashboardRhythm.headline,
    userData.cycleTrackingMode,
    userData.enabledModules,
    cycleTrust.phaseTrust,
    cycleTrust.predictionTrust,
    todayPhase,
    experiment,
    experimentHistory,
  ]);

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
        <div className="eb-page-header">
          <h1 className="eb-page-title">Welcome back{userName ? `, ${userName}` : ''}</h1>
          <p className="eb-page-support">{todayLabel}</p>
        </div>


        {/* HERO: Symptom tracking */}

        <div className="eb-card eb-hero eb-hero-rich eb-hero-lg eb-hero-on-dark relative">
          {/* Calendar icon */}
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="absolute top-4 right-4 z-10 eb-icon-frame eb-icon-frame--hero opacity-80 hover:opacity-100 transition"
            title="Calendar"
          >
            <Calendar className="w-5 h-5" />
          </button>


          <div className="eb-hero-header mb-3">
            <div className="eb-hero-header-main">
              <h3 className="eb-hero-title text-white">Understand your patterns</h3>
              <p className="eb-hero-subtitle text-white mt-1">The app that explains your hormonal patterns.</p>
            </div>
          </div>

          {/* Today in your rhythm */}
          <div className="eb-inset eb-hero-panel rounded-2xl p-4">
            <div className="eb-hero-panel-label">{dashboardRhythm.title}</div>
            {dashboardRhythm.headline ? (
              <div className="mt-1 text-[1.02rem] font-semibold tracking-[-0.015em] text-[rgba(0,0,0,0.9)]">{dashboardRhythm.headline}</div>
            ) : null}
            <div className="mt-2 eb-hero-panel-body">{dashboardRhythm.body}</div>
            {rhythmPhaseState && (rhythmPhaseState as any).gapMode === 'stale' ? (
              <div className="mt-2 eb-hero-panel-note">Estimated current phase after a longer gap in logging. A few more check-ins will help firm this up again.</div>
            ) : rhythmPhaseState && (rhythmPhaseState as any).gapMode === 'catchup' ? (
              <div className="mt-2 eb-hero-panel-note">Estimated current phase after a gap in logging. Rhythm has caught up using elapsed time and recent anchors.</div>
            ) : null}
          </div>

          {/* How you've been */}
          <div className="mt-4 eb-inset eb-hero-panel rounded-2xl p-4">
            <div className="eb-hero-panel-label">{heroModel.howTitle}</div>
            <div className="mt-2 space-y-1.5">
              {heroModel.howLines.map((line: string, i: number) => (
                <div key={i} className="eb-hero-panel-body">
                  {line}
                </div>
              ))}
            </div>
            {heroModel.relationshipLine ? (
              <div className="mt-3 eb-hero-panel-body">
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
          <div className="eb-card eb-card-soft">
            <div className="eb-card-header w-full">
              <div className="min-w-0 flex-1">
                <h3 className="mb-1">{guideCard.title}</h3>
              </div>
              <div className="eb-icon-frame">
                {guideCard.icon}
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-sm text-[rgba(0,0,0,0.72)]">{guideCard.body}</p>
              {guideCard.supporting ? (
                <p className="text-sm text-[rgba(0,0,0,0.60)] mt-2">{guideCard.supporting}</p>
              ) : null}

              <div className="mt-4 flex justify-end">
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
                  className={`eb-btn ${guideCard.id === 'history-saved' ? 'eb-btn-primary w-auto max-w-full whitespace-normal text-center px-4' : 'eb-btn-secondary sm:w-auto'} ${guideCard.id === 'history-saved' ? '' : 'w-full justify-center'}`}
                >
                  {guideCard.cta.label}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="eb-card eb-card-soft">
          <div className="eb-card-header">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1">{checkedInToday ? 'Today is logged' : 'Today is ready for a check-in'}</h3>
            </div>
            <div className="eb-icon-frame">
              <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-sm text-[rgba(0,0,0,0.68)]">
              {checkedInToday
                ? 'You have already logged today. Reopen it if anything changed.'
                : 'A quick check-in today helps the app make better sense of what matters right now.'}
            </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Status</div>
                  <div className="mt-1 font-semibold">{checkedInToday ? 'Logged today' : 'Not logged yet'}</div>
                </div>
                <div className="eb-inset rounded-2xl p-3">
                  <div className="text-xs text-[rgb(var(--color-text-secondary))]">Days tracked</div>
                  <div className="mt-1 font-semibold">{daysTracked}</div>
                </div>
                {experiment && !(experiment as any)?.outcome?.completedAtISO ? (
                  <div className="eb-inset rounded-2xl p-3 col-span-2">
                    <div className="text-xs text-[rgb(var(--color-text-secondary))]">Active experiment</div>
                    <div className="mt-1 font-semibold">{(experiment as any)?.title || 'Your experiment'}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
                <button type="button" className="eb-btn-primary" onClick={() => onOpenCheckIn(todayISO)}>
                  {checkedInToday ? "Open today’s check-in" : "Do today’s check-in"}
                </button>
                <button type="button" className="eb-btn-secondary" onClick={() => onNavigate('calendar')}>
                  Open calendar
                </button>
              </div>
          </div>
        </div>

        {/* Restore from backup nudge (only when there is no data yet) */}
        {daysTracked === 0 ? (
          <div className="eb-card eb-card-soft">
            <div className="eb-card-header">
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


        <div className="eb-card eb-card-soft">
          <div className="eb-card-header w-full">
            <div className="min-w-0 flex-1">
              <h3 className="mb-2">Most useful next step</h3>
            </div>
            <div className="eb-icon-frame">
              <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
          </div>

          <p className="text-sm text-[rgba(0,0,0,0.75)]">
            {nextStep.body}
          </p>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (nextStep.action === 'check-in') {
                  onOpenCheckIn(todayISO);
                  return;
                }
                onNavigate(nextStep.screen);
              }}
              className="eb-btn eb-btn-soft-choice inline-flex items-center justify-center"
            >
              {nextStep.actionLabel}
            </button>
          </div>
        </div>

        <div className="eb-card">
          <div className="eb-card-header mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1">Your week at a glance</h3>
              <p className="text-xs text-[rgb(var(--color-text-secondary))]">A small trend snapshot. Pick 3 metrics to show.</p>
            </div>
            <div className="eb-icon-frame">
              <BookOpen className="w-5 h-5 text-[rgb(var(--color-primary))]" />
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
                className="eb-input !py-2 !px-3 !text-sm flex-1 bg-[color-mix(in_srgb,rgb(var(--color-primary-light))_28%,white)] border-[color-mix(in_srgb,rgb(var(--color-primary-dark))_22%,white)]"
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
          <div className="eb-card-header w-full">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1">Tip for today</h3>
            </div>
            <div className="eb-icon-frame">
              <Lightbulb className="w-5 h-5" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTipOffset((v) => v + 1)}
                className="text-sm text-[rgb(var(--color-primary))] hover:underline"
              >
                Another tip
              </button>
            </div>

            <p className="text-sm font-semibold mt-2">{tip.title}</p>

            <p className="text-sm text-[rgba(0,0,0,0.75)] mt-2">{tip.body}</p>

            {tip.cta ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (tip.cta?.screen === 'check-in') onOpenCheckIn(todayISO);
                    else onNavigate(tip.cta.screen);
                  }}
                  className="inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))] hover:underline"
                >
                  {tip.cta.label} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
