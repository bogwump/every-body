import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Activity, ArrowRight, Download, FlaskConical, Sparkles } from 'lucide-react';
import type { CheckInEntry, CyclePhase, SymptomKey, SymptomKind, UserData, ExperimentPlan, InsightMetricKey } from '../types';
import { useEntries, useExperiment } from '../lib/appStore';
import { downloadTextFile } from '../lib/storage';
import { calculateStreak, computeCycleStats, estimatePhaseByFlow, filterByDays, pearsonCorrelation, sortByDateAsc } from '../lib/analytics';
import { isoFromDateLocal, isoTodayLocal } from '../lib/date';
import { SYMPTOM_META, kindLabel } from '../lib/symptomMeta';
import { getMixedChartColors } from '../lib/chartPalette';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { EBDialogContent } from './EBDialog';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './ui/carousel';

interface InsightsProps {
  userData: UserData;
  onOpenCheckIn?: (dateISO: string) => void;
}

type Timeframe = 'week' | 'month' | '3months';

type MetricKey = InsightMetricKey;


const TIMEFRAMES: Array<{ key: Timeframe; label: string; days: number }> = [
  { key: 'week', label: '7 days', days: 7 },
  { key: 'month', label: '30 days', days: 30 },
  { key: '3months', label: '90 days', days: 90 },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hasNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalise10(v: unknown): number | undefined {
  if (!hasNum(v)) return undefined;
  const scaled = v > 10 ? Math.round(v / 10) : v;
  return Math.max(0, Math.min(10, scaled));
}

function moodTo10(mood?: 1 | 2 | 3): number | undefined {
  if (!mood) return undefined;
  return mood === 1 ? 2 : mood === 2 ? 5 : 8;
}

// Read a metric value from an entry.
// - Symptom keys live in entry.values
// - Overall mood lives in entry.mood (mapped to 0–10)
// - Custom metrics are stored in entry.customValues keyed by custom id
function valueForMetric(entry: CheckInEntry, key: MetricKey): number | undefined {
  if (key === 'mood') return moodTo10(entry.mood);

  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const v = (entry as any)?.customValues?.[id];
    return normalise10(v);
  }

  const sym = key as SymptomKey;
  const v = (entry as any)?.values?.[sym];
  return normalise10(v);
}

function Sparkline({ values }: { values: Array<number | null | undefined> }) {
  const nums = values.filter((v) => typeof v === 'number') as number[];
  if (nums.length < 2) return null;

  // Scale to a tiny 90x28 sparkline.
  const w = 90;
  const h = 28;
  const pad = 2;

  const min = 0;
  const max = 10;
  const xStep = (w - pad * 2) / Math.max(1, nums.length - 1);
  const pts = nums
    .map((v, i) => {
      const x = pad + i * xStep;
      const y = pad + (h - pad * 2) * (1 - (v - min) / (max - min));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(var(--color-primary))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />
    </svg>
  );
}

function labelFor(key: MetricKey, user?: UserData): string {
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

function getKindForMetric(key: InsightMetricKey, user: UserData): SymptomKind {
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const found = (user.customSymptoms ?? []).find((s) => s.id === id);
    return found?.kind ?? 'other';
  }
  return SYMPTOM_META[key as SymptomKey]?.kind ?? 'other';
}

function isHormonalMetric(key: InsightMetricKey, user: UserData): boolean {
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

type ConfidenceLevel = 'low' | 'medium' | 'high';

function confidenceFrom(rAbs: number, n: number): ConfidenceLevel {
  if (rAbs >= 0.65 && n >= 12) return 'high';
  if (rAbs >= 0.5 && n >= 8) return 'medium';
  return 'low';
}

function qualityScore(rAbs: number, n: number): number {
  const strength = Math.min(1, Math.max(0, (rAbs - 0.35) / 0.45));
  const support = Math.min(1, n / 14);
  return Math.round(100 * (0.65 * strength + 0.35 * support));
}

function insightQualityScore(args: {
  r: number;
  n: number;
  kindA: SymptomKind;
  kindB: SymptomKind;
  aKey: InsightMetricKey;
  bKey: InsightMetricKey;
  userData: any;
}): number {
  const rAbs = Math.abs(args.r);
  let score = qualityScore(rAbs, args.n);

  const { kindA, kindB, n } = args;

  const isBehaviourState =
    (kindA === 'behaviour' && kindB === 'state') || (kindA === 'state' && kindB === 'behaviour');

  const isPhysPair =
    (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');

  const mixesBodyAndLife =
    (kindA === 'behaviour' && (kindB === 'physio' || kindB === 'hormonal')) ||
    (kindB === 'behaviour' && (kindA === 'physio' || kindA === 'hormonal'));

  if (isBehaviourState) score += 10;
  if (isPhysPair) score -= 15;
  if (mixesBodyAndLife) score -= 10;

  if (n < 6) score = Math.min(score, 55);
  if (rAbs < 0.4) score -= 12;

  return clamp(Math.round(score), 0, 100);
}


function getMetricValue(entry: CheckInEntry, key: MetricKey): number | undefined {
  if (key === 'mood') return moodTo10(entry.mood);
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    return normalise10((entry as any)?.customValues?.[id]);
  }
  return normalise10((entry.values as any)?.[key]);
}

function slope(values: Array<{ x: number; y: number }>): number {
  if (values.length < 3) return NaN;
  const xs = values.map((p) => p.x);
  const ys = values.map((p) => p.y);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;

  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return NaN;
  return num / den;
}

function chipClass(active: boolean) {
  return (
    'px-3 py-1.5 rounded-2xl text-sm transition ' +
    (active
      ? 'bg-black text-white shadow-sm'
      : 'bg-white text-black border border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.18)]')
  );
}

function strengthLabel(r: number): 'Small' | 'Moderate' | 'Strong' | 'Unknown' {
  if (!Number.isFinite(r)) return 'Unknown';
  const a = Math.abs(r);
  if (a >= 0.7) return 'Strong';
  if (a >= 0.5) return 'Moderate';
  if (a >= 0.3) return 'Small';
  return 'Small';
}

function humanDirection(r: number, a: string, b: string): string {
  if (!Number.isFinite(r)) return 'Not enough overlap yet.';
  if (r >= 0.25) return `Your ${a} and ${b} tend to rise and fall together.`;
  if (r <= -0.25) return `When your ${a} is higher, your ${b} tends to be lower (and vice versa).`;
  return `${a} and ${b} do not show a clear relationship yet.`;
}

function ctaLabelForPair(aKey: MetricKey, bKey: MetricKey, userData: UserData): string {
  const keys = [aKey, bKey];
  const has = (k: any) => keys.includes(k);
  if (has('sleep')) return 'Try a sleep experiment';
  if (has('stress')) return 'Try a stress experiment';
  if (has('energy')) return 'Try an energy experiment';
  if (has('bloating')) return 'Try a digestion experiment';
  if (has('pain')) return 'Try a comfort experiment';
  if (has('focus')) return 'Try a clarity experiment';
  return 'Try a small experiment';
}

function suggestionForPair(r: number, aKey: MetricKey, bKey: MetricKey, aLabel: string, bLabel: string): string | null {
  const keys = [aKey, bKey];
  const has = (k: any) => keys.includes(k);

  // Keep suggestions gentle and optional.
  if (has('sleep') && has('stress')) {
    return 'Want to try a 3-day wind-down experiment and see what happens?';
  }
  if (has('sleep') && has('mood')) {
    return r < 0
      ? 'Want to try a small sleep experiment and see if it shifts your mood too?'
      : 'Want to try a small sleep experiment and see if it steadies both?';
  }
  if (has('stress') && has('mood')) {
    return 'Want to try one tiny calm-down change for 3 days and see if your mood follows?';
  }
  if (has('energy') && has('focus')) {
    return r < 0
      ? 'Want to try a pacing experiment for 3 days and see if focus improves?'
      : 'Want to try a 3-day “steady routine” experiment and see if both lift together?';
  }

  // Default: only suggest when the relationship is clearer.
  if (!Number.isFinite(r) || Math.abs(r) < 0.25) return null;
  return `Want to try a 3-day experiment around ${aLabel.toLowerCase()} and ${bLabel.toLowerCase()} and see what moves the needle?`;
}

type Finding = {
  title: string;
  body: string;
  metrics?: Array<MetricKey>;
  kind: 'trend' | 'correlation' | 'pattern';
};

function buildExperimentPlan(metrics: Array<MetricKey>): { title: string; steps: string[]; note: string } {
  const keys = metrics
    .filter((k) => typeof k === 'string' && (k === 'mood' || !k.startsWith('custom:')))
    .filter(Boolean) as Array<SymptomKey | 'mood'>;
  const has = (k: any) => keys.includes(k);

  // A few gentle, “soft” experiments. These are suggestions, not medical advice.
  if (has('sleep') && (has('stress') || has('anxiety') || has('irritability'))) {
    return {
      title: '3-day sleep buffer',
      steps: [
        'Pick a fixed “lights out” target and set a 30-minute wind-down alarm.',
        'No caffeine after lunch. Swap to decaf or herbal tea.',
        'Do a 10-minute downshift: gentle stretch, shower, or a short walk.',
      ],
      note: 'Log sleep + stress each day. If stress drops even 1–2 points, keep it going for a week.',
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
      note: 'If bloating improves, you can test one change at a time next week to find your “lever”.',
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
      note: 'If night sweats improve, keep the “cooler nights” routine as your default.',
    };
  }

  return {
    title: '3-day micro-experiment',
    steps: [
      'Pick ONE small change you can actually do (sleep, hydration, caffeine, movement).',
      'Repeat it for 3 days (consistency beats intensity).',
      'Keep logging the same 3–5 metrics so the signal is clear.',
    ],
    note: 'The goal is to learn what moves your numbers, not be perfect.',
  };
}

function buildHtmlReport(args: {
  userData: UserData;
  timeframeLabel: string;
  entries: CheckInEntry[];
  selected: Array<MetricKey>;
  highlights: Finding[];
  topCorr: Array<{ a: string; b: string; r: number; n: number }>;
}) {
  const { userData, timeframeLabel, entries, selected, highlights, topCorr } = args;

  const todayISO = isoTodayLocal();
  const title = `EveryBody Insights Report (${timeframeLabel})`;
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root { --bg:#0b0b10; --card:#12121a; --text:#f3f3f7; --muted:rgba(243,243,247,.72); --line:rgba(243,243,247,.10); }
  body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--text); }
  .wrap{ max-width: 900px; margin:0 auto; padding: 28px 16px 56px; }
  h1{ margin:0; font-size: 22px; letter-spacing:.2px; }
  .meta{ font-size: 12px; color: var(--muted); margin-top: 6px; }
  .card{ background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px 14px; margin-top: 14px; }
  .card h2{ margin:0 0 8px; font-size: 12px; color: var(--muted); font-weight: 700; letter-spacing: .3px; text-transform: uppercase; }
  ul{ margin: 0; padding-left: 18px; }
  li{ margin: 6px 0; }
  table{ width: 100%; border-collapse: collapse; font-size: 13px; }
  th,td{ text-align:left; padding: 10px 8px; border-bottom: 1px solid var(--line); }
  th{ color: var(--muted); font-weight: 700; }
  .pill{ display:inline-block; padding: 6px 10px; border-radius: 999px; border:1px solid var(--line); background: rgba(255,255,255,.03); font-size: 12px; color: var(--muted); }
  .note{ color: var(--muted); font-size: 12px; margin-top: 10px; line-height: 1.45; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(title)}</h1>
    <div class="meta">Generated ${esc(todayISO)} • ${entries.length} days • Goal: ${esc(userData.goal ?? 'not set')}</div>

    <div class="card">
      <h2>Selected metrics</h2>
      <div class="pill">${esc(selected.map(labelFor).join(' • '))}</div>
    </div>

    <div class="card">
      <h2>Top findings</h2>
      <ul>
        ${highlights.slice(0, 8).map((f) => `<li><b>${esc(f.title)}</b> – ${esc(f.body)}</li>`).join('')}
      </ul>
      <div class="note">Early signals, not medical conclusions. More days logged = more reliable patterns.</div>
    </div>

    <div class="card">
      <h2>Strongest relationships</h2>
      <table>
        <thead><tr><th>A</th><th>B</th><th>Strength</th></tr></thead>
        <tbody>
          ${topCorr
            .slice(0, 10)
            .map((p) => {
              const r = Number.isFinite(p.r) ? p.r : NaN;
              return `<tr><td>${esc(p.a)}</td><td>${esc(p.b)}</td><td>${esc(strengthLabel(r))}</td></tr>`;
            })
            .join('')}
        </tbody>
      </table>
      <div class="note">Correlation means “moves together”, not “causes”. Use the app’s experiments to test what helps you.</div>
    </div>

    <div class="card">
      <h2>How to open</h2>
      <div class="pill">Open this file in your browser (Chrome/Safari). Do not open in Notepad.</div>
    </div>
  </div>
</body>
</html>`;
  return html;
}

export function Insights({ userData, onOpenCheckIn }: InsightsProps) {
  const { entries } = useEntries();
  const entriesAllSorted = useMemo(() => sortByDateAsc(Array.isArray(entries) ? entries : []), [entries]);

  const [timeframe, setTimeframe] = useState<Timeframe>('month');
    const [smoothTrends, setSmoothTrends] = useState<boolean>(false);
const days = TIMEFRAMES.find((t) => t.key === timeframe)?.days ?? 30;

  const entriesSorted = useMemo(() => filterByDays(entriesAllSorted, days), [entriesAllSorted, days]);
  const streak = useMemo(() => calculateStreak(entriesAllSorted), [entriesAllSorted]);
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  // --- metric selection (for analysis) ---
  const selectableKeys: MetricKey[] = useMemo(() => {
    // Prefer enabled modules first so the list feels personal, then add the rest.
    const enabled = (userData.enabledModules ?? []) as SymptomKey[];
    const customs = (userData.customSymptoms ?? []).filter((s) => s && s.enabled).map((s) => (`custom:${s.id}` as MetricKey));
    const all: SymptomKey[] = [
      'energy',
      'sleep',
      'stress',
      'focus',
      'bloating',
      'pain',
      'fatigue',
      'brainFog',
      'nightSweats',
      'hairShedding',
      'facialSpots',
      'cysts',
      'flow',
      'headache',
      'anxiety',
      'irritability',
      'digestion',
      'nausea',
      'cramps',
      'jointPain',
      'hotFlushes',
      'dizziness',
      'appetite',
      'libido',
      'breastTenderness',
    ].filter(Boolean) as SymptomKey[];

    const dedup = (arr: MetricKey[]) => Array.from(new Set(arr));
    return dedup([...(enabled as any), ...all, ...customs]);
  }, [userData.enabledModules, userData.customSymptoms]);

  // Backwards-compatible alias: older logic refers to allMetricKeys.
  // Keep them identical so we do not accidentally change behaviour.
  const allMetricKeys = selectableKeys;


  const [selected, setSelected] = useState<Array<MetricKey>>(() => {
    const defaultKeys: Array<MetricKey> = ['mood', 'sleep', 'energy', 'stress'];
    // Add a couple more if available so the Insights panels have enough to work with.
    const extras = allMetricKeys.filter((k) => !defaultKeys.includes(k)).slice(0, 2);
    const fallback = [...defaultKeys, ...extras].slice(0, 6);

    try {
      const saved = localStorage.getItem('insights:selected');
      const parsed = saved ? (JSON.parse(saved) as unknown) : null;
      if (Array.isArray(parsed) && parsed.length) {
        const valid = (parsed as Array<MetricKey>).filter((k) => allMetricKeys.includes(k));
        // If the saved list is tiny (for example after using the old “Focus” button),
        // fall back so the page stays testable.
        if (valid.length < 4) return fallback;
        return valid.slice(0, 6);
      }
    } catch {
      // ignore
    }

    // Keep it light by default: mood + the app's core metrics
    return fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem('insights:selected', JSON.stringify(selected.slice(0, 6)));
    } catch {
      // ignore
    }
  }, [selected]);

  const toggleMetric = (k: SymptomKey | 'mood') => {
    setSelected((prev) => {
      const has = prev.includes(k);
      if (has) return prev.filter((x) => x !== k);
      if (prev.length >= 6) return prev;
      return [...prev, k];
    });
  };

  // Ensure at least 3 for charts
  useEffect(() => {
    if (selected.length === 0) setSelected(['mood', 'sleep', 'energy']);
    if (selected.length === 1) setSelected((prev) => [...prev, 'sleep']);
  }, [selected.length]);

  const [weekdayMetric, setWeekdayMetric] = useState<MetricKey>(() => (selected[0] ?? 'mood') as MetricKey);
  const [distributionMetric, setDistributionMetric] = useState<MetricKey>(() => (selected[0] ?? 'mood') as MetricKey);

  useEffect(() => {
    if (!selected.includes(weekdayMetric)) setWeekdayMetric((selected[0] ?? 'mood') as MetricKey);
    if (!selected.includes(distributionMetric)) setDistributionMetric((selected[0] ?? 'mood') as MetricKey);
  }, [selected, weekdayMetric, distributionMetric]);

  // --- Series for trends chart ---
    const seriesForChart = useMemo(() => {
    const out: Array<Record<string, any>> = [];
    entriesSorted.forEach((e) => {
      const row: Record<string, any> = { dateISO: e.dateISO, dateLabel: fmtDateShort(e.dateISO) };
      selected.forEach((k) => {
        row[String(k)] = getMetricValue(e, k);
      });
      out.push(row);
    });

    if (!smoothTrends) return out;

    // 3‑day rolling average (only across available data points).
    const smoothed = out.map((row, idx) => {
      const next = { ...row };
      selected.forEach((k) => {
        const key = String(k);
        const vals: number[] = [];
        for (let j = Math.max(0, idx - 2); j <= idx; j++) {
          const v = out[j]?.[key];
          if (typeof v === 'number' && !Number.isNaN(v)) vals.push(v);
        }
        next[key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : row[key];
      });
      return next;
    });

    return smoothed;
  }, [entriesSorted, selected, smoothTrends]);

  const distributionData = useMemo(() => {
    const low = { name: '0–3', value: 0 };
    const mid = { name: '4–6', value: 0 };
    const high = { name: '7–10', value: 0 };

    entriesSorted.forEach((e) => {
      const v = getMetricValue(e, distributionMetric);
      if (typeof v !== 'number') return;
      if (v <= 3) low.value += 1;
      else if (v <= 6) mid.value += 1;
      else high.value += 1;
    });

    return [low, mid, high].filter((d) => d.value > 0);
  }, [entriesSorted, distributionMetric]);

  const highSymptomDays = useMemo(() => {
    // For each selected metric, count days where value >= 7.
    const items = selected.map((k) => {
      let count = 0;
      entriesSorted.forEach((e) => {
        const v = getMetricValue(e, k);
        if (typeof v === 'number' && v >= 7) count += 1;
      });
      return { key: k, count };
    });

    items.sort((a, b) => b.count - a.count);
    return items.filter((x) => x.count > 0).slice(0, 4);
  }, [entriesSorted, selected]);

  // --- Highlights / findings ---
  const minDaysForDeep = 7;
  const deepReady = entriesSorted.length >= minDaysForDeep;

  const findings: Finding[] = useMemo(() => {
    const out: Finding[] = [];

    // Trend findings
    const trendStats = selected
      .map((k) => {
        const pts: Array<{ x: number; y: number }> = [];
        entriesSorted.forEach((e, idx) => {
          const v = getMetricValue(e, k);
          if (v != null) pts.push({ x: idx, y: v });
        });
        const s = slope(pts);
        return { key: k, slope: s, n: pts.length };
      })
      .filter((t) => t.n >= 3 && Number.isFinite(t.slope))
      .sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope));

    if (trendStats[0]) {
      const t = trendStats[0];
      const dir = t.slope > 0 ? 'up' : 'down';
      out.push({
        kind: 'trend',
        title: `${labelFor(t.key, userData)} is trending ${dir}.`,
        body: `A gentle change across your last ${Math.min(entriesSorted.length, days)} days.`,
        metrics: [t.key],
      });
    }

    // Yesterday delta (if possible)
    if (entriesAllSorted.length >= 2) {
      const last = entriesAllSorted[entriesAllSorted.length - 1];
      const prev = entriesAllSorted[entriesAllSorted.length - 2];
      const deltas: Array<{ key: SymptomKey | 'mood'; d: number }> = [];
      selected.forEach((k) => {
        const a = getMetricValue(last, k);
        const b = getMetricValue(prev, k);
        if (a != null && b != null) deltas.push({ key: k, d: a - b });
      });
      deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      if (deltas[0] && Math.abs(deltas[0].d) >= 2) {
        const d = deltas[0];
        out.push({
          kind: 'pattern',
          title: `Since yesterday: ${labelFor(d.key, userData)} ${d.d > 0 ? 'rose' : 'fell'} by ${Math.abs(Math.round(d.d))}.`,
          body: 'Use yesterday as your anchor when you log today.',
          metrics: [d.key],
        });
      }
    }

    // Strongest correlation among selected (conservative + safe)
    const metrics = selected.slice(0, 6);
    let best: { a: any; b: any; r: number; n: number; quality: number; confidence: ConfidenceLevel; hormonal: boolean } | null = null;
    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        const a = metrics[i];
        const b = metrics[j];
        const xs: number[] = [];
        const ys: number[] = [];
        entriesSorted.forEach((e) => {
          const x = getMetricValue(e, a);
          const y = getMetricValue(e, b);
          if (x != null && y != null) {
            xs.push(x);
            ys.push(y);
          }
        });
        const n = xs.length;
        if (n < 6) continue;
        if (variance(xs) < 0.15 || variance(ys) < 0.15) continue;
        const r = pearsonCorrelation(xs, ys);
        if (!Number.isFinite(r)) continue;
        const rAbs = Math.abs(r);
        if (rAbs < 0.4) continue;

        const kindA = getKindForMetric(a as any, userData);
        const kindB = getKindForMetric(b as any, userData);

        const isBehaviourState =
          (kindA === 'behaviour' && kindB === 'state') || (kindA === 'state' && kindB === 'behaviour');
        if (!deepReady && !isBehaviourState) continue;
        const hormonal = isHormonalMetric(a as any, userData) || isHormonalMetric(b as any, userData);
        if (hormonal && (entriesSorted.length < 14 || n < 10)) continue;
        const bothBodyish =
          (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');
        if (bothBodyish) continue;

        const confidence = confidenceFrom(rAbs, n);
        const quality = qualityScore(rAbs, n);
        if (quality < 35) continue;

        const cand = { a, b, r, n, quality, confidence, hormonal };
        if (!best || cand.quality > best.quality) best = cand;
      }
    }

    if (best) {
      out.push({
        kind: 'correlation',
        title: `${best.confidence === 'high' ? 'Stronger' : best.confidence === 'medium' ? 'Possible' : 'Weak'} pattern: ${labelFor(best.a, userData)} and ${labelFor(best.b, userData)}.`,
        body: best.hormonal
          ? `There may be a pattern where these ${best.r > 0 ? 'move together' : 'move in opposite directions'}. This could reflect stress, lifestyle, or hormonal changes.`
          : `There may be a pattern where these ${best.r > 0 ? 'move together' : 'move in opposite directions'}.`,
        metrics: [best.a, best.b],
      });
    }

    // Nudge if user hasn't enabled much
    if ((userData.enabledModules ?? []).length <= 6) {
      out.push({
        kind: 'pattern',
        title: 'Want sharper insights?',
        body: 'In Profile, switch on 1–2 extra symptoms you care about. Keep it lightweight.',
      });
    }

    return out.slice(0, 8);
  }, [selected, entriesSorted, entriesAllSorted, days, userData.enabledModules]);

  // --- Correlations list (for soft display + report) ---
  const corrPairs = useMemo(() => {
    const allowEarlyBehaviourState = entriesSorted.length >= 4;
    // If the user has <4 days, we avoid showing relationships because they are too jumpy.
    if (!deepReady && !allowEarlyBehaviourState) {
      return [] as Array<{
        a: string;
        b: string;
        r: number;
        n: number;
        aKey: InsightMetricKey;
        bKey: InsightMetricKey;
        quality: number;
        kindA: SymptomKind;
        kindB: SymptomKind;
      }>;
    }

    const minAbsR = 0.4;

    // We want users to see *some* early signal by day 4, otherwise it's too easy to lose interest.
    // Hormonal-related patterns stay strict, everything else can surface earlier as "early signal".
    const minOverlapForPair = (aKey: InsightMetricKey, bKey: InsightMetricKey, kindA: SymptomKind, kindB: SymptomKind) => {
      const hormonal = isHormonalMetric(aKey, userData) || isHormonalMetric(bKey, userData);
      if (hormonal) return 10; // stricter support for hormonal insights
      // Early phase (4–6 days): allow a bit earlier, but only for relationships that are less "body ↔ body".
      if (!deepReady) return 4;
      return 6;
    };

    const computePairs = (keys: InsightMetricKey[]) => {
      const out: Array<{
        a: string;
        b: string;
        r: number;
        n: number;
        aKey: InsightMetricKey;
        bKey: InsightMetricKey;
        quality: number;
        kindA: SymptomKind;
        kindB: SymptomKind;
      }> = [];

      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const aKey = keys[i];
          const bKey = keys[j];

          // Ignore self / identical keys
          if (aKey === bKey) continue;

          // Align series on overlapping days
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

          const kindA = getKindForMetric(aKey, userData);
          const kindB = getKindForMetric(bKey, userData);

          // Hormonal correlations stay strict (needs more days and overlap).
          const hormonalPair = isHormonalMetric(aKey, userData) || isHormonalMetric(bKey, userData);
          if (hormonalPair && (entriesSorted.length < 14 || n < 10)) continue;

          const minOverlap = minOverlapForPair(aKey, bKey, kindA, kindB);
          if (n < minOverlap) continue;

          // Ignore flat-line variables (very low variance)
          const vA = variance(xs);
          const vB = variance(ys);
          if (vA < 0.15 || vB < 0.15) continue;

          const r = pearsonCorrelation(xs, ys);
          if (!Number.isFinite(r)) continue;
          if (Math.abs(r) < minAbsR) continue;

          // Block physio ↔ physio (including hormonal) suggestions entirely.
          const bothBodyish = (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');
          if (bothBodyish) continue;

          // Early phase (4–6 days): allow a few more useful relationships so the page doesn't feel empty.
          // We still keep it conservative: no body↔body, and we prioritise behaviour/state links.
          if (!deepReady) {
            const isBehaviourState =
              (kindA === 'behaviour' && kindB === 'state') || (kindA === 'state' && kindB === 'behaviour');

            const involvesBehaviour = kindA === 'behaviour' || kindB === 'behaviour';
            const involvesState = kindA === 'state' || kindB === 'state';

            // Allow behaviour↔state, and behaviour↔body (e.g. sleep ↔ stress, alcohol ↔ hot flushes),
            // but avoid state↔body in early phase as it tends to overfit.
            const allowedEarly = isBehaviourState || (involvesBehaviour && !isBehaviourState) || (involvesBehaviour && involvesState);

            if (!allowedEarly) continue;
          }

          const quality = insightQualityScore({ r, n, kindA, kindB, aKey, bKey, userData });

          out.push({
            a: labelFor(aKey, userData),
            b: labelFor(bKey, userData),
            r,
            n,
            aKey,
            bKey,
            quality,
            kindA,
            kindB,
          });
        }
      }

      return out.sort((p, q) => q.quality - p.quality);
    };

    // First: try the user's selected metrics (keeps the feature feeling personal).
    let out = computePairs(selected);

    // If nothing qualifies, fall back to "anything you have actually logged".
    // This avoids the empty state when the user changes their selected list or hasn't logged some of those yet.
    if (out.length === 0) {
      const candidate = (allMetricKeys as InsightMetricKey[]).filter((k) => {
        // Must have enough data points on its own
        let count = 0;
        const vals: number[] = [];
        for (const e of entriesSorted) {
          const v = valueForMetric(e, k);
          if (typeof v === 'number') {
            count++;
            vals.push(v);
          }
        }
        if (count < (deepReady ? 6 : 4)) return false;
        if (variance(vals) < 0.15) return false;
        return true;
      });

      // Keep it bounded for performance
      const limited = candidate.slice(0, 14);
      out = computePairs(limited);
    }

    const base = out.slice(0, 6);

    // Enrich for UI copy (keeps render simple + avoids undefined refs when logic changes).
    return base.map((p) => {
      const hormonalInvolved = isHormonalMetric(p.aKey, userData) || isHormonalMetric(p.bKey, userData);
      const confidence = confidenceFrom(Math.abs(p.r), p.n);
      const allowSuggestedExperiment =
        (p.kindA === 'behaviour' || p.kindB === 'behaviour') &&
        // avoid suggesting experiments when the relationship is based on very few points
        p.n >= 4 &&
        // still avoid anything "body ↔ body"
        !((p.kindA === 'physio' || p.kindA === 'hormonal') && (p.kindB === 'physio' || p.kindB === 'hormonal'));

      const why = [
        `You logged both metrics on ${p.n} day${p.n === 1 ? '' : 's'}.`,
        deepReady
          ? `This is calculated from your recent logs and will update as you add more days.`
          : `This is an early signal. With only a few days logged, it may change as you add more data.`,
        hormonalInvolved
          ? `Hormones can influence lots of symptoms at once, so treat this as a prompt to notice patterns, not a diagnosis.`
          : `Correlation does not mean one causes the other.`,
      ].filter(Boolean);

      return { ...p, hormonalInvolved, confidence, allowSuggestedExperiment, why };
    });
  }, [deepReady, entriesSorted, selected, userData, allMetricKeys]);

  // --- Relationship explorer ---
  const [scatterX, setScatterX] = useState<SymptomKey | 'mood'>(() => selected[0] ?? 'mood');
  const [scatterY, setScatterY] = useState<SymptomKey | 'mood'>(() => selected[1] ?? 'sleep');

  useEffect(() => {
    if (!selected.includes(scatterX)) setScatterX(selected[0] ?? 'mood');
    if (!selected.includes(scatterY)) setScatterY(selected[1] ?? 'sleep');
  }, [selected]);

  const scatterData = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; dateLabel: string }> = [];
    entriesSorted.forEach((e) => {
      const x = getMetricValue(e, scatterX);
      const y = getMetricValue(e, scatterY);
      if (x != null && y != null) {
        out.push({ x, y, z: 1, dateLabel: fmtDateShort(e.dateISO) });
      }
    });
    return out;
  }, [entriesSorted, scatterX, scatterY]);


// --- Weekday pattern ---
  const weekdayBar = useMemo(() => {
    const key = (weekdayMetric as any) ?? (selected[0] ?? 'mood');
    const buckets: Record<string, number[]> = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
    entriesSorted.forEach((e) => {
      const dt = new Date(e.dateISO + 'T00:00:00');
      const wd = dt.toLocaleDateString(undefined, { weekday: 'short' });
      const v = getMetricValue(e, key);
      if (v != null) buckets[wd]?.push(v);
    });
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return order.map((d) => {
      const vals = buckets[d] ?? [];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { day: d, avg };
    });
  }, [entriesSorted, selected, weekdayMetric]);

  // --- Cycle phase chart (restored) ---
  type PhaseMetric = SymptomKey | 'mood';
  const PHASE_METRICS: Array<{ key: PhaseMetric; label: string }> = useMemo(
    () => [
      { key: 'energy', label: 'Energy' },
      { key: 'sleep', label: 'Sleep' },
      { key: 'stress', label: 'Stress' },
      { key: 'pain', label: 'Pain' },
      { key: 'bloating', label: 'Bloating' },
      { key: 'fatigue', label: 'Fatigue' },
      { key: 'brainFog', label: 'Brain fog' },
      { key: 'focus', label: 'Clarity' },
      { key: 'nightSweats', label: 'Night sweats' },
      { key: 'flow', label: 'Bleeding/spotting' },
      { key: 'mood', label: 'Mood' },
    ],
    [],
  );

  const defaultPhaseMetrics = useMemo(() => (['energy', 'mood', 'pain'] as [PhaseMetric, PhaseMetric, PhaseMetric]), []);
  const [phaseMetrics, setPhaseMetrics] = useState<[PhaseMetric, PhaseMetric, PhaseMetric]>(() => {
    try {
      const raw = localStorage.getItem('insights:phaseMetrics');
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed) && parsed.length === 3) return parsed as any;
    } catch {
      // ignore
    }
    return defaultPhaseMetrics;
  });

  useEffect(() => {
    try {
      localStorage.setItem('insights:phaseMetrics', JSON.stringify(phaseMetrics));
    } catch {
      // ignore
    }
  }, [phaseMetrics]);

  const hasFlow = useMemo(
    () => entriesAllSorted.some((e) => {
      const v = normalise10((e.values as any)?.flow);
      return v != null && v > 0;
    }),
    [entriesAllSorted],
  );

  // Phase insights can also work via manual cycle overrides ("New cycle started today")
  const hasCycleOverride = useMemo(() => entriesAllSorted.some((e) => (e as any)?.cycleStartOverride === true), [entriesAllSorted]);
  const hasCycleSignal = cycleEnabled && (hasFlow || hasCycleOverride);

  const phaseBuckets = useMemo(() => {
    if (!cycleEnabled || !hasCycleSignal) return null;

    const sorted = entriesAllSorted;
    const buckets: Record<CyclePhase, CheckInEntry[]> = {
      Menstrual: [],
      Follicular: [],
      Ovulatory: [],
      Luteal: [],
      Unknown: [],
    };

    // Estimate phase day-by-day based on bleeding and cycle overrides
    const cycleStats = computeCycleStats(sorted);
    sorted.forEach((e, idx) => {
      const flow = normalise10((e.values as any)?.flow) ?? 0;
      const phase = estimatePhaseByFlow(sorted, idx, flow, cycleStats);
      // Safety: older/newer phase estimators may return strings outside our bucket keys.
      const safePhase: CyclePhase = (phase && (phase as any) in buckets ? (phase as CyclePhase) : 'Unknown');
      buckets[safePhase].push(e);
    });

    return buckets;
  }, [entriesAllSorted, cycleEnabled, hasCycleSignal]);

  const avgForMetric = (list: CheckInEntry[], k: PhaseMetric): number | null => {
    const vals = list
      .map((e) => getMetricValue(e, k))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const cycleData = useMemo(() => {
    if (!phaseBuckets) return [];
    const order: CyclePhase[] = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'];
    return order.map((phase) => {
      const list = phaseBuckets[phase] ?? [];
      return {
        phase,
        m0: avgForMetric(list, phaseMetrics[0]),
        m1: avgForMetric(list, phaseMetrics[1]),
        m2: avgForMetric(list, phaseMetrics[2]),
      };
    });
  }, [phaseBuckets, phaseMetrics]);

  const phasePointCount = useMemo(() => {
    if (!phaseBuckets) return 0;
    return Object.values(phaseBuckets).reduce((a, b) => a + b.length, 0);
  }, [phaseBuckets]);

  const hasCycleMetricData = useMemo(() => {
    if (!cycleData.length) return false;
    return cycleData.some((r) => r.m0 != null || r.m1 != null || r.m2 != null);
  }, [cycleData]);

  const setPhaseMetricAt = (idx: 0 | 1 | 2, next: PhaseMetric) => {
    setPhaseMetrics((prev) => {
      const arr: [PhaseMetric, PhaseMetric, PhaseMetric] = [...prev] as any;
      arr[idx] = next;
      return arr;
    });
  };

  const phaseMetricColor = (i: 0 | 1 | 2) =>
    i === 0 ? 'rgb(var(--color-primary))' : i === 1 ? 'rgb(var(--color-accent))' : 'rgb(var(--color-primary-dark))';

  // --- downloads ---
  const downloadReportHtml = () => {
    const html = buildHtmlReport({
      userData,
      timeframeLabel: TIMEFRAMES.find((t) => t.key === timeframe)?.label ?? '30 days',
      entries: entriesSorted,
      selected,
      highlights: findings,
      topCorr: corrPairs,
    });
    downloadTextFile(`everybody-report-${isoTodayLocal()}.html`, html, 'text/html');
  };

  const downloadRawJson = () => {
    const payload = {
      type: 'everybody-insights-export',
      version: 1,
      generatedAtISO: new Date().toISOString(),
      timeframe: TIMEFRAMES.find((t) => t.key === timeframe)?.label ?? timeframe,
      days: entriesSorted.length,
      selectedMetrics: selected,
      entries: entriesSorted,
    };
    downloadTextFile(`everybody-insights-report-${isoTodayLocal()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  // --- UI helpers ---
  const metricsSummary = selected.map((k) => labelFor(k, userData)).join(' • ');
  const reportCardTitle = 'Export Insights report';

  // Experiment dialog state
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [finishExperimentConfirm, setFinishExperimentConfirm] = useState<null | { worked: boolean }>(null);
  const [experimentPlan, setExperimentPlan] = useState<{ title: string; steps: string[]; note: string } | null>(null);
  const [experimentMetrics, setExperimentMetrics] = useState<Array<MetricKey>>([]);
  const [experimentDurationDays, setExperimentDurationDays] = useState<number>(3);
  const [isCustomExperiment, setIsCustomExperiment] = useState<boolean>(false);
  const [customExperimentTitle, setCustomExperimentTitle] = useState<string>('Your experiment');

  const { experiment, setExperiment, clearExperiment } = useExperiment();

  const openExperiment = (metrics?: Array<MetricKey>) => {
    const focus = (metrics && metrics.length ? metrics : selected).slice(0, 5);
    const plan = buildExperimentPlan(focus);
    setExperimentMetrics(focus);
    setExperimentPlan(plan);
    setIsCustomExperiment(false);
    setExperimentOpen(true);
  };

  const openCustomExperiment = () => {
    const focus = selected.slice(0, 5);
    // A gentle, generic plan. User can choose what to log.
    setExperimentPlan({
      title: 'Create your own experiment',
      steps: [
        'Pick what you want to try (for example magnesium, earlier bedtime, or less caffeine).',
        'Keep everything else roughly the same for the duration, if you can.',
        'Log your chosen metrics each day, then review the mini chart and the before/after summary.',
      ],
      note: 'This is a tiny test, not a diagnosis. If something makes you feel worse, stop and switch to something gentler.',
    });
    setExperimentMetrics(focus);
    setExperimentDurationDays(3);
    setIsCustomExperiment(true);
    setCustomExperimentTitle('Your experiment');
    setExperimentOpen(true);
  };

  const startExperiment = () => {
    const todayISO = isoTodayLocal();
    if (!experimentPlan) return;
    const plan: ExperimentPlan = {
      id: `${todayISO}-${Math.random().toString(16).slice(2)}`,
      title: isCustomExperiment ? (customExperimentTitle.trim() || 'Your experiment') : experimentPlan.title,
      startDateISO: todayISO,
      durationDays: experimentDurationDays,
      metrics: (experimentMetrics.length ? experimentMetrics : selected).slice(0, 6) as any,
      steps: experimentPlan.steps,
      note: experimentPlan.note,
    };
    setExperiment(plan);
    setExperimentOpen(false);
    setIsCustomExperiment(false);

    // The active experiment banner sits at the top of the Insights page.
    // Scroll up so the user immediately sees that the experiment has started.
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        const el = document.getElementById('eb-active-experiment');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch {
      // ignore
    }
  };


  const extendExperiment = (extraDays: number) => {
    if (!experiment) return;
    const ex = experiment as ExperimentPlan;
    const current = ex.durationDays ?? 3;
        const nextDays = Math.min(30, Math.max(3, current + extraDays));
    if (nextDays === current) return;
    setExperiment({ ...ex, durationDays: nextDays });
  };

  const markExperimentOutcome = (worked: boolean) => {
    if (!experiment) return;
    setFinishExperimentConfirm({ worked });
  };

  const confirmFinishExperiment = () => {
    if (!experiment || !finishExperimentConfirm) return;
    const ex = experiment as ExperimentPlan;
    const worked = finishExperimentConfirm.worked;

    setExperiment({
      ...ex,
      outcome: {
        ...(ex.outcome ?? {}),
        rating: worked ? 5 : 2,
        completedAtISO: new Date().toISOString(),
      },
    });

    setFinishExperimentConfirm(null);
  };


  const experimentStatus = useMemo(() => {
    if (!experiment) return null;
    const ex = experiment as ExperimentPlan;
    const todayISO = isoTodayLocal();
    const start = new Date(ex.startDateISO + 'T00:00:00');
    const today = new Date(todayISO + 'T00:00:00');
    const dayIndex = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const day = dayIndex + 1;
    const completedAtISO = (ex as any)?.outcome?.completedAtISO;
    const done = Boolean(completedAtISO) || dayIndex >= (ex.durationDays ?? 3);
    return { ex, day: Math.max(1, day), done };
  }, [experiment]);

  // Palette for multi-line charts.
  // IMPORTANT: for 6 lines we want clearly distinct colours.
  // We intentionally pull colours from *all* theme palettes (not just the current theme)
  // so 6 selected metrics are always distinguishable.
    const linePalette = useMemo(() => getMixedChartColors(12), []);

  const experimentWindow = useMemo(() => {
    if (!experimentStatus) return null;
    const ex = experimentStatus.ex as ExperimentPlan;
    const start = new Date(ex.startDateISO + 'T00:00:00');
    const end = new Date(start.getTime() + ((ex.durationDays ?? 3) - 1) * 24 * 60 * 60 * 1000);
    const startISO = ex.startDateISO;
    const endISO = isoFromDateLocal(end);
    const windowEntries = entriesAllSorted.filter((e) => e.dateISO >= startISO && e.dateISO <= endISO);
    const metrics = (ex.metrics ?? []).slice(0, 6) as MetricKey[];

    const series = metrics.map((m) => {
      const vals = windowEntries.map((e) => {
        const v = valueForMetric(e as any, m as any);
        return v == null ? null : normalise10(v);
      });
      return { key: m, values: vals };
    });

    return {
      metrics,
      windowEntries,
      series,
      startISO,
      endISO,
    };
  }, [experimentStatus, entriesAllSorted]);

  const [outcomeNote, setOutcomeNote] = useState<string>('');

  const setOutcomeRating = (rating: 1 | 2 | 3 | 4 | 5) => {
    if (!experiment) return;
    const ex = experiment as ExperimentPlan;
    const next: ExperimentPlan = {
      ...ex,
      outcome: {
        ...(ex.outcome ?? {}),
        rating,
        note: outcomeNote.trim() ? outcomeNote.trim() : undefined,
        completedAtISO: new Date().toISOString(),
      },
    };
    setExperiment(next);
  };

    const renderExperimentDelta = () => {
    const s0 = experimentWindow?.series?.[0];
    const nums = (s0?.values ?? []).filter((v) => typeof v === 'number') as number[];
    if (nums.length < 2 || !s0) return null;
    const first = nums[0];
    const last = nums[nums.length - 1];
    const delta = last - first;
    const dir = delta === 0 ? 'stayed about the same' : delta > 0 ? 'went up' : 'went down';
    return (
      <span>
        {' '}
        Your {labelFor((s0 as any).key, userData)} {dir} from {Math.round(first)}/10 to {Math.round(last)}/10.
      </span>
    );
  };

  const renderExperimentCTA = (ms: any) => {
    if (!ms) return null;
    const strength = ms.strength;
    const hasHormonal = Boolean(ms.hormonalInvolved);
    const allow = Boolean(ms.allowSuggestedExperiment);

    if (!allow) {
      return (
        <div className="text-sm eb-muted">
          {hasHormonal ? 'Track for one more cycle to learn more.' : 'Keep logging to unlock experiment suggestions.'}
        </div>
      );
    }

    // If it's hormonal-related and weak, be extra conservative.
    if (hasHormonal && strength === 'weak') {
      return (
        <div className="text-sm eb-muted">
          Track for one more cycle to strengthen the signal, then we can suggest a tiny experiment.
        </div>
      );
    }

    return (
      <button
        type="button"
        className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2"
        onClick={() => openExperiment(ms)}
        title="Turn this finding into a tiny 3-day test"
      >
        <FlaskConical className="w-4 h-4" />
        Run a 3-day experiment
      </button>
    );
  };

return (
    <div className="eb-container space-y-6 pt-8 pb-12">
      {/* Header */}
      <div className="pt-2">
        <h1 className="mb-1">Insights Dashboard</h1>
        <p className="text-[rgb(var(--color-text-secondary))]">
          Clear patterns, gentle nudges. Pick a few things to track, then use the findings to try small experiments.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>
            {entriesSorted.length} days logged
          </span>
          <span className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>
            {streak} day streak
          </span>
          <span className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>
            {TIMEFRAMES.find((t) => t.key === timeframe)?.label ?? timeframe} view
          </span>
        </div>
      </div>

      {/* Active experiment */}
      {experimentStatus && (
        <div id="eb-active-experiment" className="eb-inset rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="w-4 h-4" />
                {experimentStatus.done
                  ? 'Experiment complete'
                  : `Experiment in progress (Day ${experimentStatus.day}/${experimentStatus.ex.durationDays ?? 3})`}
              </div>
              <div className="mt-1 text-sm eb-muted">
                {experimentStatus.ex.title}
                {Array.isArray(experimentStatus.ex.metrics) && experimentStatus.ex.metrics.length ? (
                  <span>
                    {' '}
                    • Logging:{' '}
                    {(experimentStatus.ex.metrics as any[])
                      .slice(0, 5)
                      .map((k) => labelFor(k as any, userData))
                      .join(' • ')}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {!experimentStatus.done && onOpenCheckIn ? (
                <button
                  type="button"
                  className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  onClick={() => onOpenCheckIn(isoTodayLocal())}
                >
                  Log today
                </button>
              ) : null}
              {!experimentStatus.done ? (
                <button
                  type="button"
                  className="px-6 py-3 rounded-xl bg-white border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-dark))] hover:bg-white/80 transition-all font-medium whitespace-nowrap"
                  onClick={() => extendExperiment(2)}
                >
                  Extend 2 days
                </button>
              ) : null}
              <button
                type="button"
                className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium whitespace-nowrap"
                onClick={() => clearExperiment()}
              >
                {experimentStatus.done ? 'Clear' : 'Stop'}
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {experimentStatus.ex.steps?.slice(0, 3)?.map((s: string, i: number) => (
              <div key={i} className="eb-inset rounded-2xl p-4">
                <div className="text-sm font-semibold">Step {i + 1}</div>
                <div className="mt-1 text-sm eb-muted">{s}</div>
              </div>
            ))}

            {/* Step 4: outcome (available any time) */}
            {!experimentStatus.done ? (
              <div className="eb-inset rounded-2xl p-4">
                <div className="text-sm font-semibold">Step 4</div>
                <div className="mt-1 text-sm eb-muted">
                  Tell me if it worked. We'll save the result so your future insights can become more meaningful.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium"
                    onClick={() => markExperimentOutcome(true)}
                  >
                    Yes, it helped
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl bg-white border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-dark))] hover:bg-white/80 transition-all font-medium"
                    onClick={() => markExperimentOutcome(false)}
                  >
                    Not really
                  </button>
                </div>
              </div>
            ) : (
              <div className="eb-inset rounded-2xl p-4">
                <div className="text-sm font-semibold">Step 4</div>
                <div className="mt-1 text-sm eb-muted">Experiment complete. Thanks for telling me what helped.</div>
              </div>
            )}
          </div>
          {experimentStatus.ex.note ? <div className="mt-3 text-sm eb-muted">{experimentStatus.ex.note}</div> : null}

          {/* Mini chart: appears once day 2 has some data */}
          {experimentWindow && experimentStatus.day >= 2 ? (
            <div className="mt-4 eb-inset rounded-2xl p-4">
              <div className="text-sm font-semibold">Experiment mini chart</div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {experimentWindow.series.slice(0, 3).map((s) => (
                  <div key={String(s.key)} className="rounded-2xl border border-black/5 bg-white p-3">
                    <div className="text-xs text-[rgb(var(--color-text-secondary))]">{labelFor(s.key, userData)}</div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <Sparkline values={s.values} />
                      <div className="text-xs text-[rgb(var(--color-text-secondary))] whitespace-nowrap">
                        Day {Math.min(experimentStatus.day, experimentStatus.ex.durationDays ?? 3)}/{experimentStatus.ex.durationDays ?? 3}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Day 3 outcome capture */}
          {experimentStatus.day >= (experimentStatus.ex.durationDays ?? 3) && !(experimentStatus.ex as any)?.outcome?.rating ? (
            <div className="mt-4 eb-inset rounded-2xl p-4">
              <div className="text-sm font-semibold">Did it help?</div>
              <div className="mt-1 text-sm eb-muted">Quick 5-point rating so we can turn this into a real conclusion.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="eb-pill"
                    style={{ background: 'rgba(0,0,0,0.06)' }}
                    onClick={() => setOutcomeRating(n as any)}
                    aria-label={`Rate ${n} out of 5`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <textarea
                  className="eb-input"
                  placeholder="Optional: what changed (sleep, food, stress, meds, ...)?"
                  rows={2}
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {/* Conclusion once rated */}
          {(experimentStatus.ex as any)?.outcome?.rating ? (
            <div className="mt-4 eb-inset rounded-2xl p-4">
              <div className="text-sm font-semibold">Conclusion</div>
              <div className="mt-1 text-sm eb-muted">
                {Number((experimentStatus.ex as any)?.outcome?.rating ?? 0) >= 4 ? "You marked this as a success." : "You marked this as not helpful."}
                {experimentWindow?.series?.length ? renderExperimentDelta() : null}
              </div>
              {(experimentStatus.ex as any)?.outcome?.note ? (
                <div className="mt-2 text-sm">Note: {(experimentStatus.ex as any).outcome.note}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Your settings */}
      <div className="eb-card eb-hero-surface">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight eb-hero-on-dark">Your settings</h2>
            <p className="text-sm mt-1 eb-hero-on-dark-muted">
              Keep it simple: 3–5 metrics gives you the cleanest signals.
            </p>
          </div>

          
        </div>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {TIMEFRAMES.map((t) => (
            <button key={t.key} className={chipClass(timeframe === t.key)} onClick={() => setTimeframe(t.key)}>
              {t.label}
            </button>
          ))}</div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
          <div className="text-xs eb-hero-on-dark-muted">Selected metrics</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.length ? (
              selected.map((m) => (
                <span
                  key={String(m)}
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.92)',
                  }}
                >
                  {labelFor(m, userData)}
                </span>
              ))
            ) : (
              <div className="text-sm mt-1 eb-hero-on-dark-muted">Pick a few metrics to get started.</div>
            )}
          </div>
          </div>

          <div className="shrink-0">
            <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="px-5 py-2 rounded-xl bg-white/10 border border-white/15 text-sm text-white hover:bg-white/15 transition-all font-medium"
              >
                Change metrics
              </button>
            </DialogTrigger>
            <EBDialogContent
              title="Choose metrics to analyse"
              description="Select up to 6 metrics to personalise your insights."
              className="max-w-2xl rounded-2xl"
            >
              <DialogHeader>
                <DialogTitle>Choose metrics to analyse (max 6)</DialogTitle>
                <DialogDescription>
                  Select up to 6 metrics to personalise your insights.
                </DialogDescription>
              </DialogHeader>
              <div className="text-sm eb-muted">Selected: {metricsSummary || 'None'}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className={chipClass(selected.includes('mood'))} onClick={() => toggleMetric('mood')}>
                  Mood
                </button>
                {selectableKeys.map((k) => (
                  <button key={k} className={chipClass(selected.includes(k))} onClick={() => toggleMetric(k)} title={labelFor(k, userData)}>
                    {labelFor(k, userData)}
                  </button>
                ))}
              </div>

              <div className="mt-3 text-sm eb-muted">Tip: if this feels like too much, pick your “top 3” and stick with them for a week.</div>
            </EBDialogContent>
          </Dialog>
          </div>
        </div>

      </div>

      {/* Highlights + Top findings carousel */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">Top findings</div>
            <div className="eb-card-sub">The “headline” signals from your recent data.</div>
          </div>
          <Sparkles className="w-5 h-5" style={{ color: 'rgb(var(--color-accent))' }} />
        </div>

        {!deepReady && (
          <div className="mt-2 text-sm eb-muted">
            The deep dive gets better at {minDaysForDeep} days in this timeframe. Keep logging. You are close.
          </div>
        )}

        <div className="mt-4">
          <Carousel opts={{ align: 'start' }} className="w-full">
            <CarouselContent>
              {findings.map((f, idx) => (
                <CarouselItem key={idx} className="basis-full md:basis-1/2">
                  <div className="eb-inset rounded-2xl p-5 h-full">
                    <div className="text-sm font-semibold">{f.title}</div>
                    <div className="mt-1 text-sm eb-muted">{f.body}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.metrics?.slice(0, 2).map((m) => (
                        <span key={String(m)} className="eb-pill" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          {labelFor(m, userData)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex justify-end">
                      {renderExperimentCTA(f)}
                    </div>
                  </div>
                </CarouselItem>
              ))}
              <CarouselItem key="custom" className="basis-full md:basis-1/2">
                <div className="eb-inset rounded-2xl p-5 h-full">
                  <div className="text-sm font-semibold">Found something yourself?</div>
                  <div className="mt-1 text-sm eb-muted">
                    Something you want to track or test (like magnesium, earlier bedtime, or less caffeine)?
                    Turn it into a tiny experiment.
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2"
                      onClick={openCustomExperiment}
                      title="Create your own experiment"
                    >
                      <FlaskConical className="w-4 h-4" />
                      Run a 3-day experiment
                    </button>
                  </div>
                </div>
              </CarouselItem>
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex" />
            <CarouselNext className="hidden md:flex" />
          </Carousel>
        </div>
      </div>

      {/* Experiment dialog */}
      <Dialog open={experimentOpen} onOpenChange={setExperimentOpen}>
        <EBDialogContent
          title={experimentPlan?.title ?? 'Experiment'}
          description="Set up a tiny experiment and keep logging a few metrics so you can spot what changes."
          className="max-w-lg rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle>{experimentPlan?.title ?? 'Experiment'}</DialogTitle>
            <DialogDescription>
              Set up a tiny experiment and keep logging a few metrics so you can spot what changes.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[78vh] overflow-y-auto pr-1 space-y-3">
            <div className="text-sm eb-muted">
              Tiny, realistic actions. You are testing what helps your body, not trying to “fix everything”.
            </div>

            {isCustomExperiment && (
              <div className="eb-inset rounded-2xl p-4">
                <div className="text-sm font-semibold">Name your experiment</div>
                <input
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/20"
                  value={customExperimentTitle}
                  onChange={(e) => setCustomExperimentTitle(e.target.value)}
                  placeholder="e.g. Magnesium trial"
                />
                <div className="mt-2 text-sm eb-muted">
                  Keep it simple. You can always tweak it later.
                </div>
              </div>
            )}

            {/* What to log */}
            <div className="eb-inset rounded-2xl p-4">
              <div className="text-sm font-semibold">What to log (daily)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {isCustomExperiment ? (
                  (() => {
                    const options: MetricKey[] = Array.from(new Set((['mood' as any] as MetricKey[]).concat(selectableKeys)));
                    const toggle = (k: MetricKey) => {
                      setExperimentMetrics((prev) => {
                        const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
                        return next.slice(0, 6);
                      });
                    };
                    return options.map((k) => {
                      const on = experimentMetrics.includes(k);
                      return (
                        <button
                          key={String(k)}
                          type="button"
                          className="eb-pill"
                          style={{
                            background: on ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)',
                            border: '1px solid rgba(0,0,0,0.08)',
                          }}
                          onClick={() => toggle(k)}
                          aria-pressed={on}
                        >
                          {labelFor(k as any, userData)}
                        </button>
                      );
                    });
                  })()
                ) : (
                  (experimentMetrics.length ? experimentMetrics : selected)
                    .slice(0, 6)
                    .map((k) => (
                      <span key={String(k)} className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>
                        {labelFor(k as any, userData)}
                      </span>
                    ))
                )}
              </div>
              <div className="mt-2 text-sm eb-muted">
                You do not need to track everything. Consistency beats completeness.
              </div>
            </div>

            {/* Steps */}
            <ul className="list-disc pl-5 text-sm">
              {(experimentPlan?.steps ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>

            {experimentPlan?.note && <div className="text-sm eb-muted">{experimentPlan.note}</div>}
            <div className="pt-2">
              <div className="text-sm font-semibold">How long?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[3, 7, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="eb-pill"
                    style={{ background: d === experimentDurationDays ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)' }}
                    onClick={() => setExperimentDurationDays(d)}
                    aria-label={`Set experiment length to ${d} days`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                className="px-6 py-3 rounded-xl bg-white border border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-dark))] hover:bg-white/80 transition-all font-medium"
                onClick={() => setExperimentOpen(false)}
              >
                Not now
              </button>
              <button
                type="button"
                className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium"
                onClick={startExperiment}
              >
                {`Start ${experimentDurationDays}-day experiment`}
              </button>
            </div>
          </div>
        </EBDialogContent>
      </Dialog>


      {/* Finish experiment confirm dialog */}
      <Dialog
        open={Boolean(finishExperimentConfirm)}
        onOpenChange={(open) => {
          if (!open) setFinishExperimentConfirm(null);
        }}
      >
        <EBDialogContent
          title="Finish experiment"
          description="Confirm whether this experiment helped, so we can save the result."
          className="max-w-md rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle>Finish experiment?</DialogTitle>
            <DialogDescription>
              Confirm whether this experiment helped, so we can save the result for future insights.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm eb-muted">
              {finishExperimentConfirm?.worked
                ? 'Mark this experiment as helpful and finish it now?'
                : 'Finish this experiment now and mark it as not really helpful?'}
            </div>
            <div className="text-sm eb-muted">
              We will save the result so your future insights can become more meaningful.
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button type="button" className="eb-btn-secondary" onClick={() => setFinishExperimentConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="eb-btn-primary" onClick={confirmFinishExperiment}>
                Finish and save
              </button>
            </div>
          </div>
        </EBDialogContent>
      </Dialog>

      {/* Trends */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div className="flex items-start justify-between gap-4 w-full">
            <div>
              <div className="eb-card-title">Trends</div>
              <div className="eb-card-sub">Your selected metrics over time (0–10). The key is underneath.</div>
            </div>
            <button
              type="button"
              className="eb-pill"
              style={{ background: smoothTrends ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)' }}
              onClick={() => setSmoothTrends((s) => !s)}
              aria-label="Toggle rolling average smoothing"
              title="Smooth the lines (3‑day rolling average)"
            >
              {smoothTrends ? 'Rolling avg: on' : 'Rolling avg: off'}
            </button>
          </div>
        </div>

        <div className="mt-3 eb-chart">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={seriesForChart} margin={{ left: 6, right: 16, top: 10, bottom: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                  formatter={(value: any, name: any) => [value == null ? '–' : Number(value).toFixed(0), labelFor(String(name) as any, userData)]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: any) => <span style={{ fontSize: 12 }}>{labelFor(String(value) as any, userData)}</span>}
                />
                {selected.map((k, i) => (
                  <Line
                    key={String(k)}
                    type="monotone"
                    dataKey={String(k)}
                    dot={{ r: 2 }}
                    connectNulls
                    strokeWidth={2}
                    stroke={linePalette[i % linePalette.length]}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm eb-muted">We connect across missed days so you still see the story.</div>
        </div>
      {/* Distribution + high symptom days */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="eb-card">
          <div className="eb-card-header">
            <div className="flex items-start justify-between gap-4 w-full">
              <div>
                <div className="eb-card-title">Symptom distribution</div>
                <div className="eb-card-sub">How often your chosen metric sits low, mid, or high.</div>
              </div>
              <select
                className="eb-input !w-auto !py-2"
                value={String(distributionMetric)}
                onChange={(e) => setDistributionMetric(e.target.value as any)}
                aria-label="Choose distribution metric"
              >
                {selected.map((k) => (
                  <option key={String(k)} value={String(k)}>
                    {labelFor(k, userData)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 eb-chart">
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={distributionData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={4}
                    isAnimationActive={false}
                  >
                    {distributionData.map((_, i) => (
                      <Cell key={i} fill={linePalette[i % linePalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                    formatter={(value: any, name: any) => [`${value} day${Number(value) === 1 ? '' : 's'}`, String(name)]}
                  />
                  <Legend verticalAlign="bottom" height={28} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="eb-card">
          <div className="eb-card-header">
            <div>
              <div className="eb-card-title">High symptom days</div>
              <div className="eb-card-sub">Days where a symptom hit 7/10 or higher.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {highSymptomDays.length === 0 ? (
              <div className="eb-inset rounded-2xl p-4 text-sm eb-muted">
                No “high” days yet in this timeframe. Keep logging and this section will start to light up.
              </div>
            ) : (
              highSymptomDays.map((it) => (
                <div key={String(it.key)} className="eb-inset rounded-2xl p-4">
                  <div className="text-sm font-semibold">{labelFor(it.key, userData)}</div>
                  <div className="mt-1 text-sm eb-muted">
                    {it.count} day{it.count === 1 ? '' : 's'} at 7+ in the last {days}.
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      </div>

      {/* Symptoms by cycle phase (restored) */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">Symptoms by cycle phase</div>
            <div className="eb-card-sub">Optional: if cycle tracking is on and you log bleeding/spotting.</div>
          </div>
        </div>

        {!cycleEnabled && !hasCycleSignal ? (
          <div className="mt-2 text-sm eb-muted">Cycle tracking is off. You can still use trends and correlations.</div>
        ) : !hasCycleSignal ? (
          <div className="mt-2 text-sm eb-muted">
            To show this, either log <b>Bleeding / spotting</b> (Profile → Symptoms) or use <b>New cycle started today</b> in your Daily Check-in.
          </div>
        ) : phasePointCount < 2 ? (
          <div className="mt-2 text-sm eb-muted">Keep logging for a bit longer and we will start showing phase-based patterns.</div>
        ) : !hasCycleMetricData ? (
          <div className="mt-3 eb-inset rounded-2xl p-5">
            <div className="text-sm font-semibold">No data for these symptoms yet</div>
            <div className="mt-1 text-sm eb-muted">Try choosing symptoms you have logged (or keep logging for a few more days).</div>
          </div>
        ) : (
          <>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cycleData} margin={{ left: 6, right: 16, top: 10, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="phase" stroke="rgba(0,0,0,0.45)" fontSize={12} />
                  <YAxis stroke="rgba(0,0,0,0.45)" fontSize={12} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid rgba(0,0,0,0.12)',
                      borderRadius: '12px',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
                    }}
                    formatter={(value: any, name: any) => {
                      const label =
                        name === 'm0'
                          ? labelFor(phaseMetrics[0] as any, userData)
                          : name === 'm1'
                            ? labelFor(phaseMetrics[1] as any, userData)
                            : name === 'm2'
                              ? labelFor(phaseMetrics[2] as any, userData)
                              : String(name);
                      return [typeof value === 'number' ? value.toFixed(1) : value, label];
                    }}
                  />
                  <Bar dataKey="m0" fill={phaseMetricColor(0)} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="m1" fill={phaseMetricColor(1)} radius={[10, 10, 0, 0]} />
                  <Bar dataKey="m2" fill={phaseMetricColor(2)} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-3 justify-center text-sm">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: phaseMetricColor(i as any) }} />
                    <span>{labelFor(phaseMetrics[i as 0 | 1 | 2] as any, userData)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="text-sm eb-muted mb-2">Pick 3 symptoms to show</div>
                <div className="flex flex-col sm:flex-row gap-3">
                  {[0, 1, 2].map((i) => (
                    <select
                      key={i}
                      className="eb-input !py-2 !h-10"
                      value={phaseMetrics[i as 0 | 1 | 2]}
                      onChange={(e) => setPhaseMetricAt(i as 0 | 1 | 2, e.target.value as any)}
                      style={{ borderColor: phaseMetricColor(i as any) }}
                      aria-label={`Cycle phase metric ${i + 1}`}
                    >
                      {PHASE_METRICS.map((opt) => (
                        <option key={String(opt.key)} value={opt.key as any}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Correlations (soft) */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">What moves together</div>
            <div className="eb-card-sub">A softer view of correlations. Use Relationship Explorer for the deep dive.</div>
          </div>
        </div>

        {corrPairs.length < 1 ? (
          <div className="mt-2 text-sm eb-muted">Log a few days with the same metrics to reveal relationships.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {corrPairs.slice(0, 4).map((p, idx) => {
              const confLabel = p.confidence === 'high' ? 'Stronger pattern' : p.confidence === 'medium' ? 'Possible pattern' : 'Weak pattern';
              const direction = p.r > 0 ? 'move together' : 'move in opposite directions';
              const safeCopy = p.hormonalInvolved
                ? `There may be a ${p.confidence === 'low' ? 'weak' : 'possible'} pattern where these ${direction}. This could reflect stress, lifestyle, or hormonal changes.`
                : `There may be a ${p.confidence === 'low' ? 'weak' : 'possible'} pattern where these ${direction}.`;

              return (
                <div key={idx} className="eb-inset rounded-2xl p-5 flex flex-col min-h-[170px]">
                  <div className="text-sm font-semibold">
                    {p.a} + {p.b}
                  </div>
                  <div className="mt-1 text-xs eb-muted">
                    {confLabel} · based on {p.n} days logged together
                  </div>
                  <div className="mt-2 text-sm eb-muted">{safeCopy}</div>

                  <details className="mt-3 rounded-2xl border border-neutral-200 bg-white/60 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Why am I seeing this?</summary>
                    <div className="mt-2 text-sm eb-muted space-y-1">
                      {(p.why ?? []).map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                      <div className="pt-1 text-xs eb-muted">Patterns are a hint, not proof.</div>
                    </div>
                  </details>

                  <div className="mt-auto pt-4 flex items-center justify-between gap-2">

                    {p.allowSuggestedExperiment ? (
                      <button
                        type="button"
                        className="px-5 py-2 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2 text-sm"
                        onClick={() => openExperiment([p.aKey, p.bKey])}
                      >
                        <FlaskConical className="w-4 h-4" />
                        Try 3-day experiment
                      </button>
                    ) : p.hormonalInvolved ? (
                      <div className="text-sm eb-muted">Track for one more cycle.</div>
                    ) : (
                      <div className="text-sm eb-muted">Keep logging for a clearer signal.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Relationship explorer (kept) */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">Relationship Explorer</div>
            <div className="eb-card-sub">Pick two metrics and see how they behave together.</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="text-sm eb-muted">X:</div>
          <select className="eb-input !w-auto !py-2 !h-10" value={scatterX} onChange={(e) => setScatterX(e.target.value as any)}>
            {selected.map((k) => (
              <option key={String(k)} value={k}>
                {labelFor(k, userData)}
              </option>
            ))}
          </select>

          <div className="text-sm eb-muted">Y:</div>
          <select className="eb-input !w-auto !py-2 !h-10" value={scatterY} onChange={(e) => setScatterY(e.target.value as any)}>
            {selected.map((k) => (
              <option key={String(k)} value={k}>
                {labelFor(k, userData)}
              </option>
            ))}
          </select>

          <div className="ml-auto text-sm eb-muted">
            {scatterData.length >= 3 ? (
              <span>Strength: {strengthLabel(pearsonCorrelation(scatterData.map((d) => d.x), scatterData.map((d) => d.y)))} (across {scatterData.length} days)</span>
            ) : (
              <span>Log both metrics on a few days to see the relationship.</span>
            )}
          </div>
        </div>

        <div className="mt-3 eb-chart">
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ left: 6, right: 16, top: 10, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" domain={[0, 10]} tick={{ fontSize: 12 }} />
                <YAxis type="number" dataKey="y" domain={[0, 10]} tick={{ fontSize: 12 }} />
                <ZAxis type="number" dataKey="z" range={[60, 60]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                  formatter={(value: any, name: any) => [Number(value).toFixed(0), name === 'x' ? labelFor(scatterX, userData) : labelFor(scatterY, userData)]}
                  labelFormatter={(label: any, payload: any) => {
                    if (payload && payload.length && payload[0]?.payload?.dateLabel) return payload[0].payload.dateLabel;
                    return '';
                  }}
                />
                <Scatter data={scatterData} fill="rgb(var(--color-accent))" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Weekday pattern */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div className="flex items-start justify-between gap-4 w-full">
            <div>
              <div className="eb-card-title">Week pattern</div>
              <div className="eb-card-sub">
                Average by weekday for: {labelFor((weekdayMetric as any) ?? (selected[0] ?? 'mood'), userData)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm eb-muted">Metric</span>
              <select
                className="eb-input !w-auto !py-2 !h-10"
                value={weekdayMetric as any}
                onChange={(e) => setWeekdayMetric(e.target.value as any)}
                aria-label="Week pattern metric"
              >
                {selected.map((k) => (
                  <option key={String(k)} value={k as any}>
                    {labelFor(k as any, userData)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 eb-chart">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={weekdayBar} margin={{ left: 6, right: 16, top: 10, bottom: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                  formatter={(value: any) => [value == null ? '–' : Number(value).toFixed(1), labelFor(selected[0] ?? 'mood', userData)]}
                />
                <Bar dataKey="avg" fill="rgb(var(--color-primary))" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm eb-muted">If you spot a dip on one day, that is a great candidate for a tiny experiment.</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">Quick actions</div>
            <div className="eb-card-sub">Use insights to drive the next best action, not perfection.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            className="eb-inset rounded-2xl p-5 text-left hover:opacity-95 transition flex flex-col"
            onClick={() => {
              const last = entriesAllSorted[entriesAllSorted.length - 1];
              if (last && onOpenCheckIn) onOpenCheckIn(last.dateISO);
            }}
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              Edit your latest log <ArrowRight className="w-4 h-4" />
            </div>
            <div className="mt-1 text-sm eb-muted">Small edits make your insights cleaner.</div>
          </button>

          <div id="eb-active-experiment" className="eb-inset rounded-2xl p-5">
            <div className="text-sm font-semibold">Keep it light</div>
            <div className="mt-1 text-sm eb-muted">If you feel overwhelmed, switch off a symptom or two in Profile. You can always switch them back on.</div>
          </div>
        </div>
      </div>

      {/* Export report */}
      <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 w-full">
            <h2 className="text-xl font-semibold tracking-tight">{reportCardTitle}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
              Download a readable <b>.html</b> report for you. The JSON export is the “machine” version, but it can’t be restored as an in-app backup.
            </p>
            <p className="mt-2 text-sm text-[rgb(var(--color-text-secondary))]">
              To open: tap the file in your downloads and choose Chrome/Safari.
            </p>
          </div>

          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <button
              className="w-full sm:min-w-[240px] px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap"
              onClick={downloadReportHtml}
            >
              <Download className="w-4 h-4" />
              Download report
            </button>
            <button
              className="w-full sm:min-w-[240px] px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium whitespace-nowrap"
              onClick={downloadRawJson}
            >
              Export Insights data (.json)
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}