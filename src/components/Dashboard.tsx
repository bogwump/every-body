import React, { useMemo, useRef, useState } from 'react';
import { Calendar, TrendingUp, Sparkles, ArrowRight, ChevronRight, Lightbulb, Upload } from 'lucide-react';
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
import { buildHomepageHeroModel, computeCycleStats, estimatePhaseByFlow, filterByDays, isoToday, sortByDateAsc } from '../lib/analytics';
import { isoFromDateLocal } from '../lib/date';
import { getDailyTip } from '../lib/tips';
import { importBackupFile, parseBackupJson, looksLikeInsightsExport } from '../lib/backup';

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

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted), [entriesSorted]);

  const heroModel = useMemo(() => {
    // IMPORTANT: Version the cache key.
    // We have iterated on the hero model shape/logic a lot, and stale cached JSON can
    // make the UI look "stuck" even when the underlying logic has changed.
    const HERO_CACHE_VERSION = 4;

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
            className="absolute top-4 right-12 z-10 text-sm eb-hero-on-dark-muted hover:eb-hero-on-dark transition"
            title="View full rhythm"
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

        {/* Restore from backup nudge (only when there is no data yet) */}
        {daysTracked === 0 ? (
          <div className="eb-card mb-6">
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
