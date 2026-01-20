import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import type { CheckInEntry, UserData, UserGoal } from '../types';
import { useEntries } from '../lib/appStore';
import { filterByDays, isoToday, estimatePhaseByFlow } from '../lib/analytics';

interface DashboardProps {
  userName: string;
  userGoal: UserGoal | null;
  userData: UserData;
  onNavigate: (screen: string) => void;
}

function labelDayShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function buildWeekSeries(entries: CheckInEntry[]) {
  const byDate = new Map(entries.map((e) => [e.dateISO, e]));
  const today = new Date();
  const out: Array<{ day: string; energy?: number; sleep?: number; mood?: number }> = [];
  // last 7 days, oldest first
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const e = byDate.get(iso);
    out.push({
      day: labelDayShort(iso),
      energy: e?.values.energy,
      sleep: e?.values.sleep,
      mood: e?.mood ? (e.mood === 1 ? 25 : e.mood === 2 ? 60 : 85) : undefined,
    });
  }
  return out;
}

export function Dashboard({ userName, userGoal, userData, onNavigate }: DashboardProps) {
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const { entries } = useEntries();
  const weekEntries = useMemo(() => filterByDays(entries, 7), [entries]);
  const weekSeries = useMemo(() => buildWeekSeries(weekEntries), [weekEntries]);

  const hasCheckedInToday = useMemo(() => {
    const t = isoToday();
    return entries.some((e) => e.dateISO === t);
  }, [entries]);

  // Cycle card copy: only show cycle-phase messaging if user enabled cycle tracking AND we have any flow logs
  const cycleMode: UserData['cycleTrackingMode'] = userData.cycleTrackingMode;

  const hasFlow = useMemo(
    () => entries.some((e) => typeof e.values.flow === 'number' && e.values.flow > 0),
    [entries]
  );

  const todayPhase = useMemo(() => {
    if (cycleMode !== 'cycle' || !hasFlow) return null;
    return estimatePhaseByFlow(isoToday(), entries);
  }, [cycleMode, hasFlow, entries]);

  const companion = useMemo(() => {
    if (!hasCheckedInToday) {
      return {
        title: 'Quick check-in?',
        body: 'It looks like you haven’t checked in today. 30 seconds now can make patterns easier to spot later.',
        cta: 'Do today’s check-in',
        action: 'check-in' as const,
      };
    }
    // small heuristic based on last 7 days averages
    const last7 = filterByDays(entries, 7);
    const avgSleep =
      last7.map((e) => e.values.sleep).filter((v): v is number => typeof v === 'number').reduce((a, b) => a + b, 0) /
      Math.max(1, last7.map((e) => e.values.sleep).filter((v): v is number => typeof v === 'number').length);
    const avgEnergy =
      last7.map((e) => e.values.energy).filter((v): v is number => typeof v === 'number').reduce((a, b) => a + b, 0) /
      Math.max(1, last7.map((e) => e.values.energy).filter((v): v is number => typeof v === 'number').length);

    if (isFinite(avgSleep) && avgSleep < 45 && isFinite(avgEnergy) && avgEnergy < 45) {
      return {
        title: 'Want help making sense of this?',
        body: 'Your last week looks like low sleep and low energy are showing up together. Want to explore patterns?',
        cta: 'See Insights',
        action: 'insights' as const,
      };
    }
    return {
      title: 'Nice work keeping up the habit',
      body: 'If you want, we can look for links between symptoms and lifestyle across the last few weeks.',
      cta: 'Show me insights',
      action: 'insights' as const,
    };
  }, [entries, hasCheckedInToday]);

  const tipText = useMemo(() => {
    if (cycleMode === 'cycle' && todayPhase) {
      const byPhase: Record<string, string> = {
        Menstrual: 'If you’re bleeding, be kind to yourself. Warmth, hydration and gentle movement can help some people feel more comfortable.',
        Follicular: 'This phase often feels like a reset. If you feel up to it, it’s a good time to plan, start habits, and build momentum.',
        Ovulation: 'If you track a cycle, this is often a higher-energy window. It can be a nice time for social plans or creative work.',
        Luteal: 'If your symptoms ramp up here, try reducing friction. Earlier nights, simpler meals, and lighter plans can really help.',
      };
      return byPhase[todayPhase] ?? 'Small daily check-ins can help you spot patterns over time.';
    }
    return 'Small daily check-ins can help you spot patterns over time. You can track symptoms with or without a cycle.';
  }, [cycleMode, todayPhase]);

  return (
    <div className="min-h-screen px-6 py-8 md:pl-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Welcome back{userName ? `, ${userName}` : ''}</h1>
          <p>{todayLabel}</p>
        </div>

        {/* Cycle / Mode Overview Card */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-dark))] rounded-2xl p-6 mb-6 text-white shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              {cycleMode === 'cycle' && hasFlow ? (
                <>
                  <h3 className="text-white mb-1">Today’s phase</h3>
                  <p className="text-white opacity-90 text-sm">{todayPhase ?? 'Not enough cycle data yet'}</p>
                </>
              ) : (
                <>
                  <h3 className="text-white mb-1">Symptom tracking</h3>
                  <p className="text-white opacity-90 text-sm">
                    {cycleMode === 'no-cycle'
                      ? 'Cycle features are off, but you can still track symptoms and patterns.'
                      : 'Add bleeding or spotting (optional) to unlock cycle-phase insights.'}
                  </p>
                </>
              )}
            </div>
            <Calendar className="w-6 h-6 text-white opacity-80" />
          </div>
          <div className="flex gap-4 mt-6">
            <div className="flex-1 bg-[rgba(255,255,255,0.2)] rounded-xl p-3">
              <p className="text-xs text-white opacity-80 mb-1">Today</p>
              <p className="font-medium text-white">{hasCheckedInToday ? 'Checked in' : 'Not yet'}</p>
            </div>
            <div className="flex-1 bg-[rgba(255,255,255,0.2)] rounded-xl p-3">
              <p className="text-xs text-white opacity-80 mb-1">Goal</p>
              <p className="font-medium text-white">{userGoal ? userGoal.replace('-', ' ') : 'Just exploring'}</p>
            </div>
          </div>
        </div>

        {/* Companion Card */}
        <button
          onClick={() => onNavigate(companion.action)}
          className="bg-white rounded-2xl p-6 mb-6 shadow-sm hover:shadow-md transition-all text-left border border-neutral-200"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-primary),0.1)] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1">{companion.title}</h3>
              <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-3">{companion.body}</p>
              <span className="text-sm text-[rgb(var(--color-primary))] hover:underline">{companion.cta} →</span>
            </div>
          </div>
        </button>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => onNavigate('check-in')}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-primary),0.1)] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <ArrowRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] group-hover:text-[rgb(var(--color-primary))] transition-colors" />
            </div>
            <h3 className="mb-1">Daily Check-in</h3>
            <p className="text-sm">Log today’s symptoms</p>
          </button>

          <button
            onClick={() => onNavigate('insights')}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-accent),0.2)] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <ArrowRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] group-hover:text-[rgb(var(--color-primary))] transition-colors" />
            </div>
            <h3 className="mb-1">Insights</h3>
            <p className="text-sm">See patterns and correlations</p>
          </button>

          <button
            onClick={() => onNavigate('chat')}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-accent),0.2)] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />
              </div>
              <ArrowRight className="w-5 h-5 text-[rgb(var(--color-text-secondary))] group-hover:text-[rgb(var(--color-primary))] transition-colors" />
            </div>
            <h3 className="mb-1">Guide</h3>
            <p className="text-sm">Ask questions anytime</p>
          </button>
        </div>

        {/* Weekly Trends */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3>Your Week at a Glance</h3>
            <span className="text-xs text-[rgb(var(--color-text-secondary))]">Based on your check-ins</span>
          </div>
          {entries.length < 2 ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-4">
              Log a couple of days and this chart will start showing your trends.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weekSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#999" fontSize={12} />
                <YAxis stroke="#999" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="energy"
                  stroke="rgb(var(--color-primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="mood"
                  stroke="rgb(var(--color-accent))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="sleep"
                  stroke="rgb(var(--color-primary-light))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Personalised Tip */}
        <div className="bg-gradient-to-br from-[rgba(var(--color-accent),0.2)] to-transparent rounded-2xl p-6 border border-[rgba(var(--color-accent),0.3)]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[rgba(var(--color-primary),0.1)] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />
            </div>
            <div>
              <h3 className="mb-2">Tip for Today</h3>
              <p className="text-sm mb-3">{tipText}</p>
              <button
                onClick={() => onNavigate('insights')}
                className="text-sm text-[rgb(var(--color-primary))] hover:underline"
                type="button"
              >
                See what your data shows →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
