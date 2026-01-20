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
} from 'recharts';
import { TrendingUp, Calendar, Lightbulb, ChevronDown } from 'lucide-react';
import type { CheckInEntry, CyclePhase, SymptomKey, UserData } from '../types';
import { downloadTextFile } from '../lib/storage';
import { useEntries } from '../lib/appStore';
import { calculateStreak, filterByDays, labelCorrelation, pearsonCorrelation, estimatePhaseByFlow, sortByDateAsc } from '../lib/analytics';

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

export function Insights({ userData }: InsightsProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('month');

  const { entries: entriesAll } = useEntries();
  const entries = useMemo(
    () => filterByDays(entriesAll, timeframeDays(selectedTimeframe)),
    [entriesAll, selectedTimeframe]
  );
  const entriesSorted = useMemo(() => sortByDateAsc(entries), [entries]);

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

  // Cycle phases: optional, only when user enables cycle mode AND they have any flow logs
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';
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
    const list: Array<{ title: string; description: string; tag: string }> = [];
    if (correlationData.length >= 5) {
      const tag = labelCorrelation(rSleepEnergy);
      const direction = isFinite(rSleepEnergy) ? (rSleepEnergy > 0.2 ? 'tend to rise together' : rSleepEnergy < -0.2 ? 'tend to move in opposite directions' : 'don’t show a clear link yet') : 'need more data';
      list.push({
        title: 'Sleep and energy',
        description: `In your data, sleep and energy ${direction}.`,
        tag,
      });
    } else {
      list.push({
        title: 'Start spotting patterns',
        description: 'Log a few more days and we’ll begin showing meaningful links between symptoms.',
        tag: 'Keep going',
      });
    }

    if (cycleEnabled) {
      if (hasFlow) {
        list.push({
          title: 'Cycle phase patterns',
          description: 'If you log bleeding or spotting (optional), we can estimate phases and show how symptoms change across the month.',
          tag: 'Optional',
        });
      } else {
        list.push({
          title: 'Cycle insights are ready when you are',
          description: 'Turn on the flow module if you want phase-based charts. You can still track symptoms without it.',
          tag: 'Your choice',
        });
      }
    } else {
      list.push({
        title: 'No-cycle mode',
        description: 'Cycle features are off. You’ll still get correlations and symptom trends based on your daily check-ins.',
        tag: 'Enabled',
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
        });
      }
    }

    return list.slice(0, 3);
  }, [correlationData.length, rSleepEnergy, cycleEnabled, hasFlow, entriesSorted]);

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
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-6xl mx-auto">
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
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {keyInsights.map((insight, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[rgb(var(--color-primary))]"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-primary))] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                </div>
                <div>
                  <h3 className="mb-1 text-base">{insight.title}</h3>
                  <p className="text-sm mb-2">{insight.description}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-[rgb(var(--color-primary))] bg-opacity-10 text-[rgb(var(--color-primary))]">
                    {insight.tag}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cycle Phase Analysis (optional) */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
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
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3>Sleep vs Energy</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">{labelCorrelation(rSleepEnergy)}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
          </div>

          {correlationData.length < 3 ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-4">
              Log a few days with both sleep and energy to see this chart.
            </p>
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
