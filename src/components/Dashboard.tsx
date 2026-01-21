import React, { useMemo } from 'react';
import { Calendar, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
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

import type { UserData, UserGoal } from '../types';
import { useEntries } from '../lib/appStore';
import { computeCycleStats, estimatePhaseByFlow, filterByDays, isoToday, sortByDateAsc } from '../lib/analytics';

interface DashboardProps {
  userName: string;
  userGoal: UserGoal | null;
  userData: UserData;
  onNavigate: (screen: string) => void;
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

function buildWeekSeries(dateISOs: string[], entriesByDate: Map<string, any>) {
  return dateISOs.map((iso) => {
    const e = entriesByDate.get(iso);
    return {
      day: labelDayShort(iso),
      energy: e?.values?.energy,
      sleep: e?.values?.sleep,
      mood: e?.mood ? e.mood * 33 : undefined,
    };
  });
}

export function Dashboard({ userName, userGoal, userData, onNavigate }: DashboardProps) {
  const { entries: entriesAll, upsertEntry } = useEntries();
  const entriesSorted = useMemo(() => sortByDateAsc(entriesAll), [entriesAll]);
  const todayISO = isoToday();
  const todayEntry = useMemo(() => entriesSorted.find((e) => e.dateISO === todayISO) ?? null, [entriesSorted, todayISO]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }, []);

  const checkedInToday = Boolean(todayEntry);
  const goalLabel = prettyGoal(userGoal);

  const cycleStats = useMemo(() => computeCycleStats(entriesSorted), [entriesSorted]);

  const todayPhase = useMemo(() => {
    if (userData.cycleTrackingMode !== 'cycle') return null;
    return estimatePhaseByFlow(todayISO, entriesSorted);
  }, [userData.cycleTrackingMode, todayISO, entriesSorted]);

  const tipText = useMemo(() => {
    if (userData.cycleTrackingMode !== 'cycle') {
      return 'Small daily check-ins can help you spot patterns over time. You can track symptoms with or without a cycle.';
    }
    if (!todayPhase) return 'Small daily check-ins can help you spot patterns over time.';
    const byPhase: Record<string, string> = {
      Menstrual: 'Go gentle if you need. Warmth, hydration, and extra rest can really help.',
      Follicular: 'Energy often rises here. It can be a nice time to plan, start fresh, or try something new.',
      Ovulation: 'Often a higher-energy window. It can be a nice time for social plans or creative work.',
      Luteal: 'If symptoms ramp up here, try reducing friction: earlier nights, simpler meals, lighter plans.',
    };
    return byPhase[dayPhaseKey(todayPhase)] ?? 'Small daily check-ins can help you spot patterns over time.';
  }, [userData.cycleTrackingMode, todayPhase]);

  function dayPhaseKey(p: any) {
    // analytics uses "Ovulation" not "Ovulatory" in some places
    if (p === 'Ovulatory') return 'Ovulation';
    return p;
  }

  // week series
  const weekSeries = useMemo(() => {
    const today = new Date();
    const dateISOs: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateISOs.push(d.toISOString().slice(0, 10));
    }
    const map = new Map(entriesSorted.map((e: any) => [e.dateISO, e]));
    return buildWeekSeries(dateISOs, map);
  }, [entriesSorted]);

  const avgCycleText =
    cycleStats.avgLength ? `${cycleStats.avgLength} days avg` : 'Not enough data yet';

  const showCycleBubble = userData.cycleTrackingMode === 'cycle' && (userData.showCycleBubble ?? true);
  const [cycleModalOpen, setCycleModalOpen] = React.useState(false);
  const [markNewCycle, setMarkNewCycle] = React.useState<boolean>(Boolean((todayEntry as any)?.cycleStartOverride));

  React.useEffect(() => {
    setMarkNewCycle(Boolean((todayEntry as any)?.cycleStartOverride));
  }, [todayEntry]);

  const saveCycleOverride = () => {
    const now = new Date().toISOString();
    const next = {
      id: (todayEntry as any)?.id ?? `${Date.now()}`,
      dateISO: todayISO,
      mood: (todayEntry as any)?.mood,
      notes: (todayEntry as any)?.notes,
      values: (todayEntry as any)?.values ?? {},
      cycleStartOverride: markNewCycle ? true : undefined,
      createdAt: (todayEntry as any)?.createdAt ?? now,
      updatedAt: now,
    };
    upsertEntry(next as any);
    setCycleModalOpen(false);
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
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="absolute top-4 right-4 opacity-80 hover:opacity-100 transition"
            title="Calendar"
          >
            <Calendar className="w-5 h-5" />
          </button>

          <h3 className="mb-1 text-lg font-semibold">Symptom tracking</h3>

          <p className="text-sm eb-hero-on-dark-muted mb-5">
            {userData.cycleTrackingMode === 'no-cycle'
              ? 'Cycle features are off, but you can still track symptoms and patterns.'
              : 'Add bleeding or spotting (optional) to unlock cycle-phase insights.'}
          </p>

          
          {showCycleBubble && (
            <button
              type="button"
              onClick={() => setCycleModalOpen(true)}
              className="absolute top-4 right-14 rounded-full bg-[rgba(255,255,255,0.18)] border border-[rgba(255,255,255,0.25)] px-3 py-1 text-sm eb-hero-on-dark hover:bg-[rgba(255,255,255,0.24)] transition"
              title="Cycle length"
            >
              <span className="font-medium">Cycle length</span>
              <span className="mx-2 opacity-70">•</span>
              <span className="font-semibold">{avgCycleText}</span>
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="eb-inset rounded-xl p-4">
              <div className="eb-inset-label">Today</div>
              <div className="eb-inset-value">{checkedInToday ? 'Checked in' : 'Not checked in yet'}</div>
            </div>

            <div className="eb-inset rounded-xl p-4">
              <div className="eb-inset-label">Goal</div>
              <div className="eb-inset-value">{goalLabel}</div>
            </div>
          </div>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button onClick={() => onNavigate('check-in')} className="eb-card hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-accent),0.2)] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <ArrowRight className="w-5 h-5 text-[rgba(0,0,0,0.45)] group-hover:text-[rgba(0,0,0,0.65)]" />
            </div>
            <h3 className="mb-1">Daily check-in</h3>
            <p className="text-sm">Log today’s symptoms</p>
          </button>

          <button onClick={() => onNavigate('insights')} className="eb-card hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-accent),0.2)] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <ArrowRight className="w-5 h-5 text-[rgba(0,0,0,0.45)] group-hover:text-[rgba(0,0,0,0.65)]" />
            </div>
            <h3 className="mb-1">View insights</h3>
            <p className="text-sm">Spot patterns over time</p>
          </button>
        </div>

        {/* Guide + week at a glance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="eb-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-accent),0.18)] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <h3 className="mb-0">Guide</h3>
            </div>
            <p className="text-sm mb-4">
              Start with a daily check-in. After a week or two, insights start to become more useful.
            </p>
            <button onClick={() => onNavigate('chat')} className="text-sm text-[rgb(var(--color-primary))] hover:underline">
              Ask a question in chat →
            </button>
          </div>

          <div className="eb-card">
            <h3 className="mb-3">Your week at a glance</h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={weekSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="energy" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sleep" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="mood" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm mt-3">
              Quick view of the last 7 days. Missing points mean you did not check in that day.
            </p>
          </div>
        </div>

        {/* Tip for today */}
        <div className="eb-card">
          <h3 className="mb-2">Tip for today</h3>
          <p className="text-sm">{tipText}</p>
        </div>

        {/* Nice work */}
        <button onClick={() => onNavigate('insights')} className="eb-card w-full text-left hover:shadow-md transition">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[rgba(0,0,0,0.06)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[rgba(0,0,0,0.65)]" />
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold mb-1">Nice work keeping up the habit</h3>
              <p className="text-sm text-[rgba(0,0,0,0.65)]">
                If you want, we can look for links between symptoms and lifestyle across the last few weeks.
              </p>
              <span className="mt-3 inline-block text-sm text-[rgb(var(--color-primary))]">Show me insights →</span>
            </div>
          </div>
        </button>
        {/* Cycle length modal */}
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
                    {userData.cycleTrackingMode === 'cycle' ? 'Based on your logs and any overrides.' : 'Cycle tracking is off.'}
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
                  <div className="eb-inset-value">{cycleStats.avgLength ? `${cycleStats.avgLength} days` : '–'}</div>
                </div>
                <div className="eb-inset p-4">
                  <div className="eb-inset-label">Last cycle</div>
                  <div className="eb-inset-value">{cycleStats.lastLength ? `${cycleStats.lastLength} days` : '–'}</div>
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

              <div className="flex items-start gap-3 mb-5">
                <input
                  id="eb-new-cycle-dashboard"
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[rgba(0,0,0,0.25)]"
                  checked={markNewCycle}
                  onChange={(e) => setMarkNewCycle(e.target.checked)}
                />
                <div className="min-w-0">
                  <label htmlFor="eb-new-cycle-dashboard" className="block font-semibold mb-1">
                    New cycle started today
                  </label>
                  <p className="text-sm text-[rgba(0,0,0,0.65)]">
                    Marks today as a fresh start even if you are not logging bleeding.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setCycleModalOpen(false)}
                  className="rounded-xl px-4 py-2 border border-[rgba(0,0,0,0.12)] hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCycleOverride}
                  className="rounded-xl px-4 py-2 bg-[rgb(var(--color-primary))] text-white hover:opacity-95"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
