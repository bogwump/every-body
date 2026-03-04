import type { CheckInEntry, InsightMetricKey, SymptomKey, SymptomKind, UserData } from '../types';
import { filterByDays, pearsonCorrelation } from './analytics';
import { SYMPTOM_META } from './symptomMeta';
import { isMetricInScope } from './insightsScope';

export type MetricKey = InsightMetricKey;

export type TryNextPrompt = {
  id: string;
  title: string;
  changeKey: string;
  metrics: MetricKey[];
  durationDays: number;
  why: string[];
};

export type SuggestedExperimentItem = {
  id: string;
  title: string;
  body: string;
  confidence: 'low' | 'medium' | 'high';
  metrics: MetricKey[];
  allow: boolean;
  kind?: 'change' | 'track';
  durationDays?: number;
};

function hasNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalise10(v: unknown): number | undefined {
  if (!hasNum(v)) return undefined;
  const scaled = v > 10 ? Math.round(v / 10) : v;
  return Math.max(0, Math.min(10, scaled));
}

export function moodTo10(mood?: 1 | 2 | 3): number | undefined {
  if (!mood) return undefined;
  return mood === 1 ? 2 : mood === 2 ? 5 : 8;
}

export function valueForMetric(entry: CheckInEntry, key: MetricKey): number | undefined {
  if (!entry) return undefined;
  if (key === 'mood') return moodTo10((entry as any).mood);

  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const v = (entry as any)?.customValues?.[id];
    return normalise10(v);
  }

  const sym = key as SymptomKey;
  const v = (entry as any)?.values?.[sym];
  return normalise10(v);
}

export function labelForMetric(key: MetricKey, user?: UserData): string {
  const map: Record<string, string> = {
    mood: 'Overall mood',
    energy: 'Energy',
    sleep: 'Sleep',
    pain: 'Pain',
    headache: 'Headache',
    cramps: 'Cramps',
    jointPain: 'Joint pain',
    flow: 'Bleeding/spotting',
    stress: 'Stress',
    anxiety: 'Anxiety',
    irritability: 'Irritability',
    focus: 'Focus',
    bloating: 'Bloating',
    digestion: 'Digestion',
    acidReflux: 'Acid reflux',
    nausea: 'Nausea',
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

  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user?.customSymptoms ?? []).find((s) => s.id === id);
    return found?.label ?? 'Custom symptom';
  }

  const metaLabel = SYMPTOM_META[key as SymptomKey]?.label;
  return metaLabel ?? map[key as any] ?? (key as any);
}

export function getKindForMetric(key: MetricKey, user: UserData): SymptomKind {
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user.customSymptoms ?? []).find((s) => s.id === id);
    return found?.kind ?? 'other';
  }
  return SYMPTOM_META[key as SymptomKey]?.kind ?? 'other';
}

export function isHormonalMetric(key: MetricKey, user: UserData): boolean {
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user.customSymptoms ?? []).find((s) => s.id === id);
    return found?.kind === 'hormonal';
  }
  return !!SYMPTOM_META[key as SymptomKey]?.hormonal;
}

function variance(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (nums.length - 1);
}

export function buildExperimentPlan(metrics: Array<MetricKey>): { title: string; steps: string[]; note: string } {
  const keys = metrics
    .filter((k) => typeof k === 'string' && (k === 'mood' || !k.startsWith('custom:')))
    .filter(Boolean) as Array<SymptomKey | 'mood'>;
  const has = (k: any) => keys.includes(k);

  if (has('sleep') && (has('stress') || has('anxiety') || has('irritability'))) {
    return {
      title: '3-day sleep buffer',
      steps: [
        'Pick a fixed "lights out" target and set a 30-minute wind-down alarm.',
        'No caffeine after lunch. Swap to decaf or herbal tea.',
        'Do a 10-minute downshift: gentle stretch, shower, or a short walk.',
      ],
      note: 'Log sleep + stress each day. If stress drops even 1-2 points, keep it going for a week.',
    };
  }

  if ((has('cramps') || has('pain') || has('headache')) && (has('sleep') || has('fatigue'))) {
    return {
      title: '3-day pain support combo',
      steps: [
        'Hydration check: add one extra glass of water mid-morning and mid-afternoon.',
        'Gentle movement: 10 minutes of walking or mobility.',
        'If magnesium suits you, take it at the same time daily for 3 days (avoid if it disagrees with you).',
      ],
      note: 'Compare today vs yesterday in Daily Check-in to see if you are trending better.',
    };
  }

  if (has('bloating') || has('digestion') || has('nausea')) {
    return {
      title: '3-day digestion calm',
      steps: [
        'Keep dinner a bit earlier (even 45 minutes helps).',
        'Try a simple baseline breakfast (repeat it for 3 days).',
        'Add a short walk after eating if you can.',
      ],
      note: 'If bloating improves, you can test one change at a time next week to find your "lever".',
    };
  }

  if (has('hotFlushes') || has('nightSweats')) {
    return {
      title: '3-day temperature experiment',
      steps: [
        'Cool your sleeping space: lighter bedding, fan, or window crack if safe.',
        'Avoid alcohol and spicy food in the evening for 3 days.',
        'Try a 5-minute slow breathing wind-down before bed.',
      ],
      note: 'If night sweats improve, keep the "cooler nights" routine as your default.',
    };
  }

  return {
    title: '3-day micro-experiment',
    steps: [
      'Pick ONE small change you can actually do (sleep, hydration, caffeine, movement).',
      'Repeat it for 3 days (consistency beats intensity).',
      'Keep logging the same 3-5 metrics so the signal is clear.',
    ],
    note: 'The goal is to learn what moves your numbers, not be perfect.',
  };
}

export function generateTryNextPrompts(entriesAllSorted: CheckInEntry[], userData: UserData): TryNextPrompt[] {
  const recent = filterByDays(entriesAllSorted, 21);

  const makeStarter = (): TryNextPrompt => ({
    id: 'starter-simple-experiment',
    title: 'A simple 3-day experiment',
    changeKey: 'lateNight',
    metrics: (['mood', 'sleep', 'energy'] as MetricKey[]).filter((k) => isMetricInScope(k as any, userData)),
    durationDays: 3,
    why: [],
  });

  // Day 1+: always offer at least one idea.
  if (recent.length < 7) {
    const s = makeStarter();
    return s.metrics.length ? [s] : [];
  }

  // Day 14+: start being a bit more "data-led".
  // We keep it conservative: pick one metric with higher variability and suggest a tiny stabiliser.
  const candidates: MetricKey[] = (userData.enabledModules ?? [])
    .map((k) => k as any)
    .concat(userData.sleepInsightsEnabled ? (['sleep'] as any) : [])
    .concat(['mood' as any]);

  const uniq = Array.from(new Set(candidates)).filter((k) => isMetricInScope(k as any, userData));

  const scored = uniq
    .map((k) => {
      const xs: number[] = [];
      for (const e of recent) {
        const v = valueForMetric(e, k);
        if (typeof v === 'number') xs.push(v);
      }
      return { k, n: xs.length, v: variance(xs) };
    })
    .filter((s) => s.n >= 7 && s.v >= 0.6)
    .sort((a, b) => b.v - a.v);

  if (!scored.length) {
    const s = makeStarter();
    return s.metrics.length ? [s] : [];
  }

  const focus = scored[0].k;
  const title = `A steadier routine for ${labelForMetric(focus, userData).toLowerCase()}`;

  // Pick a gentle lever based on the focus metric.
  let changeKey = 'lateNight';
  let why: string[] = [];

  if (String(focus).includes('sleep')) {
    changeKey = 'lateNight';
    why = ['Your sleep has moved around recently. A consistent bedtime can make the next week easier to read.'];
  } else if (String(focus).includes('stress') || String(focus).includes('anxiety') || String(focus).includes('irritability')) {
    changeKey = 'stressfulDay';
    why = ['Stress has been a bit spiky recently. A tiny buffer can help you see whether your baseline shifts.'];
  } else if (String(focus).includes('digestion') || String(focus).includes('bloating') || String(focus).includes('acid')) {
    changeKey = 'caffeine';
    why = ['Digestive symptoms can be sensitive to routine. A small caffeine tweak is an easy, reversible test.'];
  } else {
    changeKey = 'lateNight';
    why = ['A steadier routine is a good first lever when patterns feel noisy.'];
  }

  return [
    {
      id: `try-next-${String(focus)}`,
      title,
      changeKey,
      metrics: ([focus, 'mood', 'energy'] as MetricKey[]).filter((k) => isMetricInScope(k as any, userData)).slice(0, 5),
      durationDays: 3,
      why,
    },
  ];
}

export function generateStrongSignalSuggestions(args: {
  corrPairs: Array<any>;
  findings: Array<any>;
  entriesAllSorted: CheckInEntry[];
  entriesSorted: CheckInEntry[];
  allMetricKeys: MetricKey[];
  userData: UserData;
}): SuggestedExperimentItem[] {
  const { corrPairs, findings, entriesAllSorted, entriesSorted, allMetricKeys, userData } = args;

  const items: SuggestedExperimentItem[] = [];

  // From corrPairs
  (corrPairs || []).slice(0, 8).forEach((p: any, idx: number) => {
    items.push({
      id: `corr-${idx}`,
      title: `${p.a} + ${p.b}`,
      body: `A ${p.confidence === 'high' ? 'clearer' : p.confidence === 'medium' ? 'possible' : 'new'} pattern based on ${p.n} days logged together.`,
      confidence: (p.confidence as any) || 'medium',
      metrics: [p.aKey, p.bKey].filter(Boolean),
      allow: Boolean(p.allowSuggestedExperiment),
      kind: 'change',
    });
  });

  // From findings
  (findings || [])
    .filter((f: any) => Boolean(f?.allowSuggestedExperiment) && Array.isArray(f?.metrics) && f.metrics.length)
    .slice(0, 8)
    .forEach((f: any, idx: number) => {
      items.push({
        id: `find-${idx}`,
        title: f.title,
        body: f.body,
        confidence: (f.confidence as any) || 'medium',
        metrics: (f.metrics as any[]).slice(0, 3),
        allow: true,
        kind: 'change',
      });
    });

  // 21+ days: body<->body co-movement becomes useful for prediction.
  // Suggest a TRACKING experiment (not a behaviour change) so we don't imply "fixing" hormonal symptoms.
  if (entriesAllSorted.length >= 21) {
    const bodyKinds = new Set<SymptomKind>(['physio', 'hormonal']);
    const candidateKeys = (allMetricKeys as MetricKey[]).filter((k) => bodyKinds.has(getKindForMetric(k, userData)));

    const bodyPairs: Array<{ aKey: MetricKey; bKey: MetricKey; r: number; n: number; quality: number }> = [];

    for (let i = 0; i < candidateKeys.length; i++) {
      for (let j = i + 1; j < candidateKeys.length; j++) {
        const aKey = candidateKeys[i];
        const bKey = candidateKeys[j];

        const xs: number[] = [];
        const ys: number[] = [];

        for (const e of entriesSorted) {
          const av = valueForMetric(e, aKey);
          const bv = valueForMetric(e, bKey);
          if (typeof av === 'number' && typeof bv === 'number') {
            xs.push(av);
            ys.push(bv);
          }
        }

        const n = xs.length;
        if (n < 10) continue;
        const vA = variance(xs);
        const vB = variance(ys);
        if (vA < 0.2 || vB < 0.2) continue;

        const r = pearsonCorrelation(xs, ys);
        if (!Number.isFinite(r)) continue;
        if (Math.abs(r) < 0.45) continue;

        const quality = Math.abs(r) * (Math.min(n, 14) / 14);
        bodyPairs.push({ aKey, bKey, r, n, quality });
      }
    }

    bodyPairs
      .sort((p, q) => q.quality - p.quality)
      .slice(0, 4)
      .forEach((p, idx) => {
        items.push({
          id: `bodytrack-${idx}`,
          title: `${labelForMetric(p.aKey, userData)} + ${labelForMetric(p.bKey, userData)}`,
          body: `These have tended to rise and fall together across ${p.n} days. Next step: keep logging both for 7 days and note which one tends to arrive first.`,
          confidence: 'medium',
          metrics: [p.aKey, p.bKey],
          allow: true,
          kind: 'track',
          durationDays: 7,
        });
      });
  }

  const uniq = new Map<string, SuggestedExperimentItem>();
  items.forEach((it) => {
    const key = (it.metrics || []).join('|');
    if (!uniq.has(key)) uniq.set(key, it);
  });

  return Array.from(uniq.values()).filter((it) => it.allow).slice(0, 10);
}
