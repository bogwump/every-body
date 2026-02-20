import type { CheckInEntry, InsightMetricKey, UserData, InfluenceKey } from '../types';
import { isMetricInScope } from './insightsScope';

type MetricKey = InsightMetricKey;

export interface PatternPrompt {
  id: string;
  title: string;
  reason: string;
  durationDays: number;
  metrics: MetricKey[];
  changeKey?: InfluenceKey;
  steps: string[];
  note: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]) {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function getMetricValue(e: CheckInEntry, k: MetricKey): number | null {
  if (k === 'mood') {
    const m = (e as any).mood;
    if (m == null) return null;
    // Mood is 1..3 in this app. Map to 0..10-ish for comparison.
    return clamp(((Number(m) - 1) / 2) * 10, 0, 10);
  }
  if (typeof k === 'string' && k.startsWith('custom:')) {
    const id = k.slice('custom:'.length);
    const v = (e as any).customValues?.[id];
    return typeof v === 'number' ? v : null;
  }
  const v = (e as any).values?.[k as any];
  return typeof v === 'number' ? v : null;
}

/**
 * Pattern-aware prompts: small, gentle experiment ideas based on recent logs.
 * Conservative: only triggers when we have enough recent data to be useful.
 */
export function computePatternExperimentPrompts(entriesAll: CheckInEntry[], userData: UserData): PatternPrompt[] {
  const entries = (entriesAll ?? []).filter(Boolean);
  if (entries.length < 7) return [];

  const scoped = entries
    .filter((e) => (userData.insightsFromISO ? e.dateISO >= userData.insightsFromISO : true))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // Use the most recent 14 *logged* days (not calendar days).
  const recent = scoped.slice(-14);
  if (recent.length < 7) return [];

  // Candidate metrics (only those in scope and commonly useful).
  const candidates: MetricKey[] = ['sleep', 'energy', 'stress', 'anxiety', 'brainFog', 'fatigue', 'headache', 'mood'];
  const enabled = new Set<MetricKey>([...(userData.enabledModules ?? []), 'mood'] as any);
  const inScopeCandidates = candidates.filter((k) => enabled.has(k) && isMetricInScope(k as any, userData));

  const stats = inScopeCandidates
    .map((k) => {
      const xs = recent.map((e) => getMetricValue(e, k)).filter((v): v is number => typeof v === 'number');
      return { k, n: xs.length, avg: mean(xs), sd: stdev(xs) };
    })
    .filter((s) => s.n >= 5); // keep conservative

  const prompts: PatternPrompt[] = [];

  const byKey = new Map(stats.map((s) => [s.k, s]));

  // Prompt 1: sleep volatility -> bedtime consistency
  const sleep = byKey.get('sleep');
  if (sleep && sleep.sd >= 2.5) {
    prompts.push({
      id: 'sleep-consistency',
      title: '3-day sleep consistency test',
      reason: 'Your sleep has been a bit up-and-down recently. A tiny consistency test can reveal whether routine helps.',
      durationDays: 3,
      metrics: ['sleep', 'energy', 'mood'].filter((k) => enabled.has(k as any)) as any,
      changeKey: (userData.enabledInfluences ?? []).includes('lateNight') ? 'lateNight' : undefined,
      steps: [
        'Pick a realistic bedtime and wake time for the next 3 days (within a 60-minute window).',
        'If you can, keep caffeine and alcohol roughly the same as usual.',
        'Log sleep + energy each day, then review the before/after averages.',
      ],
      note: 'Aim for “good enough”, not perfect. If life happens, still log it. That is part of the signal.',
    });
  }

  // Prompt 2: high stress -> wind-down buffer
  const stress = byKey.get('stress');
  if (stress && stress.avg >= 6) {
    prompts.push({
      id: 'stress-buffer',
      title: '3-day stress buffer test',
      reason: 'Stress looks a little higher than usual. A tiny wind-down routine can be a quick way to see what helps.',
      durationDays: 3,
      metrics: ['stress', 'sleep', 'mood'].filter((k) => enabled.has(k as any)) as any,
      changeKey: (userData.enabledInfluences ?? []).includes('stressfulDay') ? 'stressfulDay' : undefined,
      steps: [
        'Choose one small wind-down habit (10 minutes): stretching, reading, breathwork, or a shower.',
        'Do it at roughly the same time each evening for 3 days.',
        'Log stress and sleep, then compare to your baseline.',
      ],
      note: 'This is about noticing patterns, not forcing calm. If it feels annoying, try a gentler option.',
    });
  }

  // Prompt 3: headaches + low hydration events -> hydration test
  const headache = byKey.get('headache');
  if (headache && headache.avg >= 5) {
    const lowHydrationDays = recent.filter((e) => (e as any).events?.lowHydration).length;
    if (lowHydrationDays >= 2) {
      prompts.push({
        id: 'hydration-headache',
        title: '3-day hydration support test',
        reason: 'Headache has been showing up, and low hydration is logged a few times. A short hydration test is a low-risk next step.',
        durationDays: 3,
        metrics: ['headache', 'energy', 'mood'].filter((k) => enabled.has(k as any)) as any,
        changeKey: 'lowHydration',
        steps: [
          'Add one extra glass of water in the morning and one mid-afternoon for 3 days.',
          'Keep other routines roughly the same if you can.',
          'Log headache and energy, then compare to baseline.',
        ],
        note: 'If you already hydrate well, swap this for a different low-effort change (for example, earlier lunch).',
      });
    }
  }

  // Prompt 4: anxiety + caffeine logged -> caffeine timing test
  const anxiety = byKey.get('anxiety');
  if (anxiety && anxiety.avg >= 6) {
    const caffeineDays = recent.filter((e) => (e as any).events?.caffeine).length;
    if (caffeineDays >= 2) {
      prompts.push({
        id: 'caffeine-timing',
        title: '3-day caffeine timing test',
        reason: 'Anxiety has been higher, and caffeine shows up in your logs. A timing tweak can be a gentle test.',
        durationDays: 3,
        metrics: ['anxiety', 'sleep', 'mood'].filter((k) => enabled.has(k as any)) as any,
        changeKey: 'caffeine',
        steps: [
          'Keep caffeine amount the same, but try having your last caffeine earlier (for example before 2pm).',
          'If you skip caffeine completely, note that in your experiment note.',
          'Log anxiety and sleep, then compare to baseline.',
        ],
        note: 'If caffeine helps you function, keep it. This test is about timing, not deprivation.',
      });
    }
  }

  // Keep the list short and non-overwhelming.
  return prompts.slice(0, 2);
}
