import React, { useMemo } from 'react';
import { Calendar, TrendingUp, Sparkles, ArrowRight, ChevronRight, Lightbulb } from 'lucide-react';
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
import { useEntries } from '../lib/appStore';
import { computeCycleStats, estimatePhaseByFlow, filterByDays, isoToday, sortByDateAsc } from '../lib/analytics';
import { getDailyTip } from '../lib/tips';

interface DashboardProps {
  userName: string;
  userGoal: UserGoal | null;
  userData: UserData;
  onNavigate: (screen: string) => void;
  onUpdateUserData: (updater: ((prev: UserData) => UserData) | UserData) => void;
  onOpenCheckIn: (dateISO?: string) => void;
}

function prettyGoal(goal: UserGoal | null) {
  if (!goal) return 'Cycle Health';
  const map: Record<UserGoal, string> = {
    'cycle-health': 'Cycle Health',
    perimenopause: 'Perimenopause',
    'post-contraception': 'Post contraception',
    wellbeing: 'Wellbeing',
  };
  return map[goal] ?? 'Cycle Health';
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
  const { entries: entriesAll, upsertEntry } = useEntries();
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

  const goalLabel = prettyGoal(userGoal);

  const [showGoalPicker, setShowGoalPicker] = React.useState(false);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted), [entriesSorted]);

  const todayPhase = useMemo(() => {
    if (userData.cycleTrackingMode !== 'cycle') return null;
    return estimatePhaseByFlow(todayISO, entriesSorted);
  }, [userData.cycleTrackingMode, todayISO, entriesSorted]);

  function dayPhaseKey(p: any) {
    if (p === 'Ovulatory') return 'Ovulation';
    return p;
  }

  const [tipOffset, setTipOffset] = React.useState(0);

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
    return d.toISOString().slice(0, 10);
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
      dateISOs.push(d.toISOString().slice(0, 10));
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

  const showCycleBubble = userData.cycleTrackingMode === 'cycle' && (userData.showCycleBubble ?? true);
  const [cycleModalOpen, setCycleModalOpen] = React.useState(false);

  const avgCycleText = cycleStats.avgLength ? `${cycleStats.avgLength} days avg` : 'Not enough data yet';

  // NOTE: You asked to move quick log items to Check-in.
  // This modal remains informational only (stats + prediction).
  // If you still want overrides here too, we can add them back cleanly later.
  const closeGoalPicker = () => setShowGoalPicker(false);

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
            className="absolute top-4 right-4 opacity-80 hover:opacity-100 transition"
            title="Calendar"
          >
            <Calendar className="w-5 h-5" />
          </button>

          <h3 className="mb-1 text-lg font-semibold eb-hero-on-dark text-white">Symptom tracking</h3>

          <p className="text-sm eb-hero-on-dark-muted mb-5 text-white">
            {userData.cycleTrackingMode === 'no-cycle'
              ? 'Cycle features are off, but you can still track symptoms and patterns.'
              : 'Add bleeding or spotting (optional) to unlock cycle-phase insights.'}
          </p>

          {/* Cycle length bubble */}
          {showCycleBubble && (
            <button
              type="button"
              onClick={() => setCycleModalOpen(true)}
              // On mobile, keep this in the normal flow so it never overlaps the hero text.
              // On sm+ screens, we float it up near the calendar icon.
              className="w-full sm:w-auto sm:absolute sm:left-auto sm:right-14 sm:top-4 rounded-full bg-[rgba(255,255,255,0.18)] border border-[rgba(255,255,255,0.25)] px-3 py-1 text-sm eb-hero-on-dark hover:bg-[rgba(255,255,255,0.24)] transition flex items-center justify-center mb-4 sm:mb-0"
              title="Cycle length"
            >
              <span className="font-medium">Cycle length</span>
              <span className="mx-2 opacity-70">•</span>
              <span className="font-semibold">{avgCycleText}</span>
            </button>
          )}

          {/* Today + Goal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onOpenCheckIn(todayISO)}
              className="eb-inset rounded-xl p-4 text-left w-full hover:opacity-95 transition group cursor-pointer shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="eb-inset-label">Today</div>
                  <div className="eb-inset-value">
                    {checkedInToday ? 'Checked in' : 'Not checked in yet'}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-70 group-hover:opacity-100 transition" />
              </div>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowGoalPicker((v) => !v)}
                className="eb-inset rounded-xl p-4 text-left w-full hover:opacity-95 transition group cursor-pointer shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="eb-inset-label">Goal</div>
                    <div className="eb-inset-value">{goalLabel}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-70 group-hover:opacity-100 transition" />
                </div>
              </button>

              {showGoalPicker && (
                <div
                  className="absolute left-0 right-0 mt-2 z-20 bg-white rounded-2xl shadow-lg border border-[rgba(0,0,0,0.08)] p-3"
                  role="menu"
                >
                  <div className="text-xs text-[rgb(var(--color-text-secondary))] mb-2">Change goal</div>
                  <div className="grid gap-2">
                    {([
                      { id: 'cycle-health', label: 'Cycle Health' },
                      { id: 'perimenopause', label: 'Perimenopause' },
                      { id: 'post-contraception', label: 'Post contraception' },
                      { id: 'wellbeing', label: 'Wellbeing' },
                    ] as const).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 rounded-xl transition ${
                          userData.goal === g.id
                            ? 'bg-[rgb(var(--color-primary)/0.12)]'
                            : 'hover:bg-[rgba(0,0,0,0.04)]'
                        }`}
                        onClick={() => {
                          onUpdateUserData((prev) => ({ ...prev, goal: g.id }));
                          closeGoalPicker();
                        }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <DashboardTile
    title="Nice work keeping up the habit"
    subtitle="Little check-ins add up."
    cta="Open calendar"
    icon={<Sparkles className="w-5 h-5" />}
    onClick={() => onNavigate('calendar')}
  />

  <DashboardTile
    title="Guide"
    subtitle="Start with a daily check-in. After a few days you can spot early patterns, and after a week it gets even clearer."
    cta="Ask a question in chat"
    icon={<Lightbulb className="w-5 h-5" />}
    onClick={() => onNavigate('chat')}
  />
</div>

{/* Insights + week at a glance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="eb-card">
            <div className="flex items-start gap-4 w-full h-full">
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.18)] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <div className="min-w-0">
                <h3 className="mb-2">Your early insights</h3>
                {quickHookLines.length > 0 ? (
                  <ul className="text-sm text-[rgba(0,0,0,0.75)] space-y-1">
                    {quickHookLines.map((l, idx) => (
                      <li key={idx}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[rgba(0,0,0,0.75)]">
                    Log a few days and your first patterns will show up here.
                  </p>
                )}

                {daysTracked > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="eb-inset rounded-2xl p-3">
                      <div className="text-xs text-[rgb(var(--color-text-secondary))]">Days logged</div>
                      <div className="mt-1 font-semibold">{daysTracked}</div>
                    </div>
                    <div className="eb-inset rounded-2xl p-3">
                      <div className="text-xs text-[rgb(var(--color-text-secondary))]">Insights</div>
                      <div className="mt-1 font-semibold">
                        {insightsReady ? 'Unlocked' : `${insightsRemaining} to unlock`}
                      </div>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => (insightsReady ? onNavigate('insights') : onOpenCheckIn(todayISO))}
                  className="mt-4 inline-flex items-center gap-1 text-sm text-[rgb(var(--color-primary))] hover:underline"
                >
                  {insightsReady ? 'View insights' : 'Do today’s check-in'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="eb-card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="mb-1">Your week at a glance</h3>
                <p className="text-xs text-[rgb(var(--color-text-secondary))]">Pick 3 metrics to show</p>
              </div>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={weekSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 10]} />
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

            {/* Metric pickers (bottom row) */}
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
                className="text-sm text-[rgb(var(--color-primary))] hover:underline absolute top-0 right-0"
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

        {/* Nice work */}
        


        {/* Cycle length modal (stats only) */}
        {cycleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              onClick={() => setCycleModalOpen(false)}
              aria-label="Close cycle modal"
            />
            <div className="relative w-full max-w-lg eb-card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold mb-1">Cycle length</h2>
                  <p className="text-sm text-[rgba(0,0,0,0.65)]">
                    {userData.cycleTrackingMode === 'cycle'
                      ? 'Based on your logs and any overrides.'
                      : 'Cycle tracking is off.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCycleModalOpen(false)}
                  className="rounded-xl px-3 py-2 border border-[rgba(0,0,0,0.12)] hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="eb-inset p-4">
                  <div className="eb-inset-label">Average</div>
                  <div className="eb-inset-value">
                    {cycleStats.avgLength ? `${cycleStats.avgLength} days` : '–'}
                  </div>
                </div>
                <div className="eb-inset p-4">
                  <div className="eb-inset-label">Last cycle</div>
                  <div className="eb-inset-value">
                    {cycleStats.lastLength ? `${cycleStats.lastLength} days` : '–'}
                  </div>
                </div>
              </div>

              <div className="eb-card p-4 mb-5 bg-white border border-[rgba(0,0,0,0.06)]">
                <div className="text-sm font-semibold mb-1">Predicted next start</div>
                <div className="text-base">
                  {cycleStats.predictedNextStartISO ? cycleStats.predictedNextStartISO : 'Not enough data yet'}
                </div>
                {cycleStats.predictionNote && (
                  <p className="text-sm text-[rgba(0,0,0,0.65)] mt-2">{cycleStats.predictionNote}</p>
                )}
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium mb-1">Start a new cycle today</p>
                    <p className="text-sm text-[rgba(0,0,0,0.65)]">Use this if your cycle starts without bleeding (coil/pill). You can adjust it later in Calendar → Edit cycle.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date().toISOString();
                      const isOn = Boolean((todayEntry as any)?.cycleStartOverride);
                      if (todayEntry) {
                        upsertEntry({ ...(todayEntry as any), cycleStartOverride: isOn ? undefined : true, updatedAt: now } as any);
                      } else {
                        if (!isOn) {
                          upsertEntry({
                            id: `${Date.now()}`,
                            dateISO: todayISO,
                            values: {},
                            cycleStartOverride: true,
                            createdAt: now,
                            updatedAt: now,
                          } as any);
                        }
                      }
                    }}
                    className={`flex-shrink-0 w-12 h-6 rounded-full transition-all ${Boolean((todayEntry as any)?.cycleStartOverride) ? 'bg-[rgb(var(--color-primary))]' : 'bg-neutral-300'}`}
                    aria-label="Toggle cycle start today"
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${Boolean((todayEntry as any)?.cycleStartOverride) ? 'translate-x-6' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
