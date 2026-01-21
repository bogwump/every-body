import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Calendar, Lightbulb, ChevronDown, MoonStar, Zap, Droplets, Sparkles, Activity, ArrowRight } from 'lucide-react';
import type { CheckInEntry, CyclePhase, SymptomKey, UserData } from '../types';
import { downloadTextFile } from '../lib/storage';
import { useEntries } from '../lib/appStore';
import {
  calculateStreak,
  computeCycleStats,
  filterByDays,
  labelCorrelation,
  pearsonCorrelation,
  estimatePhaseByFlow,
  sortByDateAsc,
} from '../lib/analytics';

interface InsightsProps {
  userData: UserData;
}

type Timeframe = 'week' | 'month' | '3months';

function timeframeDays(tf: Timeframe): number {
  if (tf === 'week') return 7;
  if (tf === 'month') return 30;
  return 90;
}

function phaseLabel(p: CyclePhase): string {
  return p;
}

function moodToPercent(mood?: 1 | 2 | 3): number | undefined {
  if (!mood) return undefined;
  return mood === 1 ? 25 : mood === 2 ? 60 : 85;
}

function hasNumeric(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function averageFor(entries: CheckInEntry[], key: SymptomKey): number {
  const vals = entries.map((e) => e.values[key]).filter(hasNumeric);
  if (vals.length === 0) return NaN;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}


function insightIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes('sleep')) return MoonStar;
  if (t.includes('energy')) return Zap;
  if (t.includes('cycle') || t.includes('phase') || t.includes('flow')) return Droplets;
  if (t.includes('stress') || t.includes('pain')) return Activity;
  if (t.includes('start')) return Sparkles;
  return Lightbulb;
}

function MiniIllustration({ kind }: { kind: 'spark' | 'droplet' | 'moon' | 'chart' }) {
  // Simple inline SVGs so we don't need image assets.
  // Uses currentColor so it stays on-brand with theme variables.
  if (kind === 'droplet') {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12" aria-hidden="true">
        <path
          d="M32 6c10 14 18 23 18 34a18 18 0 1 1-36 0C14 29 22 20 32 6Z"
          fill="currentColor"
          opacity="0.12"
        />
        <path
          d="M24 41c2 5 7 8 13 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    );
  }
  if (kind === 'moon') {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12" aria-hidden="true">
        <path
          d="M39 8c-8 3-14 11-14 21 0 12 10 22 22 22 3 0 6-.6 9-1.8C52 56 44 60 35 60 20 60 8 48 8 33 8 21 15 11 26 8c4-1 9-1 13 0Z"
          fill="currentColor"
          opacity="0.12"
        />
        <circle cx="44" cy="22" r="3" fill="currentColor" opacity="0.35" />
      </svg>
    );
  }
  if (kind === 'chart') {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12" aria-hidden="true">
        <rect x="10" y="12" width="44" height="40" rx="10" fill="currentColor" opacity="0.10" />
        <path
          d="M18 42l10-10 8 6 12-16"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.45"
        />
        <circle cx="18" cy="42" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="28" cy="32" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="36" cy="38" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="48" cy="22" r="3" fill="currentColor" opacity="0.35" />
      </svg>
    );
  }
  // spark
  return (
    <svg viewBox="0 0 64 64" className="w-12 h-12" aria-hidden="true">
      <path
        d="M32 10l3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path d="M49 36l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" fill="currentColor" opacity="0.12" />
    </svg>
  );
}

function timeframeLabel(tf: Timeframe): string {
  return tf === 'week' ? 'Week' : tf === 'month' ? 'Month' : '3 Months';
}

export function Insights({ userData }: InsightsProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('month');
  const [moodMonths, setMoodMonths] = useState<number>(1); // 1,3,6,12

  const { entries: entriesAll } = useEntries();
  const entriesAllSorted = useMemo(() => sortByDateAsc(entriesAll), [entriesAll]);
  const entries = useMemo(
    () => filterByDays(entriesAll, timeframeDays(selectedTimeframe)),
    [entriesAll, selectedTimeframe]
  );
  const entriesSorted = useMemo(() => sortByDateAsc(entries), [entries]);

  // Cycle phases: optional, only when user enables cycle mode AND they have any flow logs
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  // Small summary stats used across the page
  const streak = useMemo(() => calculateStreak(entriesAllSorted), [entriesAllSorted]);
  const cycleStats = useMemo(() => (cycleEnabled ? computeCycleStats(entriesAllSorted) : null), [cycleEnabled, entriesAllSorted]);

  const sleep = useMemo(() => entriesSorted.map((e) => e.values.sleep).filter(hasNumeric), [entriesSorted]);
  const energy = useMemo(() => entriesSorted.map((e) => e.values.energy).filter(hasNumeric), [entriesSorted]);

  // correlation points (only include days with both values)
  const correlationData = useMemo(() => {
    return entriesSorted
      .map((e, idx) => ({
        day: idx + 1,
        sleep: e.values.sleep,
        energy: e.values.energy,
        mood: moodToPercent(e.mood),
      }))
      .filter((p) => hasNumeric(p.sleep) && hasNumeric(p.energy)) as Array<{ day: number; sleep: number; energy: number; mood?: number }>;
  }, [entriesSorted]);

  const rSleepEnergy = useMemo(() => {
    // align xs/ys by selecting paired points from correlationData
    const xs = correlationData.map((p) => p.sleep);
    const ys = correlationData.map((p) => p.energy);
    return pearsonCorrelation(xs, ys);
  }, [correlationData]);
  const hasFlow = useMemo(() => entriesAll.some((e) => hasNumeric(e.values.flow) && e.values.flow > 0), [entriesAll]);

  const phaseBuckets = useMemo(() => {
    if (!cycleEnabled || !hasFlow) return null;
    const buckets: Record<CyclePhase, CheckInEntry[]> = {
      Menstrual: [],
      Follicular: [],
      Ovulation: [],
      Luteal: [],
    };
    for (const e of entriesSorted) {
      const phase = estimatePhaseByFlow(e.dateISO, entriesAll);
      if (!phase) continue;
      buckets[phase].push(e);
    }
    return buckets;
  }, [cycleEnabled, hasFlow, entriesSorted, entriesAll]);

  const cycleData = useMemo(() => {
    if (!phaseBuckets) return [];
    const phases: CyclePhase[] = ['Menstrual', 'Follicular', 'Ovulation', 'Luteal'];
    return phases.map((phase) => {
      const list = phaseBuckets[phase];
      const avgEnergy = averageFor(list, 'energy');
      const avgPain = averageFor(list, 'pain');
      const avgMood = (() => {
        const vals = list.map((e) => moodToPercent(e.mood)).filter(hasNumeric);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      })();
      return {
        phase: phaseLabel(phase),
        energy: Number.isFinite(avgEnergy) ? Math.round(avgEnergy) : undefined,
        mood: Number.isFinite(avgMood) ? Math.round(avgMood) : undefined,
        pain: Number.isFinite(avgPain) ? Math.round(avgPain) : undefined,
      };
    });
  }, [phaseBuckets]);

  const keyInsights = useMemo(() => {
    const list: Array<{ title: string; description: string; tag: string; illustration: 'spark' | 'droplet' | 'moon' | 'chart' }> = [];
    if (correlationData.length >= 5) {
      const tag = labelCorrelation(rSleepEnergy);
      const direction = isFinite(rSleepEnergy) ? (rSleepEnergy > 0.2 ? 'tend to rise together' : rSleepEnergy < -0.2 ? 'tend to move in opposite directions' : 'don’t show a clear link yet') : 'need more data';
      list.push({
        title: 'Sleep and energy',
        description: `In your data, sleep and energy ${direction}.`,
        tag,
        illustration: 'chart',
      });
    } else {
      list.push({
        title: 'Start spotting patterns',
        description: 'Log a few more days and we’ll begin showing meaningful links between symptoms.',
        tag: 'Keep going',
        illustration: 'spark',
      });
    }

    if (cycleEnabled) {
      if (hasFlow) {
        list.push({
          title: 'Cycle phase patterns',
          description: 'If you log bleeding or spotting (optional), we can estimate phases and show how symptoms change across the month.',
          tag: 'Optional',
          illustration: 'droplet',
        });
      } else {
        list.push({
          title: 'Cycle insights are ready when you are',
          description: 'Turn on the flow module if you want phase-based charts. You can still track symptoms without it.',
          tag: 'Your choice',
          illustration: 'droplet',
        });
      }
    } else {
      list.push({
        title: 'No-cycle mode',
        description: 'Cycle features are off. You’ll still get correlations and symptom trends based on your daily check-ins.',
        tag: 'Enabled',
        illustration: 'chart',
      });
    }

    // A simple stress/sleep note if both tracked
    const avgStress = averageFor(entriesSorted, 'stress');
    const avgSleep = averageFor(entriesSorted, 'sleep');
    if (Number.isFinite(avgStress) && Number.isFinite(avgSleep) && entriesSorted.length >= 5) {
      if (avgStress > 60 && avgSleep < 50) {
        list.push({
          title: 'Stress and sleep',
          description: 'Your recent week shows higher stress alongside lower sleep. Want a few gentle options to try?',
          tag: 'Worth exploring',
          illustration: 'moon',
        });
      }
    }

    // Always keep the grid feeling balanced: if we still have fewer than 3 cards,
    // add a small "snapshot" card that also makes timeframe switching feel responsive.
    if (list.length < 3) {
      const days = timeframeDays(selectedTimeframe);
      const logged = entriesSorted.length;
      const streak = calculateStreak(entriesAll);
      list.push({
        title: 'Your snapshot',
        description: `Showing ${timeframeLabel(selectedTimeframe).toLowerCase()} view: ${logged} of last ${days} days logged. Current streak: ${streak} day${streak === 1 ? '' : 's'}.`,
        tag: 'Export',
        illustration: 'chart',
      });
    }

    return list.slice(0, 3);
  }, [correlationData.length, rSleepEnergy, cycleEnabled, hasFlow, entriesSorted, selectedTimeframe, entriesAll]);

  const moodSummary = useMemo(() => {
    const days = Math.max(30, Math.round(moodMonths * 30));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));

    const ranged = entriesSorted.filter((e) => {
      const d = new Date(e.dateISO + 'T00:00:00');
      return d >= cutoff;
    });

    const moods = ranged.map((e) => e.mood).filter((m): m is 1 | 2 | 3 => m === 1 || m === 2 || m === 3);
    const counts = {
      low: moods.filter((m) => m === 1).length,
      okay: moods.filter((m) => m === 2).length,
      good: moods.filter((m) => m === 3).length,
    };

    const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : NaN;
    const avgLabel = !Number.isFinite(avg)
      ? 'Not enough data yet'
      : avg < 1.75
        ? 'Mostly low'
        : avg < 2.5
          ? 'Mostly okay'
          : 'Mostly good';

    // Week-by-week rollup (up to last 12 weeks)
    const weeks = Math.min(12, Math.ceil(days / 7));
    const weekBuckets: Array<{ label: string; avg: number; n: number }> = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const start = new Date();
      start.setDate(start.getDate() - (w + 1) * 7 + 1);
      const end = new Date();
      end.setDate(end.getDate() - w * 7);
      const inWeek = ranged.filter((e) => {
        const d = new Date(e.dateISO + 'T00:00:00');
        return d >= start && d <= end;
      });
      const ms = inWeek.map((e) => e.mood).filter((m): m is 1 | 2 | 3 => m === 1 || m === 2 || m === 3);
      const a = ms.length ? ms.reduce((x, y) => x + y, 0) / ms.length : NaN;
      weekBuckets.push({
        label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        avg: a,
        n: ms.length,
      });
    }

    // Daily series for a simple line chart
    const moodSeries = ranged
      .map((e) => ({
        dateISO: e.dateISO,
        label: new Date(e.dateISO + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        mood: e.mood,
      }))
      .filter((p) => p.mood === 1 || p.mood === 2 || p.mood === 3) as Array<{ dateISO: string; label: string; mood: 1 | 2 | 3 }>;

    return {
      days,
      totalDays: ranged.length,
      moodDays: moods.length,
      counts,
      avg,
      avgLabel,
      weekBuckets,
      moodSeries,
    };
  }, [entriesSorted, moodMonths]);

  const exportReport = () => {
    const streak = calculateStreak(entriesAll);
    const report = {
      generatedAt: new Date().toISOString(),
      timeframe: selectedTimeframe,
      totals: { daysLogged: entriesAll.length, streak },
      averages: {
        energy: averageFor(entries, 'energy'),
        sleep: averageFor(entries, 'sleep'),
        stress: averageFor(entries, 'stress'),
        pain: averageFor(entries, 'pain'),
      },
      correlations: {
        sleep_energy: rSleepEnergy,
      },
      cycleEnabled: cycleEnabled,
    };
    downloadTextFile('everybody-report.json', JSON.stringify(report, null, 2), 'application/json');
  };

  return (
    <div className="eb-page">
      <div className="eb-page-inner">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Insights & Patterns</h1>
          <p>
            {cycleEnabled ? 'Discover connections between your symptoms and cycle' : 'Discover connections between your symptoms over time'}
          </p>
        </div>

        {/* Timeframe Selector */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 bg-white rounded-xl p-1 shadow-sm">
            {(['week', 'month', '3months'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  selectedTimeframe === tf
                    ? 'bg-[rgb(var(--color-primary))] text-white'
                    : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                }`}
              >
                {tf === 'week' ? 'Week' : tf === 'month' ? 'Month' : '3 Months'}
              </button>
            ))}
          </div>

          <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            Showing {entriesSorted.length} logs from the last {timeframeDays(selectedTimeframe)} days.
            {entriesSorted.length === 0 ? ' Add a daily check-in to unlock insights.' : ''}
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">Logs</div>
                <div className="text-lg font-semibold">{entriesSorted.length}</div>
              </div>
              <div className="text-[rgb(var(--color-primary-dark))]">
                <MiniIllustration kind="chart" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">Streak</div>
                <div className="text-lg font-semibold">{streak} day{streak === 1 ? '' : 's'}</div>
              </div>
              <div className="text-[rgb(var(--color-primary-dark))]">
                <MiniIllustration kind="spark" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">Mood</div>
                <div className="text-lg font-semibold">{moodSummary.avgLabel}</div>
              </div>
              <div className="text-[rgb(var(--color-primary-dark))]">
                <MiniIllustration kind="moon" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">Next cycle</div>
                <div className="text-lg font-semibold">
                  {!cycleEnabled
                    ? 'Off'
                    : cycleStats?.predictedNextStartISO
                      ? new Date(cycleStats.predictedNextStartISO + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                      : 'Not enough data'}
                </div>
              </div>
              <div className="text-[rgb(var(--color-primary-dark))]">
                <MiniIllustration kind="droplet" />
              </div>
            </div>
          </div>
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {keyInsights.map((insight, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[rgb(var(--color-primary))]"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-primary)/0.12)] flex items-center justify-center flex-shrink-0">
                  {(() => {
                    const Icon = insightIcon(insight.title);
                    return <Icon className="w-5 h-5 text-[rgb(var(--color-primary-dark))]" />;
                  })()}
                </div>
                <div>
                  <h3 className="mb-1 text-base">{insight.title}</h3>
                  <p className="text-sm mb-2">{insight.description}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-[rgb(var(--color-primary)/0.12)] text-[rgb(var(--color-primary-dark))]">
                    {insight.tag}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end text-[rgb(var(--color-primary-dark))]">
                <MiniIllustration kind={insight.illustration} />
              </div>

              {insight.tag === 'Export' ? (
                <button
                  type="button"
                  onClick={exportReport}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[rgb(var(--color-primary)/0.12)] text-[rgb(var(--color-primary-dark))] text-sm hover:bg-[rgb(var(--color-primary)/0.16)]"
                >
                  Export report <ArrowRight className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {/* Mood trend */}
        <div className="eb-card mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="mb-1">Overall mood</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Last {moodSummary.days} days: {moodSummary.moodDays ? `${moodSummary.moodDays} mood logs` : 'no mood logs yet'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-2xl p-1 bg-[rgb(var(--color-primary)/0.10)]">
                {[1, 3, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoodMonths(m)}
                    className="px-3 py-2 rounded-xl text-sm transition"
                    style={{
                      background: moodMonths === m ? 'rgb(var(--color-primary))' : 'transparent',
                      color: moodMonths === m ? 'white' : 'rgb(var(--color-text-secondary))',
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>

              <span className="eb-chip whitespace-nowrap">{moodSummary.avgLabel}</span>
            </div>
          </div>

          {moodSummary.moodDays === 0 ? (
            <div className="mt-4 text-sm text-[rgb(var(--color-text-secondary))]">
              Start using the mood buttons in your daily check-in and you’ll see patterns appear here.
              <span className="hidden sm:inline"> You can also view mood on the Calendar overlay.</span>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-sm font-medium">Trend</div>
                  <div className="text-sm text-[rgb(var(--color-text-secondary))] whitespace-nowrap">
                    Good {moodSummary.counts.good} · Okay {moodSummary.counts.okay} · Low {moodSummary.counts.low}
                  </div>
                </div>

                <div style={{ width: '100%', height: 150 }}>
                  <ResponsiveContainer>
                    <LineChart data={moodSummary.moodSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" hide={moodSummary.moodSeries.length > 10} />
                      <YAxis domain={[1, 3]} ticks={[1, 2, 3]} width={28} />
                      <Tooltip formatter={(v: any) => (v === 1 ? 'Low' : v === 2 ? 'Okay' : 'Good')} />
                      <Line type="monotone" dataKey="mood" stroke="rgb(var(--color-primary))" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Week by week</div>
                <div className="text-sm text-[rgb(var(--color-text-secondary))]">
                  Scroll
                </div>
              </div>

              <div className="eb-scroll-row">
                {moodSummary.weekBuckets.map((w) => {
                  const label = !Number.isFinite(w.avg) ? '—' : w.avg < 1.75 ? 'Low' : w.avg < 2.5 ? 'Okay' : 'Good';
                  const dot = !Number.isFinite(w.avg)
                    ? 'bg-neutral-300'
                    : w.avg < 1.75
                      ? 'bg-[rgb(var(--color-primary-dark))]'
                      : w.avg < 2.5
                        ? 'bg-[rgb(var(--color-accent))]'
                        : 'bg-[rgb(var(--color-primary))]';
                  return (
                    <div key={w.label} className="eb-scroll-item min-w-[150px] rounded-2xl border border-[rgba(0,0,0,0.06)] p-4 bg-white">
                      <div className="text-sm font-medium mb-2">{w.label}</div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                        <span className="text-[rgb(var(--color-text-secondary))]">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

	        {/* Cycle Phase Analysis (optional) */}
	        <div className="eb-card mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3>Symptoms by cycle phase</h3>
            <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />
          </div>

          {!cycleEnabled ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              Cycle features are off. You can still track symptoms and see correlations. If you ever want phase-based insights, you can switch cycle tracking on in Profile.
            </p>
          ) : !hasFlow ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              To show this chart, log bleeding or spotting using the optional “Bleeding / Spotting” slider (you can enable or disable it in Profile).
            </p>
          ) : cycleData.length < 2 ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              Keep logging for a bit longer and we’ll start showing how symptoms vary by estimated phase.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cycleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="phase" stroke="#999" fontSize={12} />
                  <YAxis stroke="#999" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Bar dataKey="energy" fill="rgb(var(--color-primary))" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="mood" fill="rgb(var(--color-accent))" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pain" fill="rgb(var(--color-primary-light))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[rgb(var(--color-primary))]" />
                  <span>Energy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[rgb(var(--color-accent))]" />
                  <span>Mood</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[rgb(var(--color-primary-light))]" />
                  <span>Pain</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Correlation Chart */}
	        <div className="eb-card mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3>Sleep vs Energy</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">{labelCorrelation(rSleepEnergy)}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
          </div>

          {correlationData.length < 3 ? (
            <div className="mt-4 rounded-2xl border border-[rgba(0,0,0,0.06)] p-5 flex items-center gap-4">
              <div className="text-[rgb(var(--color-primary-dark))] flex-shrink-0">
                <MiniIllustration kind="chart" />
              </div>
              <div>
                <div className="font-medium mb-1">Not enough data yet</div>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                  Log a few days with both sleep and energy and this chart will start revealing patterns.
                </p>
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    type="number"
                    dataKey="sleep"
                    name="Sleep Quality"
                    stroke="#999"
                    fontSize={12}
                    label={{ value: 'Sleep (%)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="energy"
                    name="Energy"
                    stroke="#999"
                    fontSize={12}
                    label={{ value: 'Energy (%)', angle: -90, position: 'insideLeft' }}
                  />
                  <ZAxis range={[60, 260]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Scatter name="Days" data={correlationData} fill="rgb(var(--color-primary))" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-sm text-center mt-4 text-[rgb(var(--color-text-secondary))]">
                Each dot is a day you logged. This view helps you spot patterns without guessing.
              </p>
            </>
          )}
        </div>

        {/* Report */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
          <h3 className="mb-4">Your report</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Days logged</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">All time</p>
              </div>
              <span className="text-xl font-medium text-[rgb(var(--color-primary))]">{entriesAll.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Current streak</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Consecutive days</p>
              </div>
              <span className="text-xl font-medium text-[rgb(var(--color-primary))]">{calculateStreak(entriesAll)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1">Sleep average</p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Selected timeframe</p>
              </div>
              <span className="text-xl font-medium text-[rgb(var(--color-primary))]">
                {Number.isFinite(averageFor(entries, 'sleep')) ? `${Math.round(averageFor(entries, 'sleep'))}%` : '–'}
              </span>
            </div>
          </div>
          <button
            onClick={exportReport}
            className="w-full mt-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium flex items-center justify-center gap-2"
            type="button"
          >
            Export report
            <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
          </button>
        </div>
      </div>
    </div>
  );
}
