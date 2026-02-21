import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ComposedChart,
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
import { ArrowRight, Download, FlaskConical, Sparkles, Moon, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import type { CheckInEntry, CyclePhase, SymptomKey, SymptomKind, UserData, ExperimentPlan, InsightMetricKey } from '../types';
import { useEntries, useExperiment } from '../lib/appStore';
import { downloadTextFile } from '../lib/storage';
import { calculateStreak, computeCycleStats, estimatePhaseByFlow, filterByDays, pearsonCorrelation, sortByDateAsc } from '../lib/analytics';
import { isoFromDateLocal, isoTodayLocal } from '../lib/date';
import { SYMPTOM_META, kindLabel } from '../lib/symptomMeta';
import { getMixedChartColors } from '../lib/chartPalette';
import { isMetricInScope } from '../lib/insightsScope';
import { computeExperimentComparison } from '../lib/experimentAnalysis';
import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
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

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoFromDateLocal(dt);
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// Shared helper: keep Insight metrics on the same 0–10-ish scale.
function metricValue(entry: any | undefined, metric: MetricKey): number | undefined {
  if (!entry) return undefined;
  if ((metric as any) === 'mood') {
    return moodTo10(entry?.mood as any);
  }
  const v = entry?.values?.[metric as any];
  return typeof v === 'number' ? v : undefined;
}


function experimentSummarySentence(
  comparison: any,
  userData: UserData,
  maxParts = 2
): string | null {
  if (!comparison?.enoughData || !Array.isArray(comparison?.metrics)) return null;

  const usable = (comparison.metrics as any[])
    .filter((m) => m?.hasEnoughData && hasNum(m?.delta))
    .map((m) => ({ ...m, abs: Math.abs(Number(m.delta)) }))
    .sort((a, b) => (b.abs ?? 0) - (a.abs ?? 0))
    .slice(0, maxParts);

  if (!usable.length) return null;

  const parts = usable.map((m) => {
    const delta = Number(m.delta);
    const dir = delta >= 0 ? 'higher' : 'lower';
    const amt = Math.abs(delta).toFixed(1);
    return `${labelFor(m.key as any, userData)} averaged ${amt} ${dir}`;
  });

  if (parts.length === 1) return `During this experiment, ${parts[0]}.`;
  return `During this experiment, ${parts[0]}, while ${parts[1]}.`;
}

function moodTo10(mood?: 1 | 2 | 3): number | undefined {
  if (!mood) return undefined;
  return mood === 1 ? 2 : mood === 2 ? 5 : 8;
}

// Read a metric value from an entry.
// - Symptom keys live in entry.values
// - Overall mood lives in entry.mood (mapped to 0-10)
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


function getMetricValue(entry: CheckInEntry, key: MetricKey, userData: UserData): number | undefined {
  // Respect Insights scoping (goal pivots + retired metrics).
  if (!isMetricInScope(userData, String(key), String(entry.dateISO))) return undefined;
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
      : 'Want to try a 3-day "steady routine" experiment and see if both lift together?';
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

  // A few gentle, "soft" experiments. These are suggestions, not medical advice.
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
        ${highlights.slice(0, 8).map((f) => `<li><b>${esc(f.title)}</b> - ${esc(f.body)}</li>`).join('')}
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
      <div class="note">Correlation means "moves together", not "causes". Use the app's experiments to test what helps you.</div>
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
  const [sleepExploreOpen, setSleepExploreOpen] = useState<boolean>(false);
  // Persist the user's last overlay choice (nice on mobile where you can't hover)
  const [sleepOverlayKey, setSleepOverlayKey] = useState<string>(() => {
    try {
      return localStorage.getItem('eb_sleep_overlay') ?? '';
    } catch {
      return '';
    }
  });
const days = TIMEFRAMES.find((t) => t.key === timeframe)?.days ?? 30;

  const entriesSorted = useMemo(() => filterByDays(entriesAllSorted, days), [entriesAllSorted, days]);
  const streak = useMemo(() => calculateStreak(entriesAllSorted), [entriesAllSorted]);
  const cycleEnabled = userData.cycleTrackingMode === 'cycle';

  const sleepInsightsOn = Boolean(userData.sleepInsightsEnabled);

  // Recharts + iOS Safari can be flaky when SVG attributes rely on CSS var functions.
  // Use computed RGB strings so the line always renders in modals/portals.
  const chartColors = useMemo(() => {
    const safe = (v: string) => v.trim().replace(/\s+/g, ' ');
    try {
      const cs = getComputedStyle(document.documentElement);
      const primary = safe(cs.getPropertyValue('--color-primary'));
      const primaryDark = safe(cs.getPropertyValue('--color-primary-dark'));
      return {
        primary: primary ? `rgb(${primary})` : 'rgb(120, 140, 135)',
        primaryDark: primaryDark ? `rgb(${primaryDark})` : 'rgb(80, 95, 90)',
      };
    } catch {
      return {
        primary: 'rgb(120, 140, 135)',
        primaryDark: 'rgb(80, 95, 90)',
      };
    }
  }, [userData.colorTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('eb_sleep_overlay', sleepOverlayKey);
    } catch {
      // ignore
    }
  }, [sleepOverlayKey]);

  const sleepSeries = useMemo(() => {
    return entriesSorted.map((e) => {
      const sleep10 = getMetricValue(e, 'sleep', userData);
      const sd = (e as any)?.sleepDetails;
      const hasExtras = !!(
        sd &&
        ((typeof sd.timesWoke === 'number' && sd.timesWoke > 0) ||
          (typeof sd.troubleFallingAsleep === 'number' && sd.troubleFallingAsleep > 0) ||
          Boolean(sd.wokeTooEarly))
      );
            const evRaw = (e as any)?.events ?? {};
      // Respect Insights scoping for influences too (retired metrics / goal pivots).
      const ev: Record<string, any> = {};
      Object.keys(evRaw).forEach((k) => {
        if (!Boolean((evRaw as any)[k])) return;
        if (!isMetricInScope(userData, `influence:${k}`, String(e.dateISO))) return;
        (ev as any)[k] = (evRaw as any)[k];
      });
      const anyOther = Object.keys(ev).some((k) => k !== 'exercise' && k !== 'sex' && Boolean((ev as any)[k]));
      return {
        dateISO: e.dateISO,
        dateLabel: fmtDateShort(e.dateISO),
        sleep: sleep10,
        extras: hasExtras,
        exercise: Boolean((ev as any).exercise),
        sex: Boolean((ev as any).sex),
        other: anyOther,
        events: ev,
        intensity: (e as any)?.eventsDetails?.exerciseIntensity as any,
      };
    });
  }, [entriesSorted]);

  const OTHER_INFLUENCE_KEYS = [
    'travel',
    'illness',
    'alcohol',
    'lateNight',
    'stressfulDay',
    'medication',
    'caffeine',
    'socialising',
    'lowHydration',
  ] as const;

  const otherInfluenceLabel = (k: string) => {
    switch (k) {
      case 'exercise':
        return 'Workout';
      case 'sex':
        return 'Intimacy';
      case 'travel':
        return 'Travel';
      case 'illness':
        return 'Feeling unwell';
      case 'alcohol':
        return 'Alcohol';
      case 'lateNight':
        return 'Late night';
      case 'stressfulDay':
        return 'Stressful day';
      case 'medication':
        return 'Medication';
      case 'caffeine':
        return 'Caffeine';
      case 'socialising':
        return 'Socialising';
      case 'lowHydration':
        return 'Low hydration';
      default:
        return k;
    }
  };

  const sleepOverlayOptions = useMemo(() => {
    const enabled = Array.isArray(userData.enabledInfluences) ? (userData.enabledInfluences as string[]) : [];
    // Only show overlays that exist in the current timeframe, to avoid empty picks.
    return enabled.filter((k) => sleepSeries.some((r) => Boolean((r as any).events?.[k])));
  }, [sleepSeries, userData.enabledInfluences]);

  const sleepExtrasCount = useMemo(() => sleepSeries.filter((r) => r.extras).length, [sleepSeries]);

  const sleepOverlayLabel = useMemo(() => (sleepOverlayKey ? otherInfluenceLabel(sleepOverlayKey) : ''), [sleepOverlayKey]);

  // Important: the sleep line should always be based on the full sleepSeries.
  // The overlay is only a marker layer, not a filter.
  const sleepSeriesWithOverlay = useMemo(() => {
    // NOTE: On iOS Safari, giving <Scatter> its own `data` prop can cause the
    // X domain to collapse to just the scatter points. To guarantee the sleep
    // line always spans the full period, we keep ONE dataset for the chart and
    // add an `overlayMarker` value only on matching days.
    if (!sleepOverlayKey) {
      return (sleepSeries as any[]).map((r) => ({ ...r, overlay: undefined, overlayMarker: null }));
    }
    return sleepSeries.map((r) => {
      const has = Boolean((r as any).events?.[sleepOverlayKey]);
      return {
        ...r,
        overlay: has ? sleepOverlayLabel : undefined,
        overlayMarker: has && typeof (r as any).sleep === 'number' ? (r as any).sleep : null,
      };
    });
  }, [sleepSeries, sleepOverlayKey, sleepOverlayLabel]);

  const sleepGentleHint = useMemo(() => {
    const withSleep = sleepSeries.filter((r) => typeof r.sleep === 'number') as Array<{ sleep: number; exercise: boolean; sex: boolean; other: boolean; intensity?: any }>;
    if (withSleep.length < 6) return "Log a few more days and we'll start spotting what helps your sleep.";

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);

    const exDays = withSleep.filter((r) => r.exercise).map((r) => r.sleep);
    const nonEx = withSleep.filter((r) => !r.exercise).map((r) => r.sleep);
    const exDiff = avg(exDays) - avg(nonEx);

    const hardDays = withSleep.filter((r) => r.intensity === 'hard').map((r) => r.sleep);
    const lightMod = withSleep.filter((r) => r.intensity === 'light' || r.intensity === 'moderate').map((r) => r.sleep);
    const hardDiff = avg(hardDays) - avg(lightMod);

    if (Number.isFinite(exDiff) && exDays.length >= 4 && nonEx.length >= 4 && Math.abs(exDiff) >= 0.7) {
      return exDiff > 0
        ? 'So far, your sleep looks a touch better on days you log a workout.'
        : 'So far, your sleep looks a bit more fragile on workout days. That might just be timing or intensity.';
    }

    if (Number.isFinite(hardDiff) && hardDays.length >= 3 && lightMod.length >= 3 && Math.abs(hardDiff) >= 0.7) {
      return hardDiff < 0
        ? 'Hard workouts sometimes go hand-in-hand with a slightly more restless night. Keep an eye on it.'
        : 'Hard workouts sometimes line up with better sleep for you. Nice.';
    }

    return "Nothing shouty yet, which is normal. Keep logging and we'll build a clearer picture.";
  }, [sleepSeries]);

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
        // If the saved list is tiny (for example after using the old "Focus" button),
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
        row[String(k)] = getMetricValue(e, k, userData);
      });
      out.push(row);
    });

    if (!smoothTrends) return out;

    // 3-day rolling average (only across available data points).
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
    const low = { name: '0-3', value: 0 };
    const mid = { name: '4-6', value: 0 };
    const high = { name: '7-10', value: 0 };

    entriesSorted.forEach((e) => {
      const v = getMetricValue(e, distributionMetric, userData);
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
        const v = getMetricValue(e, k, userData);
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
          const v = getMetricValue(e, k, userData);
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
        const a = getMetricValue(last, k, userData);
        const b = getMetricValue(prev, k, userData);
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
          const x = getMetricValue(e, a, userData);
          const y = getMetricValue(e, b, userData);
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
        body: 'In Profile, switch on 1-2 extra symptoms you care about. Keep it lightweight.',
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
      // Early phase (4-6 days): allow a bit earlier, but only for relationships that are less "body <-> body".
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

          // Block physio <-> physio (including hormonal) suggestions entirely.
          const bothBodyish = (kindA === 'physio' || kindA === 'hormonal') && (kindB === 'physio' || kindB === 'hormonal');
          if (bothBodyish) continue;

          // Early phase (4-6 days): allow a few more useful relationships so the page doesn't feel empty.
          // We still keep it conservative: no body<->body, and we prioritise behaviour/state links.
          if (!deepReady) {
            const isBehaviourState =
              (kindA === 'behaviour' && kindB === 'state') || (kindA === 'state' && kindB === 'behaviour');

            const involvesBehaviour = kindA === 'behaviour' || kindB === 'behaviour';
            const involvesState = kindA === 'state' || kindB === 'state';

            // Allow behaviour<->state, and behaviour<->body (e.g. sleep <-> stress, alcohol <-> hot flushes),
            // but avoid state<->body in early phase as it tends to overfit.
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
        // still avoid anything "body <-> body"
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
      const x = getMetricValue(e, scatterX, userData);
      const y = getMetricValue(e, scatterY, userData);
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
      const v = getMetricValue(e, key, userData);
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
      .map((e) => getMetricValue(e, k, userData))
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
  const [customExperimentChangeKey, setCustomExperimentChangeKey] = useState<string>('');
  const [experimentChangeKey, setExperimentChangeKey] = useState<string>('');
  const [experimentMetricLimitFlash, setExperimentMetricLimitFlash] = useState<boolean>(false);
  const [replaceExperimentConfirm, setReplaceExperimentConfirm] = useState<null | ExperimentPlan>(null);

  const { experiment, setExperiment, clearExperiment } = useExperiment();

  const CUSTOM_EXPERIMENT_MAX_METRICS = 5;
  const [preOpenExperimentConfirm, setPreOpenExperimentConfirm] = useState<
    null | {
      type: 'custom' | 'suggested';
      metrics?: Array<MetricKey>;
      plan?: { title: string; steps: string[]; note: string };
      durationDays?: number;
      changeKey?: string;
    }
  >(null);
  const openExperiment = (metrics?: Array<MetricKey>) => {
    if (experimentStatus && !experimentStatus.done) {
      setPreOpenExperimentConfirm({ type: 'suggested', metrics });
      return;
    }
    const focus = (metrics && metrics.length ? metrics : selected).slice(0, 5);
    const plan = buildExperimentPlan(focus);
    setExperimentMetrics(focus);
    setExperimentPlan(plan);
    setIsCustomExperiment(false);
    setExperimentChangeKey('');
    setExperimentOpen(true);
  };
  const openCustomExperiment = () => {
    if (experimentStatus && !experimentStatus.done) {
      setPreOpenExperimentConfirm({ type: 'custom' });
      return;
    }
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
    setExperimentMetrics(focus.slice(0, CUSTOM_EXPERIMENT_MAX_METRICS));
    setExperimentDurationDays(3);
    setIsCustomExperiment(true);
    setCustomExperimentTitle('Your experiment');
    setCustomExperimentChangeKey('');
    setExperimentChangeKey('');
    setExperimentOpen(true);
  };

  const openTryNextPrompt = (p: { title: string; changeKey: string; metrics: MetricKey[]; durationDays?: number; why?: string[] }) => {
    if (experimentStatus && !experimentStatus.done) {
      // Stop/start confirmation happens before setup.
      const plan = {
        title: p.title,
        steps: [
          'Try ONE small change for the duration.',
          'Keep everything else roughly the same, if you can.',
          'Log your chosen measures each day, then review the before/after summary.',
        ],
        note: 'If something makes you feel worse, stop and switch to something gentler.',
      };
      setPreOpenExperimentConfirm({
        type: 'suggested',
        metrics: p.metrics,
        plan,
        durationDays: p.durationDays ?? 3,
        changeKey: p.changeKey || '',
      });
      return;
    }
    setExperimentPlan({
      title: p.title,
      steps: [
        'Try ONE small change for the duration.',
        'Keep everything else roughly the same, if you can.',
        'Log your chosen measures each day, then review the before/after summary.',
      ],
      note: 'If something makes you feel worse, stop and switch to something gentler.',
    });
    setExperimentMetrics((p.metrics || []).slice(0, 5));
    setExperimentDurationDays(p.durationDays ?? 3);
    setIsCustomExperiment(false);
    setExperimentChangeKey(p.changeKey || '');
    setExperimentOpen(true);
  };

  const startExperiment = () => {
    const todayISO = isoTodayLocal();
    if (!experimentPlan) return;
    const baseMetrics = (experimentMetrics.length ? experimentMetrics : selected).slice(0, isCustomExperiment ? CUSTOM_EXPERIMENT_MAX_METRICS : 6) as any;
    const trimmedMetrics = isCustomExperiment ? baseMetrics.slice(0, CUSTOM_EXPERIMENT_MAX_METRICS) : baseMetrics;
    const safeMetrics = isCustomExperiment && (!trimmedMetrics || trimmedMetrics.length === 0) ? (['mood'] as any) : trimmedMetrics;

    const plan: ExperimentPlan = {
      id: `${todayISO}-${Math.random().toString(16).slice(2)}`,
      title: isCustomExperiment ? (customExperimentTitle.trim() || 'Your experiment') : experimentPlan.title,
      startDateISO: todayISO,
      durationDays: experimentDurationDays,
      metrics: safeMetrics,
      changeKey: experimentChangeKey
        ? experimentChangeKey
        : isCustomExperiment && customExperimentChangeKey
          ? customExperimentChangeKey
          : undefined,
      steps: experimentPlan.steps,
      note: experimentPlan.note,
    };

    // Single-active-experiment guardrail
    if (experimentStatus && !experimentStatus.done) {
      setReplaceExperimentConfirm(plan);
      return;
    }

    setExperiment(plan);
    setExperimentOpen(false);
    setIsCustomExperiment(false);

    // Scroll to Experiments section (hero stays first)
    try {
      const el = document.getElementById('eb-experiments');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        digest: buildExperimentDigest(experimentComparison),
      },
    });

    setFinishExperimentConfirm(null);
  };

  const confirmReplaceExperiment = () => {
    if (!replaceExperimentConfirm) return;
    // Stop existing + start new
    clearExperiment();
    setExperiment(replaceExperimentConfirm);
    setReplaceExperimentConfirm(null);
    setExperimentOpen(false);
    setIsCustomExperiment(false);
    setExperimentStartedFlash(true);
    try {
      const el = document.getElementById('eb-experiments');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      // ignore
    }
    window.setTimeout(() => setExperimentStartedFlash(false), 3200);
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

  const experimentComparison = useMemo(() => {
    if (!experimentStatus) return null;
    try {
      return computeExperimentComparison({
        entries: entriesAllSorted,
        experiment: experimentStatus.ex as ExperimentPlan,
        user: userData,
        maxMetrics: 5,
      });
    } catch {
      return null;
    }
  }, [experimentStatus, entriesAllSorted, userData]);

  const experimentsMaturity = useMemo(() => {
    const n = entriesSorted.length;
    if (n <= 6) return { label: 'Early', hint: 'You are building the baseline.' };
    if (n <= 29) return { label: 'Learning', hint: 'Patterns are starting to form.' };
    if (n <= 59) return { label: 'Emerging', hint: 'Signals are getting clearer.' };
    return { label: 'Established', hint: 'Great baseline. Experiments are more meaningful now.' };
  }, [entriesSorted.length]);

  const suggestedExperiments = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      body: string;
      confidence: 'low' | 'medium' | 'high';
      metrics: MetricKey[];
      allow: boolean;
    }> = [];

    corrPairs.slice(0, 8).forEach((p, idx) => {
      items.push({
        id: `corr-${idx}`,
        title: `${p.a} + ${p.b}`,
        body: `A ${p.confidence === 'high' ? 'clearer' : p.confidence === 'medium' ? 'possible' : 'new'} pattern based on ${p.n} days logged together.`,
        confidence: p.confidence,
        metrics: [p.aKey, p.bKey].filter(Boolean) as any,
        allow: Boolean(p.allowSuggestedExperiment),
      });
    });

    findings
      .filter((f: any) => Boolean(f?.allowSuggestedExperiment) && Array.isArray(f?.metrics) && f.metrics.length)
      .slice(0, 8)
      .forEach((f: any, idx: number) => {
        items.push({
          id: `find-${idx}`,
          title: f.title,
          body: f.body,
          confidence: (f.confidence as any) || 'medium',
          metrics: (f.metrics as any[]).slice(0, 3) as any,
          allow: true,
        });
      });

    const uniq = new Map<string, (typeof items)[number]>();
    items.forEach((it) => {
      const key = it.metrics.join('|');
      if (!uniq.has(key)) uniq.set(key, it);
    });
    return Array.from(uniq.values()).filter((it) => it.allow).slice(0, 10);
  }, [corrPairs, findings]);

  // --- Option B: pattern-aware "Try next" prompts ---
  type TryNextPrompt = {
    id: string;
    title: string;
    changeKey: string;
    metrics: MetricKey[];
    durationDays: number;
    why: string[];
  };

  const DISMISS_PROMPTS_KEY = 'eb_dismissed_experiment_prompts_v1';
  const [dismissedPrompts, setDismissedPrompts] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_PROMPTS_KEY);
      return raw ? (JSON.parse(raw) as any) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DISMISS_PROMPTS_KEY, JSON.stringify(dismissedPrompts || {}));
    } catch {
      // ignore
    }
  }, [dismissedPrompts]);

  const dismissPrompt = (id: string) => {
    const until = addDaysISO(isoTodayLocal(), 7);
    setDismissedPrompts((prev) => ({ ...(prev || {}), [id]: until }));
  };

  const tryNextPrompts = useMemo(() => {
    const today = isoTodayLocal();
    const recent = filterByDays(entriesAllSorted, 21);

    // Need some baseline logging to avoid noisy nudges.
    if (recent.length < 7) return [] as TryNextPrompt[];

    const enabledModulesSet = new Set(userData.enabledModules || []);
    const enabledInf = new Set(userData.enabledInfluences || []);

    const valuesFor = (k: MetricKey): number[] => {
      const xs: number[] = [];
      recent.forEach((e) => {
        const v = metricValue(e, k);
        if (v != null) xs.push(v);
      });
      return xs;
    };

    const countInfluence = (key: string): number => {
      let n = 0;
      recent.forEach((e) => {
        const anyE: any = e as any;
        const flags = anyE?.influences || anyE?.influenceFlags || {};
        if (flags && typeof flags === 'object' && Boolean(flags[key])) n += 1;
      });
      return n;
    };

    const prompts: TryNextPrompt[] = [];

    // 1) Sleep up and down → earlier bedtime / fewer late nights
    if (enabledModulesSet.has('sleep' as any) && enabledInf.has('lateNight')) {
      const xs = valuesFor('sleep' as any);
      if (xs.length >= 5 && stdev(xs) >= 2) {
        prompts.push({
          id: 'try-sleep-consistency',
          title: 'Sleep consistency test',
          changeKey: 'lateNight',
          metrics: (['sleep', 'energy'] as any).filter((k: any) => enabledModulesSet.has(k)) as any,
          durationDays: 3,
          why: ['Sleep has been a bit up and down recently.', 'A steadier bedtime is a simple lever to test.'],
        });
      }
    }

    // 2) High stress → add a small buffer
    if (enabledModulesSet.has('stress' as any) && enabledInf.has('stressfulDay')) {
      const xs = valuesFor('stress' as any);
      if (xs.length >= 5 && mean(xs) >= 6.5) {
        prompts.push({
          id: 'try-stress-buffer',
          title: 'Stress buffer test',
          changeKey: 'stressfulDay',
          metrics: (['stress', 'sleep'] as any).filter((k: any) => enabledModulesSet.has(k)) as any,
          durationDays: 3,
          why: ['Stress has been running a bit high recently.', 'A tiny daily buffer can be enough to shift the pattern.'],
        });
      }
    }

    // 3) Anxiety + caffeine logged → caffeine timing
    if (enabledModulesSet.has('anxiety' as any) && enabledInf.has('caffeine')) {
      const xs = valuesFor('anxiety' as any);
      const cafDays = countInfluence('caffeine');
      if (xs.length >= 5 && mean(xs) >= 6 && cafDays >= 3) {
        prompts.push({
          id: 'try-caffeine-timing',
          title: 'Caffeine timing test',
          changeKey: 'caffeine',
          metrics: (['anxiety', 'sleep'] as any).filter((k: any) => enabledModulesSet.has(k)) as any,
          durationDays: 3,
          why: ['You have logged caffeine on several recent days.', 'A simple timing tweak can sometimes reduce jittery days.'],
        });
      }
    }

    // 4) Headache + low hydration logged → hydration support
    if (enabledModulesSet.has('headache' as any) && enabledInf.has('lowHydration')) {
      const xs = valuesFor('headache' as any);
      const lowHydDays = countInfluence('lowHydration');
      if (xs.length >= 5 && mean(xs) >= 4.5 && lowHydDays >= 2) {
        prompts.push({
          id: 'try-hydration-support',
          title: 'Hydration support test',
          changeKey: 'lowHydration',
          metrics: (['headache', 'dizziness'] as any).filter((k: any) => enabledModulesSet.has(k)) as any,
          durationDays: 3,
          why: ['Headaches have shown up a few times recently.', 'Hydration is an easy first lever to test.'],
        });
      }
    }

    // 5) Night sweats + alcohol logged → alcohol-free window
    if (enabledModulesSet.has('nightSweats' as any) && enabledInf.has('alcohol')) {
      const xs = valuesFor('nightSweats' as any);
      const alcDays = countInfluence('alcohol');
      if (xs.length >= 5 && mean(xs) >= 4.5 && alcDays >= 2) {
        prompts.push({
          id: 'try-alcohol-free',
          title: 'Alcohol-free window',
          changeKey: 'alcohol',
          metrics: (['nightSweats', 'sleep'] as any).filter((k: any) => enabledModulesSet.has(k)) as any,
          durationDays: 3,
          why: ['Night sweats have been noticeable recently.', 'A short alcohol-free window can be a clear test.'],
        });
      }
    }

    // Remove dismissed prompts (local only) and prompts with no metrics.
    const active = prompts
      .map((p) => ({ ...p, metrics: (p.metrics || []).filter((k) => isMetricInScope(k as any, userData)) }))
      .filter((p) => (p.metrics || []).length > 0)
      .filter((p) => {
        const until = dismissedPrompts?.[p.id];
        if (!until) return true;
        return until < today;
      });

    return active.slice(0, 6);
  }, [entriesAllSorted, userData, dismissedPrompts]);

  const [outcomeNote, setOutcomeNote] = useState<string>('');
  const [showAllExperimentMetrics, setShowAllExperimentMetrics] = useState(false);
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});

  const buildExperimentDigest = (cmp: any) => {
    if (!cmp) return undefined;
    try {
      const top = (cmp.metrics ?? []).slice(0, 5).map((m: any) => ({
        key: m.key,
        label: m.label,
        beforeAvg: m.before?.avg ?? null,
        beforeCount: m.before?.count ?? 0,
        duringAvg: m.during?.avg ?? null,
        duringCount: m.during?.count ?? 0,
        delta: m.delta ?? null,
        enough: Boolean(m.hasEnoughData),
      }));
      return {
        createdAtISO: new Date().toISOString(),
        enoughData: Boolean(cmp.enoughData),
        window: cmp.window,
        durationDays: cmp.durationDays,
        beforeDaysWithAny: cmp.beforeDaysWithAny,
        duringDaysWithAny: cmp.duringDaysWithAny,
        summarySentence: experimentSummarySentence(cmp, userData) || undefined,
        metrics: top,
      };
    } catch {
      return undefined;
    }
  };

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
        digest: buildExperimentDigest(experimentComparison),
      },
    };
    setExperiment(next);
  };

  const renderExperimentComparisonBlock = (mode: 'progress' | 'conclusion') => {
    if (!experimentStatus) return null;
    const digest = (experimentStatus.ex as any)?.outcome?.digest;
    const cmp =
      mode === 'conclusion' && digest
        ? {
            ...digest,
            metrics: (digest.metrics ?? []).map((m: any) => ({
              key: m.key,
              label: m.label,
              before: { avg: m.beforeAvg, count: m.beforeCount },
              during: { avg: m.duringAvg, count: m.duringCount },
              delta: m.delta,
              hasEnoughData: Boolean(m.enough),
            })),
          }
        : experimentComparison;

    if (!cmp) return null;

    const title = mode === 'progress' ? 'So far' : 'Before vs during';
    const subtitle = mode === 'progress'
      ? `Logged ${cmp.duringDaysWithAny}/${cmp.durationDays} experiment days · ${cmp.beforeDaysWithAny}/${cmp.durationDays} baseline days`
      : `Baseline: ${cmp.window.beforeStartISO} to ${cmp.window.beforeEndISO} · During: ${cmp.window.duringStartISO} to ${cmp.window.duringEndISO}`;

    if (!cmp.metrics.length) return null;

    // If there isn't enough data, we still show a gentle coverage hint.
    if (!cmp.enoughData) {
      return (
        <div className="mt-4 eb-inset rounded-2xl p-4">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-sm eb-muted">{subtitle}</div>
          <div className="mt-3 text-sm eb-muted">
            Not enough data yet for a meaningful before/after comparison. Aim for at least 2 logged days in both windows.
          </div>
        </div>
      );
    }

    const fmt = (n: number | null) => (n == null ? '–' : n.toFixed(1));
    const fmtDelta = (d: number | null) => {
      if (d == null) return '–';
      const s = d >= 0 ? '+' : '';
      return `${s}${d.toFixed(1)}`;
    };

    const visibleMetrics = showAllExperimentMetrics ? cmp.metrics : cmp.metrics.slice(0, 3);

    return (
      <div className="mt-4 eb-inset rounded-2xl p-4">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-sm eb-muted">{subtitle}</div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleMetrics.slice(0, 5).map((m) => (
            <div key={String(m.key)} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="text-sm font-semibold">{labelFor(m.key as any, userData)}</div>
              {m.hasEnoughData ? (
                <>
                  <div className="mt-2 text-sm eb-muted">
                    Baseline <b>{fmt(m.before.avg)}</b> · During <b>{fmt(m.during.avg)}</b> · Change <b>{fmtDelta(m.delta)}</b>
                  </div>
                  <div className="mt-2 text-xs eb-muted">
                    Data: {m.before.count} baseline points · {m.during.count} during points
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 text-sm eb-muted">
                    Not enough data for this measure yet.
                  </div>
                  <div className="mt-2 text-xs eb-muted">
                    Data: {m.before.count} baseline points · {m.during.count} during points
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {cmp.metrics.length > 3 && (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm font-semibold underline"
              onClick={() => setShowAllExperimentMetrics((v) => !v)}
            >
              {showAllExperimentMetrics
                ? 'Show fewer measures'
                : `Show all ${Math.min(5, cmp.metrics.length)} measures`}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderExperimentCTA = (ms: any) => {
    if (!ms) return null;
    const strength = ms.strength;
    const hasHormonal = Boolean(ms.hormonalInvolved);
    const allow = Boolean(ms.allowSuggestedExperiment);

    if (!allow) {
      return null;
    }

    // If it's hormonal-related and weak, be extra conservative.
    if (hasHormonal && strength === 'weak') {
      return null;
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

  const renderActiveExperimentCard = () => {
    if (!experimentStatus) return null;
    return (
      <div id="eb-active-experiment" className="eb-inset rounded-2xl p-6">
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
              {experimentStatus.ex.changeKey ? (
                <span> • Changing: {otherInfluenceLabel(String(experimentStatus.ex.changeKey))}</span>
              ) : null}
              {Array.isArray(experimentStatus.ex.metrics) && experimentStatus.ex.metrics.length ? (
                <span>
                  {' '}
                  • Measuring:{' '}
                  {(experimentStatus.ex.metrics as any[])
                    .slice(0, 5)
                    .map((k) => labelFor(k as any, userData))
                    .join(' • ')}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 sm:mt-0 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
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
            <div key={i} className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px] !bg-[rgb(var(--color-accent)/0.08)] !border !border-[rgb(var(--color-accent)/0.16)]">
              <div className="text-sm font-semibold">Step {i + 1}</div>
              <div className="mt-1 text-sm eb-muted">{s}</div>
            </div>
          ))}

          {!experimentStatus.done ? (
            <div className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px] !bg-[rgb(var(--color-accent)/0.08)] !border !border-[rgb(var(--color-accent)/0.16)]">
              <div className="text-sm font-semibold">Step 4</div>
              <div className="mt-1 text-sm eb-muted">
                Tell me if it helped. We'll save the result so your future insights can become more meaningful.
              </div>
              <div className="mt-3 flex flex-wrap gap-2 justify-end">
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
                    ) : experimentStatus.ex.isComplete ? (
              <div className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px] !bg-[rgb(var(--color-accent)/0.08)] !border !border-[rgb(var(--color-accent)/0.16)]">
                <div className="text-sm font-semibold">Step 4</div>
                <div className="mt-1 text-sm eb-muted">
                  Experiment complete. Thanks for telling me what helped.
                </div>
              </div>
            ) : null}
        </div>

        {experimentStatus.ex.note ? <div className="mt-3 text-sm eb-muted">{experimentStatus.ex.note}</div> : null}

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

        {!experimentStatus.done && experimentStatus.day >= 2 ? renderExperimentComparisonBlock('progress') : null}

        {experimentStatus.day >= (experimentStatus.ex.durationDays ?? 3) && !(experimentStatus.ex as any)?.outcome?.rating ? (
          <div className="mt-4 eb-inset rounded-2xl p-4">
            <div className="text-sm font-semibold">Did it help?</div>
            <div className="mt-1 text-sm eb-muted">Quick 5-point rating so we can turn this into a real conclusion.</div>
            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={chipClass((experimentStatus.ex as any)?.outcome?.rating === n)}
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

        {(experimentStatus.ex as any)?.outcome?.rating ? (
          <div className="mt-4 eb-inset rounded-2xl p-4">
            {(() => {
              const rating = Number((experimentStatus.ex as any)?.outcome?.rating ?? 0);
              const label = rating >= 4 ? 'Successful' : rating <= 2 ? 'Unsuccessful' : 'Mixed';
              const Icon = rating >= 4 ? CheckCircle2 : rating <= 2 ? XCircle : HelpCircle;
              const digest = (experimentStatus.ex as any)?.outcome?.digest;
              const summary =
                digest?.summarySentence ||
                experimentSummarySentence(experimentComparison, userData) ||
                (experimentComparison?.enoughData
                  ? null
                  : 'Not enough baseline data for a clean comparison yet, so your rating matters most.');
              return (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Conclusion</div>
                    <div className="mt-1 text-sm eb-muted">
                      <span className="inline-flex items-center gap-2 font-medium text-[rgb(var(--color-text))]">
                        <Icon size={18} className="text-[rgb(var(--color-text))]" />
                        {label}
                      </span>
                      {summary ? <span> · {summary}</span> : null}
                      {experimentComparison?.enoughData && !summary ? (
                        <span> · Here is what changed, on average.</span>
                      ) : null}
                    </div>
                    {(experimentStatus.ex as any)?.outcome?.note ? (
                      <div className="mt-2 text-sm">
                        <span className="font-medium">Note:</span> {(experimentStatus.ex as any).outcome.note}
                      </div>
                    ) : null}
                  </div>
                  <span className="eb-pill" style={{ background: 'rgba(0,0,0,0.06)' }}>Result saved</span>
                </div>
              );
            })()}
          </div>
        ) : null}

        {(experimentStatus.ex as any)?.outcome?.rating ? renderExperimentComparisonBlock('conclusion') : null}
      </div>
    );
  };

  return (
    <div className="eb-container space-y-6 pt-8 pb-12 overflow-x-hidden">
      {/* Header */}
      <div className="pt-2">
        <h1 className="mb-1">Insights &amp; Patterns</h1>
        <p className="text-[rgb(var(--color-text-secondary))]">Discover connections between your symptoms and cycle.</p>

        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <span className="eb-pill">
            Days logged • {entriesSorted.length}
          </span>
          <span className="eb-pill">
            Current streak • {streak}
          </span>
          <span className="eb-pill">
            View • {TIMEFRAMES.find((t) => t.key === timeframe)?.label ?? timeframe}
          </span>
        </div>
      </div>

      {/* Your settings */}
      <div className="eb-card eb-hero-surface">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="eb-hero-title eb-hero-on-dark">Your settings</h3>
            <p className="eb-hero-subtitle mt-1 eb-hero-on-dark-muted">
              Keep it simple: 3-5 metrics gives you the cleanest signals.
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

              className="w-[92vw] max-w-[420px] sm:max-w-lg rounded-2xl p-0 overflow-hidden max-h-[80vh]"

            >

              <div className="flex max-h-[80vh] flex-col">

                <div className="flex items-start justify-between gap-3 border-b border-black/10 p-4">

                  <div className="min-w-0">

                    <div className="text-lg font-semibold">Choose metrics to analyse (max 6)</div>

                    <div className="mt-1 text-sm eb-muted">Select up to 6 metrics to personalise your insights.</div>

                  </div>


                  <DialogClose asChild>

                    <button

                      type="button"

                      className="shrink-0 rounded-full border border-black/10 px-3 py-1 text-sm eb-muted hover:bg-black/5"

                    >

                      Close

                    </button>

                  </DialogClose>

                </div>


                <div className="min-h-0 overflow-y-auto p-4">

                  <div className="text-sm eb-muted">Selected: {metricsSummary || 'None'}</div>


                  <div className="mt-3 flex flex-wrap gap-2 justify-end">

                    <button type="button" className={chipClass(selected.includes('mood'))} onClick={() => toggleMetric('mood')}>

                      Mood

                    </button>


                    {selectableKeys.map((k) => (

                      <button

                        type="button"

                        key={k}

                        className={chipClass(selected.includes(k))}

                        onClick={() => toggleMetric(k)}

                        title={labelFor(k, userData)}

                      >

                        {labelFor(k, userData)}

                      </button>

                    ))}

                  </div>


                  <div className="mt-3 text-sm eb-muted">Tip: if this feels like too much, pick your &quot;top 3&quot; and stick with them for a week.</div>

                </div>

              </div>

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
            <div className="eb-card-sub">The "headline" signals from your recent data.</div>
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

                    <div className="mt-3 flex flex-wrap gap-2 justify-end">
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
            </CarouselContent>
            <CarouselPrevious className="flex opacity-70" />
            <CarouselNext className="flex opacity-70" />
          </Carousel>
        </div>
      </div>

      {/* Sleep Insights (optional) */}
      {sleepInsightsOn ? (
        <div className="eb-card p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-[rgb(var(--color-primary)/0.12)] flex items-center justify-center shrink-0 self-start">
              <Moon className="w-5 h-5 text-[rgb(var(--color-primary-dark))]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="mb-0.5">Sleep</h2>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">{sleepGentleHint}</p>
                </div>

                <button type="button" className="eb-btn eb-btn-secondary shrink-0" onClick={() => setSleepExploreOpen(true)}>
                  Explore sleep
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
                Extra sleep details logged on <span className="font-medium">{sleepExtrasCount}</span> day{sleepExtrasCount === 1 ? '' : 's'}.
              </div>
            </div>
          </div>


          <div className="mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sleepSeries} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} width={30} />
                <Tooltip />
                <Line type="monotone" dataKey="sleep" dot={false} stroke={chartColors.primary} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Explore modal */}
          <Dialog open={sleepExploreOpen} onOpenChange={setSleepExploreOpen}>
            <EBDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Sleep explorer</DialogTitle>
                <DialogDescription>
                  A simple timeline view, with an optional overlay marker for what was going on that day.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 eb-inset rounded-2xl p-4 overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Influence overlay</div>
                  <select
                    className="eb-input !w-auto !py-2 text-sm"
                    value={sleepOverlayKey}
                    onChange={(e) => setSleepOverlayKey(e.target.value)}
                    aria-label="Influence overlay"
                  >
                    <option value="">None</option>
                    {sleepOverlayOptions.map((k) => (
                      <option key={k} value={k}>
                        {otherInfluenceLabel(k)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sleepSeriesWithOverlay} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} width={30} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const p: any = payload[0]?.payload;
                          const sleepVal = typeof p?.sleep === 'number' ? p.sleep : null;
                          const overlay = p?.overlay;
                          return (
                            <div className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm shadow">
                              <div className="font-medium">{label}</div>
                              {sleepVal !== null && <div>Sleep: {sleepVal}/10</div>}
                              {overlay && <div>{overlay}</div>}
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey="sleep" dot={false} stroke={chartColors.primary} strokeWidth={2} />

                      {sleepOverlayKey ? (
                        <Scatter dataKey="overlayMarker" fill={chartColors.primaryDark} />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
                  Tip: the dots are just markers. Your sleep line is the main thing.
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  autoFocus
                  type="button"
                  className="eb-btn eb-btn-secondary"
                  onClick={() => setSleepExploreOpen(false)}
                >
                  Close
                </button>
              </div>
            </EBDialogContent>
          </Dialog>
        </div>
      ) : null}

      

{/* Experiment dialog */}
      <Dialog open={experimentOpen} onOpenChange={setExperimentOpen}>
        <EBDialogContent
          title={experimentPlan?.title ?? 'Experiment'}
          description="Set up a tiny experiment and keep logging a few metrics so you can spot what changes."
          className="w-[88vw] max-w-[380px] sm:max-w-lg rounded-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>{experimentPlan?.title ?? 'Experiment'}</DialogTitle>
            <DialogDescription>
              Set up a tiny experiment and keep logging a few metrics so you can spot what changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
            <div className="text-sm eb-muted">
              Tiny, realistic actions. You are testing what helps your body, not trying to "fix everything".
            </div>

            {isCustomExperiment && (
              <div className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px]">
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

            {isCustomExperiment && (
              <div className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px]">
                <div className="text-sm font-semibold">What are you changing?</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(() => {
                    const enabled = Array.isArray(userData.enabledInfluences) ? (userData.enabledInfluences as string[]) : [];
                    const opts = Array.from(new Set(enabled.concat(Array.from(OTHER_INFLUENCE_KEYS as any)))).slice(0, 14);
                    const toggle = (k: string) => setCustomExperimentChangeKey((prev) => (prev === k ? '' : k));
                    return opts.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={chipClass(customExperimentChangeKey === k)}
                        onClick={() => toggle(k)}
                        aria-pressed={customExperimentChangeKey === k}
                      >
                        {otherInfluenceLabel(k)}
                      </button>
                    ));
                  })()}
                </div>
                <div className="mt-2 text-sm eb-muted">Pick one thing to change, if you can.</div>
              </div>
            )}

            {/* What to log */}
            <div className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px]">
              <div className="text-sm font-semibold flex items-center justify-between gap-2">
                <span>What to measure (daily)</span>
                {isCustomExperiment ? (
                  <span className="text-xs eb-muted">Selected {experimentMetrics.length}/{CUSTOM_EXPERIMENT_MAX_METRICS}</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {isCustomExperiment ? (
                  (() => {
                    const options: MetricKey[] = Array.from(new Set((['mood' as any] as MetricKey[]).concat(selectableKeys)));
                    const toggle = (k: MetricKey) => {
                      setExperimentMetrics((prev) => {
                        if (prev.includes(k)) return prev.filter((x) => x !== k);

                        if (prev.length >= CUSTOM_EXPERIMENT_MAX_METRICS) {
                          setExperimentMetricLimitFlash(true);
                          window.setTimeout(() => setExperimentMetricLimitFlash(false), 1800);
                          return prev;
                        }

                        return [...prev, k];
                      });
                    };
                    return options.map((k) => {
                      const on = experimentMetrics.includes(k);
                      return (
                        <button
                          key={String(k)}
                          type="button"
                          className={chipClass(on)}
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
                Pick up to 5 measures. Consistency beats completeness.
                {experimentMetricLimitFlash ? (
                  <span className="ml-2 font-medium">Max 5 selected.</span>
                ) : null}
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
                    className={chipClass(d === experimentDurationDays)}
                    onClick={() => setExperimentDurationDays(d)}
                    aria-label={`Set experiment length to ${d} days`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>

          </div>

          <div className="pt-3 shrink-0 flex flex-col sm:flex-row sm:justify-end gap-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
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
        </EBDialogContent>
      </Dialog>




      {/* Start new experiment confirm (pre-open) */}
      <Dialog
        open={!!preOpenExperimentConfirm}
        onOpenChange={(open) => {
          if (!open) setPreOpenExperimentConfirm(null);
        }}
      >
        <EBDialogContent
          title="Start a new experiment?"
          description="You already have an experiment in progress."
          className="w-[92vw] max-w-[420px] rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle>Start a new experiment?</DialogTitle>
            <DialogDescription>
              You already have an experiment in progress. You can keep it, or stop it and start a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className="eb-btn eb-btn-secondary w-full" onClick={() => setPreOpenExperimentConfirm(null)}>
              Keep current experiment
            </button>
            <button
              type="button"
              className="eb-btn eb-btn-primary w-full"
              onClick={() => {
                const next = preOpenExperimentConfirm;
                setPreOpenExperimentConfirm(null);
                clearExperiment();
                window.setTimeout(() => {
                  if (next?.type === 'custom') {
                    // open without re-triggering the confirm
                    const focus = selected.slice(0, 5);
                    setExperimentPlan({
                      title: 'Create your own experiment',
                      steps: [
                        'Pick what you want to try (for example magnesium, earlier bedtime, or less caffeine).',
                        'Keep everything else roughly the same for the duration, if you can.',
                        'Log your chosen metrics each day, then review the mini chart and the before/after summary.',
                      ],
                      note: 'This is a tiny test, not a diagnosis. If something makes you feel worse, stop and switch to something gentler.',
                    });
                    setExperimentMetrics(focus.slice(0, CUSTOM_EXPERIMENT_MAX_METRICS));
                    setExperimentDurationDays(3);
                    setIsCustomExperiment(true);
                    setCustomExperimentTitle('Your experiment');
                    setCustomExperimentChangeKey('');
                    setExperimentChangeKey('');
                    setExperimentOpen(true);
                  } else {
                    const focus = (next?.metrics && next.metrics.length ? next.metrics : selected).slice(0, 5);
                    const plan = next?.plan ? next.plan : buildExperimentPlan(focus);
                    setExperimentMetrics(focus);
                    setExperimentPlan(plan);
                    setExperimentDurationDays(next?.durationDays ?? 3);
                    setExperimentChangeKey(next?.changeKey || '');
                    setIsCustomExperiment(false);
                    setExperimentOpen(true);
                  }
                }, 0);
              }}
            >
              Stop and start a new one
            </button>
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

      {/* Replace active experiment confirm */}
      <Dialog
        open={Boolean(replaceExperimentConfirm)}
        onOpenChange={(open) => {
          if (!open) setReplaceExperimentConfirm(null);
        }}
      >
        <EBDialogContent
          title="One experiment at a time"
          description="To keep results meaningful, you can run one active experiment at a time."
          className="w-[92vw] max-w-[420px] sm:max-w-md rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle>Replace your current experiment?</DialogTitle>
            <DialogDescription>
              You already have an experiment in progress. If you start a new one, we will stop the current one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm eb-muted">
              Tip: if you want clean results, finish the current one first.
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" className="eb-btn-secondary" onClick={() => setReplaceExperimentConfirm(null)}>
                Keep current
              </button>
              <button type="button" className="eb-btn-primary" onClick={confirmReplaceExperiment}>
                Stop and start new
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
              <div className="eb-card-sub">Your selected metrics over time (0-10). The key is underneath.</div>
            </div>
            <button
              type="button"
              className="eb-pill"
              style={{ background: smoothTrends ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)' }}
              onClick={() => setSmoothTrends((s) => !s)}
              aria-label="Toggle rolling average smoothing"
              title="Smooth the lines (3-day rolling average)"
            >
              {smoothTrends ? 'Rolling avg: on' : 'Rolling avg: off'}
            </button>
          </div>
        </div>

        <div className="mt-3 eb-chart">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={seriesForChart} margin={{ left: 0, right: 8, top: 10, bottom: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                  formatter={(value: any, name: any) => [value == null ? '-' : Number(value).toFixed(0), labelFor(String(name) as any, userData)]}
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
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
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

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            {highSymptomDays.length === 0 ? (
              <div className="eb-inset rounded-2xl p-4 text-sm eb-muted">
                No "high" days yet in this timeframe. Keep logging and this section will start to light up.
              </div>
            ) : (
              highSymptomDays.map((it) => (
                <div key={String(it.key)} className="eb-inset rounded-2xl p-4 flex flex-col justify-center min-h-[86px]">
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
            <div className="eb-card-sub">A softer view of correlations.</div>
          </div>
        </div>

        {corrPairs.length < 1 ? (
          <div className="mt-2 text-sm eb-muted">Log a few days with the same metrics to reveal relationships.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {corrPairs.slice(0, 4).map((p, idx) => {
              // Avoid "weak/strong" language early on - keep it inviting.
              const confLabel =
                p.confidence === 'high' ? 'Clearer pattern' : p.confidence === 'medium' ? 'Possible pattern' : 'Emerging pattern';
              const direction = p.r > 0 ? 'move together' : 'move in opposite directions';
              const opener = p.confidence === 'low' ? 'There may be an emerging pattern where' : 'There may be a pattern where';
              const safeCopy = p.hormonalInvolved
                ? `${opener} these ${direction}. This could reflect stress, lifestyle, or hormonal changes.`
                : `${opener} these ${direction}.`;

              return (
                <div key={idx} className="eb-inset rounded-2xl p-5 flex flex-col min-h-[170px]">
                  <div className="text-sm font-semibold">
                    {p.a} + {p.b}
                  </div>
                  <div className="mt-1 text-xs eb-muted">
                    {confLabel} Â· based on {p.n} days logged together
                  </div>
                  <div className="mt-2 text-sm eb-muted">{safeCopy}</div>

                  {/* Spacer to keep "Why am I seeing this?" in a stable spot near the bottom */}
                  <div className="flex-1" />

                  <details className="mt-3 rounded-2xl border border-neutral-200 bg-white/60 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Why am I seeing this?</summary>
                    <div className="mt-2 text-sm eb-muted space-y-1">
                      {(p.why ?? []).map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                      <div className="pt-1 text-xs eb-muted">Patterns are a hint, not proof.</div>
                    </div>
                  </details>

                  <div className="pt-4 flex items-center justify-between gap-2">
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

      {/* Relationship explorer removed */}

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
              <BarChart data={weekdayBar} margin={{ left: 0, right: 8, top: 10, bottom: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
                  formatter={(value: any) => [value == null ? '-' : Number(value).toFixed(1), labelFor(selected[0] ?? 'mood', userData)]}
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

          <div id="eb-active-experiment" className="eb-inset rounded-2xl p-6">
            <div className="text-sm font-semibold">Keep it light</div>
            <div className="mt-1 text-sm eb-muted">If you feel overwhelmed, switch off a symptom or two in Profile. You can always switch them back on.</div>
          </div>
        </div>
      </div>

      {/* Experiments */}
      <div id="eb-experiments" className="eb-card">
        <div className="eb-card-header">
          <div>
            <div className="eb-card-title">Experiments</div>
            <div className="eb-card-sub">
              Tiny tests to learn what helps. Maturity: <b>{experimentsMaturity.label}</b> · {experimentsMaturity.hint}
            </div>
          </div>
          <FlaskConical className="w-5 h-5" style={{ color: 'rgb(var(--color-accent))' }} />
        </div>

        {/* Gentle colour splash + context */}
        <div className="mt-4 eb-inset rounded-2xl p-5 !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
          <div className="text-sm font-semibold">Keep it simple</div>
          <div className="mt-1 text-sm text-neutral-800">
            Pick one small change, keep everything else roughly the same, and track a few measures for a short time.
          </div>
        </div>

        <div className="mt-4">{renderActiveExperimentCard()}</div>

        <div className="mt-4">
          <div className="text-sm font-semibold">Suggested experiments</div>
          <div className="mt-1 text-sm eb-muted">Two lanes: quick "Try next" nudges from your recent patterns, and deeper ideas when the signal is strong.</div>

          {/* Try next: pattern-aware prompts (Option B) */}
          {tryNextPrompts.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-semibold">Try next</div>
              <div className="mt-1 text-sm eb-muted">Based on your recent logs. Tiny, reversible tests.</div>
              <div className="mt-3">
                <Carousel opts={{ align: 'start' }} className="w-full">
                  <CarouselContent>
                    {tryNextPrompts.map((p) => (
                      <CarouselItem key={p.id} className="basis-full md:basis-1/2">
                        <div className="eb-inset rounded-2xl p-5 h-full flex flex-col !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold">{p.title}</div>
                            <span className="eb-pill" style={{ background: 'rgb(var(--color-accent)/0.18)' }}>Try next</span>
                          </div>

                          <div className="mt-2 text-sm eb-muted">
                            {p.why?.[0] || 'A small nudge based on what you have logged recently.'}
                          </div>

                          <button
                            type="button"
                            className="mt-3 text-sm font-medium underline underline-offset-4 self-start opacity-80 hover:opacity-100"
                            onClick={() => setWhyOpen((prev) => ({ ...(prev || {}), [p.id]: !Boolean(prev?.[p.id]) }))}
                          >
                            Why this suggestion?
                          </button>

                          {whyOpen?.[p.id] && (
                            <div className="mt-2 text-sm eb-muted">
                              <ul className="list-disc pl-5 space-y-1">
                                {(p.why || []).slice(0, 3).map((w, idx) => (
                                  <li key={`${p.id}-why-${idx}`}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2 justify-end">
                            {p.metrics.slice(0, 5).map((k) => (
                              <span key={String(k)} className="eb-pill" style={{ background: 'rgb(var(--color-accent)/0.18)' }}>
                                {labelFor(k as any, userData)}
                              </span>
                            ))}
                          </div>

                          <div className="flex-1" />

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              className="text-sm font-medium opacity-70 hover:opacity-100"
                              onClick={() => dismissPrompt(p.id)}
                            >
                              Not now
                            </button>
                            <button
                              type="button"
                              className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2"
                              onClick={() => openTryNextPrompt(p as any)}
                            >
                              <FlaskConical className="w-4 h-4" />
                              Set up {p.durationDays || 3}-day experiment
                            </button>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="flex opacity-70" />
                  <CarouselNext className="flex opacity-70" />
                </Carousel>
              </div>
            </div>
          )}

          {/* Strong signal: existing confidence-gated suggestions */}
          <div className={tryNextPrompts.length ? 'mt-6' : 'mt-3'}>
            <div className="text-sm font-semibold">When the signal is strong</div>
            <div className="mt-1 text-sm eb-muted">These start to appear as you log more days together.</div>

            {suggestedExperiments.length === 0 ? (
              <div className="mt-3 eb-inset rounded-2xl p-5 text-sm eb-muted !bg-[rgb(var(--color-accent)/0.08)] !border !border-[rgb(var(--color-accent)/0.16)]">
                Keep logging a few consistent metrics and this section will start to fill up.
              </div>
            ) : (
              <div className="mt-3">
                <Carousel opts={{ align: 'start' }} className="w-full">
                  <CarouselContent>
                    {suggestedExperiments.map((s) => {
                      const conf = s.confidence === 'high' ? 'Established' : s.confidence === 'medium' ? 'Emerging' : 'Learning';
                      return (
                        <CarouselItem key={s.id} className="basis-full md:basis-1/2">
                          <div className="eb-inset rounded-2xl p-5 h-full flex flex-col !bg-[rgb(var(--color-accent)/0.08)] !border !border-[rgb(var(--color-accent)/0.16)]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-semibold">{s.title}</div>
                              <span className="eb-pill" style={{ background: 'rgb(var(--color-accent)/0.18)' }}>
                                {conf}
                              </span>
                            </div>
                            <div className="mt-2 text-sm eb-muted">{s.body}</div>

                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                              {s.metrics.slice(0, 3).map((k) => (
                                <span key={String(k)} className="eb-pill" style={{ background: 'rgb(var(--color-accent)/0.18)' }}>
                                  {labelFor(k as any, userData)}
                                </span>
                              ))}
                            </div>

                            <div className="flex-1" />

                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2"
                                onClick={() => openExperiment(s.metrics)}
                              >
                                <FlaskConical className="w-4 h-4" />
                                Try a 3-day experiment
                              </button>
                            </div>
                          </div>
                        </CarouselItem>
                      );
                    })}
                  </CarouselContent>
                  <CarouselPrevious className="flex opacity-70" />
                  <CarouselNext className="flex opacity-70" />
                </Carousel>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 eb-inset rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Run your own experiment</div>
              <div className="mt-1 text-sm eb-muted">Name it first, then pick what you’re changing and what you’ll measure.</div>
            </div>
            <button
              type="button"
              className="px-6 py-3 rounded-xl bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary-dark))] transition-all font-medium inline-flex items-center gap-2 whitespace-nowrap w-full sm:w-auto justify-center sm:self-auto self-stretch"
              onClick={openCustomExperiment}
            >
              <FlaskConical className="w-4 h-4" />
              Create experiment
            </button>
          </div>
        </div>
      </div>

      {/* Export report */}
      <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 w-full">
            <h2 className="text-xl font-semibold tracking-tight">{reportCardTitle}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
              Download a readable <b>.html</b> report for you. The JSON export is the "machine" version, but it can't be restored as an in-app backup.
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