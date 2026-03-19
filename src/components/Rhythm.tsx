import React, { useMemo, useState } from 'react';
import { Moon, Sprout, Sparkles, Shield, Eye, Leaf, Compass, Info, GraduationCap, ChevronDown } from 'lucide-react';
import { RhythmHero } from './RhythmHero';
import { PhaseHistoryCard } from './PhaseHistoryCard';
import { useEntries, useExperimentHistory } from '../lib/appStore';
import { computeCycleStats, getRhythmModel, isoToday, sortByDateAsc } from '../lib/analytics';
import { getCycleTrustModel } from '../lib/cycleTrust';
import { getExperimentLearnings, getWhatsComingPredictions } from '../lib/rhythmPredictions';
import { getRhythmTimingModel } from '../lib/rhythmTiming';
import { getPhaseHistory } from '../lib/phaseHistory';
import { getRhythmPersonalPhaseSentence } from '../lib/rhythmCopy';
import { getRhythmPhaseState } from '../lib/phaseChange';
import { SYMPTOM_META } from '../lib/symptomMeta';
import type { CheckInEntry, SymptomKey, UserGoal } from '../types';
import type { UserData } from '../types';

type ConfidenceLevel = 'Learning' | 'Emerging' | 'Established';

type PhaseKey = 'reset' | 'rebuilding' | 'expressive' | 'protective';

type PhaseContent = {
  heroBody: string;
  lookLikeIntro: string;
  lookLikeBullets: string[];
  lookLikeDuration: string;
  doIntro: string;
  doCards: { permission: string; plans: string; work: string; body: string };
  nextPlanTitle: string;
  nextPlanBody: string;
  whyTitle: string;
  whyBody: string[];
};

const phaseContent: Record<PhaseKey, PhaseContent> = {
  reset: {
    heroBody:
      'This is your Reset window. Many people feel more inward, more tired, or a bit tender. If you’re craving comfort and simplicity, that makes sense here.',
    lookLikeIntro:
      'These can be common signs in Reset. As you log more, we’ll get a clearer picture of how this phase tends to feel for you.',
    lookLikeBullets: [
      'More sleep need, slower mornings, or lower social energy',
      'Cramps, aches, headaches, or feeling a bit more sensitive',
      'Cravings for warmth, quiet, and “low effort” food',
    ],
    lookLikeDuration: 'Helpful to remember: this phase often lasts around 3–6 days.',
    doIntro: 'This isn’t about “pushing through”. It’s about supporting your body while it resets.',
    doCards: {
      permission: 'Rest is productive here. Small comforts count.',
      plans: 'Keep plans spacious if you can. Choose the essentials.',
      work: 'Aim for admin, tidy-ups, and gentle progress.',
      body: 'Warmth, hydration, iron-rich foods, and gentle movement can help.',
    },
    nextPlanTitle: 'Plan gently if you can',
    nextPlanBody:
      'Energy often starts to rebuild soon. It can help to keep one small “easy win” ready for when you feel a lift.',
    whyTitle: 'Why this happens',
    whyBody: [
      'In the menstrual phase, hormone levels are at their lowest. That can make energy feel flatter and the body feel more sensitive.',
      'The key thing: these shifts are common and temporary. Over time, we’ll learn exactly how they show up for you.',
    ],
  },
  rebuilding: {
    heroBody:
      'This is your Rebuilding window. Many people notice energy, motivation, and mood begin to lift. It can feel like things are slowly coming back online.',
    lookLikeIntro:
      'These can be common signs in Rebuilding. As you log more, we’ll get a clearer picture of how this phase tends to feel for you.',
    lookLikeBullets: [
      'A steadier mood, clearer thinking, or a little more drive',
      'Energy returning gradually (not always in a straight line)',
      'Feeling more open to plans, people, and fresh starts',
    ],
    lookLikeDuration: 'Helpful to remember: this phase often lasts around 6–12 days.',
    doIntro: 'This is a good time for gentle momentum. Think “build”, not “blast”.',
    doCards: {
      permission: 'Start small. Consistency beats intensity.',
      plans: 'Add one or two things back in, and leave breathing room.',
      work: 'Great for planning, problem-solving, and making progress.',
      body: 'Protein, daylight, movement you enjoy, and solid sleep routines can help.',
    },
    nextPlanTitle: 'Plan gently if you can',
    nextPlanBody:
      'You may feel more outward soon. If you’ve got something social or creative to do, this can be a good lead-in window.',
    whyTitle: 'Why this happens',
    whyBody: [
      'In the follicular phase, oestrogen begins to rise. For many people that can support mood, motivation, and mental clarity.',
      'The key thing: everyone’s pattern is a bit different. Over time, we’ll learn your version of this phase.',
    ],
  },
  expressive: {
    heroBody:
      'This is your Expressive window. Many people feel more outward, more social, and a bit more energised. It can be a strong time for connection and getting things done.',
    lookLikeIntro:
      'These can be common signs in Expressive. As you log more, we’ll get a clearer picture of how this phase tends to feel for you.',
    lookLikeBullets: [
      'More confidence, spark, or desire for connection',
      'Energy and motivation peaking (or feeling more stable)',
      'Feeling more “up for it” physically and mentally',
    ],
    lookLikeDuration: 'Helpful to remember: this phase often lasts around 2–4 days.',
    doIntro:
      'If you have more capacity, you can use it kindly. This is a good window to do the things that feel harder later.',
    doCards: {
      permission: 'Enjoy the lift, without overbooking yourself.',
      plans: 'Great for socials, presentations, and “bigger” plans.',
      work: 'Strong for collaboration, decisions, and momentum.',
      body: 'Fuel well, hydrate, and build in recovery so you don’t crash after.',
    },
    nextPlanTitle: 'Plan gently if you can',
    nextPlanBody:
      'You might notice a dip afterwards. Building in a quieter day or two can make the next phase feel easier.',
    whyTitle: 'Why this happens',
    whyBody: [
      'Around ovulation, oestrogen is often higher and some people feel more energised, social, or confident.',
      'The key thing: your pattern is personal. We’ll learn what “Expressive” looks like for you.',
    ],
  },
  protective: {
    heroBody:
      'This is your Protective window. Many people feel more inward, more sensitive, and benefit from softer pacing. It’s a good time to protect energy and be a little gentler with yourself.',
    lookLikeIntro:
      'These can be common signs in Protective. As you log more, we’ll get a clearer picture of how this phase tends to feel for you.',
    lookLikeBullets: [
      'You may need a bit more sleep or downtime than usual',
      'Social energy can dip, even if you still want connection',
      'Your body may feel more sensitive (digestion, aches, cravings, or low tolerance)',
    ],
    lookLikeDuration: 'Helpful to remember: this phase often lasts around 10–14 days.',
    doIntro: 'This isn’t about “pushing through”. It’s about giving your body what it’s quietly asking for.',
    doCards: {
      permission: 'It’s okay to rest more and protect your energy.',
      plans: 'Keep evenings lighter if you can. Next week often feels easier.',
      work: 'Favour gentle progress and finishing touches.',
      body: 'Hydrate, warm meals, gentle movement, and earlier nights help many people.',
    },
    nextPlanTitle: 'Plan gently if you can',
    nextPlanBody: 'Fatigue and physical sensitivity may rise briefly, then energy tends to rebuild again.',
    whyTitle: 'Why this happens',
    whyBody: [
      'In the luteal phase, progesterone rises. For many people that can increase sleep need, change appetite, and make the body feel a little more sensitive.',
      'The key thing: these shifts are common and temporary. Over time, we’ll learn exactly how they show up for you.',
    ],
  },
};


function getNextPhasePlanningCopy(nextPhaseKey: PhaseKey): { title: string; body: string } {
  switch (nextPhaseKey) {
    case 'rebuilding':
      return {
        title: 'Leave room for a gentle lift',
        body: 'Energy often starts to rebuild soon. Keeping one small, easy win ready can help you ease into it.',
      };
    case 'expressive':
      return {
        title: 'Plan for a little more spark',
        body: 'You may feel more outward soon. If you have something social, collaborative or creative to do, this can be a lovely lead-in window.',
      };
    case 'protective':
      return {
        title: 'Keep a little softness in the diary',
        body: 'A quieter stretch may be coming next. Lighter evenings and a bit of breathing room can make that shift feel easier.',
      };
    case 'reset':
    default:
      return {
        title: 'Keep comfort close',
        body: 'A more inward phase may be approaching. Warmth, simpler plans and a gentler pace can help you land more softly there.',
      };
  }
}

const gentleReminders: Record<PhaseKey, string[]> = {
  reset: [
    'Rest is productive here. Your body is resetting.',
    'This phase is temporary, and it has a purpose.',
    'Keep it simple. Small comforts count.',
    'If you feel more inward, that makes sense in this window.',
  ],
  rebuilding: [
    'This is a good window for gentle momentum.',
    'Energy often rebuilds here, one small step at a time.',
    'If your mind feels clearer, lean into it.',
    'You don’t have to do everything. Just a little more than yesterday.',
  ],
  expressive: [
    'If you feel more social, that can be part of this phase.',
    'Your body often feels more outward here. Use it kindly.',
    'If you have a bit more spark, it’s okay to enjoy it.',
    'This is a strong window for connection and getting things done.',
  ],
  protective: [
    'This shift is part of your rhythm.',
    'Lower energy here is common, and it will pass.',
    'It’s okay to plan differently in this phase.',
    'This phase is temporary, and it has a purpose.',
  ],
};

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickDailyReminder(phase: PhaseKey, dateKey: string): string {
  const list = gentleReminders[phase] ?? gentleReminders.protective;
  // Stable per day (so it won't change on refresh)
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  const idx = list.length ? hash % list.length : 0;
  return list[idx] || 'This shift is part of your rhythm.';
}
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function daysBetween(aISO: string, bISO: string): number {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / ms);
}

function flowTo10(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  // stored values already 0–10
  return Math.max(0, Math.min(10, v));
}

function getSymptom(entry: CheckInEntry, key: SymptomKey): number | null {
  const v = (entry as any)?.values?.[key];
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(10, v)) : null;
}

function detectCycleStarts(sorted: CheckInEntry[]): string[] {
  const starts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const iso = (e as any).dateISO;
    if (!iso) continue;

    if ((e as any).cycleStartOverride) {
      starts.push(iso);
      continue;
    }

    const flow = flowTo10(getSymptom(e, 'flow'));
    if (!flow || flow <= 0) continue;

    const prev = sorted[i - 1];
    const prevFlow = prev ? flowTo10(getSymptom(prev, 'flow')) : 0;
    if (!prevFlow || prevFlow <= 0) starts.push(iso);
  }
  // de-dupe and sort
  return Array.from(new Set(starts)).sort();
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function computeCycleLength(starts: string[]): { avg: number | null; last: number | null } {
  if (starts.length < 2) return { avg: null, last: null };
  const diffs: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const d = daysBetween(starts[i - 1], starts[i]);
    if (d >= 15 && d <= 60) diffs.push(d);
  }
  const last = diffs.length ? diffs[diffs.length - 1] : null;
  const avg = average(diffs);
  return { avg: avg ? Math.round(avg) : null, last };
}

function phaseFromDay(day: number, cycleLen: number, flowToday: number | null) {
  // If bleeding/spotting today, treat as Menstrual (Reset)
  if (flowToday != null && flowToday > 0) {
    return { key: 'reset' as PhaseKey, soft: 'Reset Phase', sci: 'Menstrual phase' };
  }

  // Default 28-ish boundaries, stretched to cycle length
  const ovulationCenter = Math.round(clamp(cycleLen - 14, 10, cycleLen - 10));
  const ovStart = clamp(ovulationCenter - 1, 8, cycleLen - 8);
  const ovEnd = clamp(ovulationCenter + 1, ovStart + 1, cycleLen - 6);

  if (day <= 5) return { key: 'reset' as PhaseKey, soft: 'Reset Phase', sci: 'Menstrual phase' };
  if (day < ovStart) return { key: 'rebuilding' as PhaseKey, soft: 'Rebuilding Phase', sci: 'Follicular phase' };
  if (day <= ovEnd) return { key: 'expressive' as PhaseKey, soft: 'Expressive Phase', sci: 'Ovulatory phase' };
  return { key: 'protective' as PhaseKey, soft: 'Protective Phase', sci: 'Luteal phase' };
}

type PhaseProfile = Partial<Record<SymptomKey, number>>;

const genericProfiles: Record<PhaseKey, PhaseProfile> = {
  reset: { fatigue: 7, cramps: 6, pain: 6, headache: 5, sleep: 4, stress: 5, libido: 2, digestion: 5, bloating: 6 },
  rebuilding: { energy: 6, motivation: 6, sleep: 6, stress: 4, brainFog: 3, digestion: 4, bloating: 3, libido: 4 },
  expressive: { energy: 7, motivation: 7, libido: 7, stress: 3, brainFog: 2, sleep: 6, digestion: 4 },
  protective: { fatigue: 7, sleep: 4, irritability: 6, anxiety: 5, stress: 6, bloating: 6, digestion: 6, breastTenderness: 5, headache: 5, acne: 5 as any },
};

function inferPhaseKeyFromSignals(sorted: CheckInEntry[]): PhaseKey | null {
  // Use last 10 days of available signals
  const recent = sorted.slice(-10);
  if (!recent.length) return null;

  const keys: SymptomKey[] = [
    'energy',
    'motivation',
    'sleep',
    'stress',
    'anxiety',
    'irritability',
    'brainFog',
    'fatigue',
    'libido',
    'digestion',
    'bloating',
    'cramps',
    'headache',
    'breastTenderness',
    'nightSweats',
    'hotFlushes',
  ];

  const means: Partial<Record<SymptomKey, number>> = {};
  for (const k of keys) {
    const vals = recent.map((e) => getSymptom(e, k)).filter((v): v is number => v != null);
    const a = average(vals);
    if (a != null) means[k] = a;
  }
  const available = Object.keys(means).length;
  if (available < 3) return null;

  const score = (phase: PhaseKey) => {
    const profile = genericProfiles[phase];
    let s = 0;
    let w = 0;
    for (const k of Object.keys(profile) as SymptomKey[]) {
      const target = profile[k];
      const v = means[k];
      if (target == null || v == null) continue;
      // similarity: closer is better
      const diff = Math.abs(v - target);
      s += (10 - diff);
      w += 10;
    }
    return w ? s / w : -1;
  };

  const candidates: PhaseKey[] = ['reset', 'rebuilding', 'expressive', 'protective'];
  let best: PhaseKey = 'protective';
  let bestScore = -1;
  for (const p of candidates) {
    const sc = score(p);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  return best;
}

function softPhaseMeta(key: PhaseKey) {
  switch (key) {
    case 'reset':
      return { soft: 'Reset Phase', sci: 'Menstrual phase' };
    case 'rebuilding':
      return { soft: 'Rebuilding Phase', sci: 'Follicular phase' };
    case 'expressive':
      return { soft: 'Expressive Phase', sci: 'Ovulatory phase' };
    case 'protective':
    default:
      return { soft: 'Protective Phase', sci: 'Luteal phase' };
  }
}

function formatSourceLine(source: any): string {
  if (source === 'override') return 'Based on your cycle start.';
  if (source === 'bleed') return 'Based on your logged bleeding.';
  return 'Based on your recent check-ins.';
}



type RhythmMetricOption = {
  id: string;
  label: string;
  isCustom?: boolean;
  symptomKey?: SymptomKey;
  customId?: string;
};

type CycleStripRow = {
  label: string;
  cycleStartISO: string;
  cycleLength: number;
  activeDays: number[];
  firstActiveDay: number | null;
  durationDays: number;
  isCurrentCycle?: boolean;
};

type CycleStripPhaseSegment = {
  key: PhaseKey;
  label: string;
  start: number;
  end: number;
};

function getRhythmMetricOptions(userData: UserData | undefined): RhythmMetricOption[] {
  const ud = (userData ?? ({} as any)) as UserData;
  const enabledModules = Array.isArray(ud.enabledModules) ? ud.enabledModules : [];
  const excludedTimingMetrics = new Set<SymptomKey>(['sleep', 'energy', 'focus', 'libido', 'appetite', 'stress']);
  const builtIns: RhythmMetricOption[] = enabledModules
    .filter((key): key is SymptomKey => typeof key === 'string')
    .filter((key) => !excludedTimingMetrics.has(key))
    .map((key) => ({
      id: key,
      label: (SYMPTOM_META as any)?.[key]?.label ?? key,
      symptomKey: key,
    }));

  const customs: RhythmMetricOption[] = Array.isArray(ud.customSymptoms)
    ? ud.customSymptoms
        .filter((item: any) => item && item.enabled && typeof item.id === 'string' && typeof item.label === 'string')
        .map((item: any) => ({
          id: `custom:${item.id}`,
          label: item.label,
          isCustom: true,
          customId: item.id,
        }))
    : [];

  const seen = new Set<string>();
  return [...builtIns, ...customs].filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function getEntryMetricValue(entry: CheckInEntry, option: RhythmMetricOption): number | null {
  if (option.isCustom) {
    const raw = option.customId ? (entry.customValues ?? {})[option.customId] : null;
    return typeof raw === 'number' && isFinite(raw) ? Math.max(0, Math.min(10, raw)) : null;
  }
  if (!option.symptomKey) return null;
  return getSymptom(entry, option.symptomKey);
}

function buildCycleStripRows(sorted: CheckInEntry[], option: RhythmMetricOption, maxCycles = 4): { rows: CycleStripRow[]; displayDays: number } {
  const starts = detectCycleStarts(sorted);
  const rows: CycleStripRow[] = [];
  const todayISO = isoToday();

  const buildRow = (label: string, cycleStartISO: string, cycleEndExclusiveISO: string, cycleLength: number, isCurrentCycle = false) => {
    const cycleEntries = sorted.filter((entry) => {
      const iso = (entry as any).dateISO;
      return typeof iso === 'string' && iso >= cycleStartISO && iso < cycleEndExclusiveISO;
    });
    const activeDays = cycleEntries
      .map((entry) => {
        const value = getEntryMetricValue(entry, option);
        if (value == null || value <= 0) return null;
        return daysBetween(cycleStartISO, (entry as any).dateISO) + 1;
      })
      .filter((day): day is number => typeof day === 'number' && day >= 1 && day <= cycleLength);
    rows.push({
      label,
      cycleStartISO,
      cycleLength,
      activeDays,
      firstActiveDay: activeDays.length ? Math.min(...activeDays) : null,
      durationDays: activeDays.length,
      isCurrentCycle,
    });
  };

  if (starts.length >= 2) {
    for (let i = Math.max(0, starts.length - maxCycles - 1); i < starts.length - 1; i++) {
      const cycleStartISO = starts[i];
      const nextStartISO = starts[i + 1];
      const cycleLength = Math.max(1, daysBetween(cycleStartISO, nextStartISO));
      buildRow(`Cycle ${i + 1}`, cycleStartISO, nextStartISO, cycleLength);
    }
  }

  if (starts.length >= 1) {
    const currentStartISO = starts[starts.length - 1];
    const currentLength = Math.max(1, daysBetween(currentStartISO, todayISO) + 1);
    const tomorrow = new Date(todayISO + 'T00:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    buildRow('Current cycle', currentStartISO, tomorrow.toISOString().slice(0, 10), currentLength, true);
  } else if (sorted.length) {
    const firstISO = (sorted[0] as any)?.dateISO;
    if (typeof firstISO === 'string') {
      const currentLength = Math.max(1, daysBetween(firstISO, todayISO) + 1);
      const tomorrow = new Date(todayISO + 'T00:00:00');
      tomorrow.setDate(tomorrow.getDate() + 1);
      buildRow('Cycle 1', firstISO, tomorrow.toISOString().slice(0, 10), currentLength, true);
    }
  }

  const recentRows = rows.slice(-maxCycles).reverse();
  const avgLen = recentRows.length
    ? Math.round(recentRows.reduce((sum, row) => sum + row.cycleLength, 0) / recentRows.length)
    : 28;
  return { rows: recentRows, displayDays: Math.max(20, Math.min(35, avgLen || 28)) };
}

function getCycleStripPhaseSegments(displayDays: number): CycleStripPhaseSegment[] {
  const segments: CycleStripPhaseSegment[] = [];
  let currentKey: PhaseKey | null = null;
  let start = 1;
  for (let day = 1; day <= displayDays; day++) {
    const key = phaseFromDay(day, displayDays, null).key;
    if (currentKey == null) {
      currentKey = key;
      start = day;
      continue;
    }
    if (key !== currentKey) {
      segments.push({
        key: currentKey,
        label: currentKey === 'reset' ? 'Reset' : currentKey === 'rebuilding' ? 'Rebuilding' : currentKey === 'expressive' ? 'Expressive' : 'Protective',
        start,
        end: day - 1,
      });
      currentKey = key;
      start = day;
    }
  }
  if (currentKey != null) {
    segments.push({
      key: currentKey,
      label: currentKey === 'reset' ? 'Reset' : currentKey === 'rebuilding' ? 'Rebuilding' : currentKey === 'expressive' ? 'Expressive' : 'Protective',
      start,
      end: displayDays,
    });
  }
  return segments;
}

function phaseOneLiner(key: PhaseKey, goal: UserGoal | null): string {
  const peri = goal === 'perimenopause';
  switch (key) {
    case 'reset':
      return peri
        ? 'Lower energy and more body sensitivity is common right now.'
        : 'Lower energy and more body sensitivity is common.';
    case 'rebuilding':
      return peri
        ? 'Energy often starts to lift and motivation comes back in small waves.'
        : 'Energy often starts to lift and momentum returns.';
    case 'expressive':
      return peri
        ? 'You may feel more outward, social, and mentally sharp.'
        : 'You may feel more outward and energised.';
    case 'protective':
    default:
      return peri
        ? 'Sleep need and sensitivity can rise, and emotions may feel closer to the surface.'
        : 'Sleep need and sensitivity can rise.';
  }
}

function confidenceOneLiner(conf: any, days: number): string {
  if (days < 5) return 'Early days. This will get clearer as you log.';
  if (conf === 'Learning') return 'Still learning your baseline. Keep logging for a sharper signal.';
  if (conf === 'Emerging') return 'Getting clearer. Patterns will become more personal over time.';
  return 'Confidence is stronger now. We’ll keep refining as you log.';
}


export function Rhythm({ userData }: { userData?: UserData }) {
  const { entries: storeEntries } = useEntries();
  const { history: experimentHistory } = useExperimentHistory();
  // Back-compat: some older wiring passed entries via userData. Prefer store entries.
  const entries: CheckInEntry[] = (Array.isArray((userData as any)?.entries) ? ((userData as any).entries as any[]) : storeEntries) as any;
  const phaseHistory = useMemo(() => getPhaseHistory(), [entries]);
  const [timingCardOpen, setTimingCardOpen] = useState(false);

  const daysLogged = useMemo(() => {
    try {
      const sorted = sortByDateAsc(entries);
      return new Set(sorted.map((e: any) => (e as any)?.dateISO).filter((d: any) => typeof d === 'string' && d.length === 10)).size;
    } catch {
      return 0;
    }
  }, [entries]);

  const computed = useMemo(() => {
    const sorted = sortByDateAsc(entries);
    const todayISO = isoToday();

    const ud = (userData ?? ({} as any)) as UserData;
    const rm = getRhythmModel(sorted, ud, todayISO);

    const phaseKey: PhaseKey = (rm.phaseKey ?? 'protective') as PhaseKey;
    const meta = softPhaseMeta(phaseKey);
    const sci = meta.sci;
    const soft = meta.soft;

    const phaseState = getRhythmPhaseState();
    const starts = rm.starts;
    const cycleLen = rm.cycleLen;
    const dayInCycle = rm.dayInCycle;
    const confidence: ConfidenceLevel = rm.confidence as any;

    const source = rm.source;
    const reasons = rm.reasons ?? [];

    const cycleStats = computeCycleStats(sorted);
    const timing = getRhythmTimingModel(sorted as any, ud);

    const daysToNext = timing.daysRemaining;
    const nextPhaseKey = (() => {
      if (phaseKey === 'reset') return 'rebuilding' as PhaseKey;
      if (phaseKey === 'rebuilding') return 'expressive' as PhaseKey;
      if (phaseKey === 'expressive') return 'protective' as PhaseKey;
      return 'reset' as PhaseKey;
    })();

    const nextPhase = (() => {
      if (phaseKey === 'reset') return 'Rebuilding Phase';
      if (phaseKey === 'rebuilding') return 'Expressive Phase';
      if (phaseKey === 'expressive') return 'Protective Phase';
      return 'Reset Phase';
    })();

    const nextSci = softPhaseMeta(nextPhaseKey).sci;

    return {
      sorted,
      todayISO,
      starts,
      cycleLen,
      avgCycleLen: cycleStats.avgLength,
      lastCycleLen: cycleStats.lastLength,
      dayInCycle,
      phaseKey,
      sci,
      soft,
      confidence,
      source,
      phaseState,
      reasons,
      timing,
      daysToNext,
      nextPhaseKey,
      nextSci,
      nextPhase,
    };
  }, [entries, daysLogged, userData]);

  
  const experimentLearnings = useMemo(() => {
    try {
      return getExperimentLearnings(computed.sorted as any, (experimentHistory as any) || []);
    } catch {
      return [];
    }
  }, [computed.sorted, experimentHistory]);

  const whatsComing = useMemo(() => {
    try {
      return getWhatsComingPredictions({ entries: computed.sorted as any, learnings: experimentLearnings as any });
    } catch {
      return [];
    }
  }, [computed.sorted, experimentLearnings]);

// Pull commonly used values out of the computed bundle.
  const sorted = computed.sorted;
  const avgCycleLen = computed.avgCycleLen;
  const lastCycleLen = computed.lastCycleLen;

  const cycleStats = useMemo(() => computeCycleStats(sorted), [sorted]);

  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const rhythmMetricOptions = useMemo(() => getRhythmMetricOptions(userData), [userData]);
  const [selectedTimingMetricId, setSelectedTimingMetricId] = useState<string>('');
  const selectedTimingMetric = useMemo(() => {
    if (!rhythmMetricOptions.length) return null;
    return rhythmMetricOptions.find((option) => option.id === selectedTimingMetricId) ?? rhythmMetricOptions[0];
  }, [rhythmMetricOptions, selectedTimingMetricId]);
  React.useEffect(() => {
    if (!rhythmMetricOptions.length) return;
    if (!selectedTimingMetricId || !rhythmMetricOptions.some((option) => option.id === selectedTimingMetricId)) {
      setSelectedTimingMetricId(rhythmMetricOptions[0].id);
    }
  }, [rhythmMetricOptions, selectedTimingMetricId]);
  const timingChart = useMemo(() => {
    if (!selectedTimingMetric) return { rows: [], displayDays: 28 };
    return buildCycleStripRows(sorted, selectedTimingMetric, 4);
  }, [sorted, selectedTimingMetric]);
  const timingSummary = useMemo(() => {
    if (!selectedTimingMetric) return null;
    const activeRows = timingChart.rows.filter((row) => row.firstActiveDay != null && row.durationDays > 0);
    if (activeRows.length < 1) return null;

    const completedRows = activeRows.filter((row) => !row.isCurrentCycle);
    const summaryRows = completedRows.length >= 1 ? completedRows : activeRows;
    const avgStart = Math.round(summaryRows.reduce((sum, row) => sum + (row.firstActiveDay ?? 0), 0) / summaryRows.length);
    const avgDuration = Math.max(1, Math.round(summaryRows.reduce((sum, row) => sum + row.durationDays, 0) / summaryRows.length));
    const phaseLabel = phaseFromDay(avgStart, timingChart.displayDays, null).soft.replace(' Phase', '');
    const approxDaysBeforeBleed = Math.max(0, timingChart.displayDays - avgStart + 1);
    const lowerLabel = selectedTimingMetric.label.toLowerCase();

    if (completedRows.length === 0) {
      const currentRow = activeRows.find((row) => row.isCurrentCycle) ?? activeRows[0];
      const currentStart = currentRow.firstActiveDay ?? avgStart;
      const currentPhaseLabel = phaseFromDay(currentStart, timingChart.displayDays, null).soft.replace(' Phase', '').toLowerCase();
      const currentDaysBeforeBleed = Math.max(0, timingChart.displayDays - currentStart + 1);
      if (currentDaysBeforeBleed >= 2 && currentDaysBeforeBleed <= 9) {
        return `Here’s what ${lowerLabel} looks like so far this cycle: it has shown up in your ${currentPhaseLabel} window, around ${currentDaysBeforeBleed} day${currentDaysBeforeBleed === 1 ? '' : 's'} before bleeding. As you log more cycles, your usual timing will get clearer.`;
      }
      return `Here’s what ${lowerLabel} looks like so far this cycle: it has shown up in your ${currentPhaseLabel} window, around day ${currentStart}. As you log more cycles, your usual timing will get clearer.`;
    }

    if (completedRows.length === 1) {
      if (approxDaysBeforeBleed >= 2 && approxDaysBeforeBleed <= 9) {
        return `Here’s what ${lowerLabel} looks like so far: it has shown up in your ${phaseLabel.toLowerCase()} window, around ${approxDaysBeforeBleed} day${approxDaysBeforeBleed === 1 ? '' : 's'} before bleeding. As you log more cycles, your usual timing will get clearer.`;
      }
      return `Here’s what ${lowerLabel} looks like so far: it has shown up in your ${phaseLabel.toLowerCase()} window, around day ${avgStart}. As you log more cycles, your usual timing will get clearer.`;
    }

    if (completedRows.length === 2) {
      if (approxDaysBeforeBleed >= 2 && approxDaysBeforeBleed <= 9) {
        return `${selectedTimingMetric.label} may be starting to cluster in your ${phaseLabel.toLowerCase()} window, around ${approxDaysBeforeBleed} day${approxDaysBeforeBleed === 1 ? '' : 's'} before bleeding, and lasts about ${avgDuration} day${avgDuration === 1 ? '' : 's'}.`;
      }
      return `${selectedTimingMetric.label} may be starting to cluster in your ${phaseLabel.toLowerCase()} window, around day ${avgStart}, and lasts about ${avgDuration} day${avgDuration === 1 ? '' : 's'}.`;
    }

    if (approxDaysBeforeBleed >= 2 && approxDaysBeforeBleed <= 9) {
      return `${selectedTimingMetric.label} usually shows up in your ${phaseLabel.toLowerCase()} window, around ${approxDaysBeforeBleed} day${approxDaysBeforeBleed === 1 ? '' : 's'} before bleeding, and lasts about ${avgDuration} day${avgDuration === 1 ? '' : 's'}.`;
    }
    return `${selectedTimingMetric.label} usually shows up in your ${phaseLabel.toLowerCase()} window, around day ${avgStart}, and lasts about ${avgDuration} day${avgDuration === 1 ? '' : 's'}.`;
  }, [timingChart.rows, timingChart.displayDays, selectedTimingMetric]);
  const avgCycleText = avgCycleLen ? `${avgCycleLen} days avg` : 'Not enough data yet';
  const cycleTrust = useMemo(() => getCycleTrustModel(sorted as any, ((userData ?? ({} as any)) as UserData), computed.todayISO), [sorted, userData, computed.todayISO]);

  
  // Phase key for reminders (kept simple for v1; can be wired to your phase engine later)
  const phaseKey: PhaseKey = computed.phaseKey;
  const content = phaseContent[phaseKey] ?? phaseContent.protective;
  const nextPhasePlanning = getNextPhasePlanningCopy(computed.nextPhaseKey);
  const softMeta = softPhaseMeta(phaseKey);

  const personalisedLookLikeLine = useMemo(() => {
    try {
      return getRhythmPersonalPhaseSentence(sorted as any, ((userData ?? ({} as any)) as UserData), phaseKey);
    } catch {
      return null;
    }
  }, [sorted, userData, phaseKey]);

  const rhythmStatusNote = useMemo(() => {
    if (userData?.cycleTrackingMode === 'cycle' && !cycleTrust.hasCycleAnchor) return 'Still learning your cycle. Log your first period or mark a cycle start in Calendar → Edit cycle before phase timing appears here.';
    const gapMode = (computed.phaseState as any)?.gapMode as string | undefined;
    if (gapMode === 'stale') return 'Estimated current phase after a longer logging gap. Forward predictions are paused until you add a fresh cycle anchor.';
    if (gapMode === 'catchup') return 'Estimated current phase after a gap in logging. Rhythm has caught up using elapsed time and recent anchors.';
    if (cycleTrust.predictionTrust === 'early') return 'Early estimate based on your latest cycle start. A few more cycles will help the timing settle.';
    if (computed.phaseState?.historyLockLevel !== 'confirmed') return 'This is an estimated phase for now. A few more check-ins will help it settle.';
    return null;
  }, [computed.phaseState, cycleTrust, userData?.cycleTrackingMode]);

  function IconBadge({ icon }: { icon: React.ReactNode }) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.20)] flex items-center justify-center shrink-0">
        <div className="text-[rgb(var(--color-primary))]">{icon}</div>
      </div>
    );
  }

  const phaseIcon = useMemo(() => {
    switch (phaseKey) {
      case 'reset':
        return <Moon className="w-5 h-5" />;
      case 'rebuilding':
        return <Sprout className="w-5 h-5" />;
      case 'expressive':
        return <Sparkles className="w-5 h-5" />;
      case 'protective':
      default:
        return <Shield className="w-5 h-5" />;
    }
  }, [phaseKey]);




  
  return (
    <div className="eb-page">
      <div className="eb-page-inner">
        {/* Header */}
        <div className="eb-page-header">
          <h1 className="eb-page-title">Your Rhythm</h1>
          <p className="eb-page-support">A calm, phase-based story that becomes more personal the more you check in.</p>
        </div>

        {/* Where you are */}
        <RhythmHero
          entries={computed.sorted}
          userData={(userData ?? ({} as any)) as UserData}
          phaseKey={phaseKey}
          phaseTitle={computed.soft}
          phaseDescription={phaseOneLiner(phaseKey, (((userData ?? {}) as any).goal ?? null) as any)}
          confidenceLabel={computed.confidence}
          phaseIcon={phaseIcon}
        />

        {rhythmStatusNote ? (
          <div className="eb-card p-5">
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">{rhythmStatusNote}</p>
          </div>
        ) : null}


        {/* Phase timeline */}
        <div className="eb-card p-5">
          <div className="eb-card-header mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold tracking-tight">Your cycle, at a glance</h3>
            </div>
            <div className="eb-icon-frame">
              <Compass className="w-5 h-5" />
            </div>
          </div>

          {(() => {
            const steps: Array<{ key: PhaseKey; label: string; sci: string }> = [
              { key: 'reset', label: 'Reset', sci: 'Menstrual' },
              { key: 'rebuilding', label: 'Rebuilding', sci: 'Follicular' },
              { key: 'expressive', label: 'Expressive', sci: 'Ovulatory' },
              { key: 'protective', label: 'Protective', sci: 'Luteal' },
            ];

            return (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {steps.map((s) => {
                  const isHere = phaseKey === s.key;
                  const base =
                    "rounded-xl px-3 py-2 text-center border bg-[rgb(var(--color-accent)/0.08)] border-[rgb(var(--color-accent)/0.18)]";
                  const here =
                    "border-[rgb(var(--color-primary-dark)/0.40)] bg-[rgb(var(--color-primary-dark)/0.18)] font-medium text-neutral-900";
                  return (
                    <div
                      key={s.key}
                      className={`${base} ${isHere ? here : ""} flex flex-col items-center justify-center text-center`}
                    >
                      <div className="leading-tight">{s.label}</div>
                      <div className={`text-[11px] leading-tight ${isHere ? "text-neutral-700 font-normal" : "text-neutral-600"}`}>
                        {s.sci}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="mt-3 flex items-start justify-between gap-3">
            {userData?.cycleTrackingMode === 'cycle' ? (
              <button
                type="button"
                onClick={() => setCycleModalOpen(true)}
                className="min-w-0 max-w-[58%] sm:max-w-[62%] rounded-full bg-[rgb(var(--color-accent)/0.12)] border border-[rgb(var(--color-accent)/0.22)] px-2 py-1 text-[10px] sm:px-3 sm:text-sm text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-accent)/0.18)] transition whitespace-nowrap overflow-hidden text-ellipsis"
                title="Cycle length"
              >
                <span className="font-medium">Cycle length</span>
                <span className="mx-1.5 opacity-60">•</span>
                <span className="font-semibold">{avgCycleText}</span>
              </button>
            ) : <div />}
            <div className="text-xs text-neutral-600 flex items-center gap-2 shrink-0">
              <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--color-primary-dark))]" />
              You’re here
            </div>
          </div>
        </div>

        

        <div className="eb-card p-6">
          <div className="eb-card-header mb-4">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1">What this can look like</h3>
            </div>
            <div className="eb-icon-frame"><Eye className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            <p className="text-neutral-700">{content.lookLikeIntro}</p>

            <ul className="space-y-3">
            {content.lookLikeBullets.map((t, i) => {
              const dot =
                i % 3 === 0
                  ? 'bg-[rgb(var(--color-primary))]'
                  : i % 3 === 1
                    ? 'bg-[rgb(var(--color-accent))]'
                    : 'bg-[rgb(var(--color-primary-dark))]';
              return (
                <li key={t} className="grid grid-cols-[14px_1fr] gap-3 items-start">
                  <span className={`mt-2 h-2 w-2 rounded-full ${dot} flex-shrink-0`} />
                  <span className="text-neutral-800 leading-6">{t}</span>
                </li>
              );
            })}
              </ul>

            {personalisedLookLikeLine ? (
              <p className="text-neutral-800 leading-6">{personalisedLookLikeLine}</p>
            ) : null}

            <p className="text-neutral-700">{content.lookLikeDuration}</p>
          </div>
        </div>

        {/* What you can do */}
        <div className="eb-card p-6">
          <div className="eb-card-header mb-4">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 font-semibold tracking-tight">What you can do about it</h3>
            </div>
            <div className="eb-icon-frame"><GraduationCap className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            <p className="text-neutral-700">{content.doIntro}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="eb-inset-callout rounded-xl p-4">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Permission</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">{content.doCards.permission}</div>
            </div>
            <div className="eb-inset-callout rounded-xl p-4">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Plans</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">{content.doCards.plans}</div>
            </div>
            <div className="eb-inset-callout rounded-xl p-4">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Work</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">{content.doCards.work}</div>
            </div>
            <div className="eb-inset-callout rounded-xl p-4">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Body</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">{content.doCards.body}</div>
            </div>
            </div>
          </div>
        </div>

        <PhaseHistoryCard history={phaseHistory} />

        <div className="eb-card p-6">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setTimingCardOpen((open) => !open)}
            aria-expanded={timingCardOpen}
          >
            <div className="eb-card-header">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <ChevronDown className={[
                    'mt-1 h-4 w-4 shrink-0 text-[rgb(var(--color-text-secondary))] transition-transform',
                    timingCardOpen ? 'rotate-180' : ''
                  ].join(' ')} />
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 font-semibold tracking-tight">When this usually shows up</h3>
                    <p className="text-sm text-[rgb(var(--color-text-secondary))]">See where a symptom tends to land in your rhythm across recent cycles.</p>
                    <p className="text-xs text-[rgb(var(--color-text-secondary))] mt-1">Showing your 4 most recent cycles to keep this card readable.</p>
                  </div>
                </div>
              </div>
              <div className="eb-icon-frame"><Leaf className="w-5 h-5" /></div>
            </div>
          </button>

          {timingCardOpen ? (
            selectedTimingMetric && timingChart.rows.length >= 1 ? (
              <div className="mt-6 space-y-4">
                {timingSummary ? (
                  <p className="text-neutral-700">{timingSummary}</p>
                ) : null}

                <div className="space-y-3">
                  {timingChart.rows.map((row) => (
                    <div key={row.cycleStartISO} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="font-medium text-neutral-800">{row.label}</div>
                        {row.durationDays > 0 ? (
                          row.isCurrentCycle ? (
                            <div className="text-[rgb(var(--color-text-secondary))]">Logged on {row.durationDays} day{row.durationDays === 1 ? '' : 's'} so far{row.firstActiveDay ? ` · first on day ${row.firstActiveDay}` : ''}</div>
                          ) : (
                            <div className="text-[rgb(var(--color-text-secondary))]">Starts day {row.firstActiveDay} · {row.durationDays} day{row.durationDays === 1 ? '' : 's'}</div>
                          )
                        ) : (
                          <div className="text-[rgb(var(--color-text-secondary))]">{row.isCurrentCycle ? 'Not logged yet this cycle' : 'No logged days this cycle'}</div>
                        )}
                      </div>
                      <div className="rounded-2xl eb-inset-callout p-3">
                        <div
                          className="grid gap-1.5"
                          style={{ gridTemplateColumns: `repeat(${timingChart.displayDays}, minmax(0, 1fr))` }}
                        >
                          {Array.from({ length: timingChart.displayDays }, (_, index) => {
                            const day = index + 1;
                            const inCycle = day <= row.cycleLength;
                            const isActive = row.activeDays.includes(day);
                            return (
                              <div key={day} className="flex flex-col items-center gap-1">
                                <div
                                  className={[
                                    'h-3 w-full rounded-full transition',
                                    !inCycle
                                      ? 'bg-black/5'
                                      : isActive
                                        ? 'bg-[rgb(var(--color-primary-dark))]'
                                        : phaseFromDay(day, row.cycleLength, null).key === 'reset'
                                          ? 'bg-[rgb(var(--color-accent)/0.42)]'
                                          : phaseFromDay(day, row.cycleLength, null).key === 'rebuilding'
                                            ? 'bg-[rgb(var(--color-accent)/0.30)]'
                                            : phaseFromDay(day, row.cycleLength, null).key === 'expressive'
                                              ? 'bg-[rgb(var(--color-primary)/0.28)]'
                                              : 'bg-[rgb(var(--color-primary-dark)/0.34)]',
                                  ].join(' ')}
                                  title={`Day ${day}${isActive ? ': active' : ''}`}
                                />
                                {((day <= 3) || (day === timingChart.displayDays) || (day % 4 === 0)) ? (
                                  <span className="text-[10px] text-[rgb(var(--color-text-secondary))]">{day}</span>
                                ) : (
                                  <span className="text-[10px] opacity-0 select-none">0</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 grid gap-2 text-[11px] text-[rgb(var(--color-text-secondary))] sm:text-xs" style={{ gridTemplateColumns: `repeat(${timingChart.displayDays}, minmax(0, 1fr))` }}>
                          {getCycleStripPhaseSegments(row.cycleLength).map((segment) => (
                            <div
                              key={`${row.cycleStartISO}-${segment.key}`}
                              className="text-center font-medium"
                              style={{ gridColumn: `${segment.start} / ${segment.end + 1}` }}
                            >
                              {segment.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-stretch sm:justify-end">
                  <label className="w-full sm:w-auto">
                    <span className="sr-only">Choose symptom</span>
                    <select
                      value={selectedTimingMetric?.id ?? ''}
                      onChange={(event) => setSelectedTimingMetricId(event.target.value)}
                      className="w-full sm:min-w-[260px] rounded-full border border-[rgb(var(--color-accent)/0.28)] bg-white px-4 py-3 text-sm text-[rgb(var(--color-text))] shadow-sm outline-none transition focus:border-[rgb(var(--color-primary-dark)/0.42)] focus:ring-2 focus:ring-[rgb(var(--color-primary-dark)/0.12)]"
                    >
                      {rhythmMetricOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="text-neutral-700">Here’s what this looks like so far. As you log more cycles, your usual timing will get clearer.</p>
                <div className="flex justify-stretch sm:justify-end">
                  <label className="w-full sm:w-auto">
                    <span className="sr-only">Choose symptom</span>
                    <select
                      value={selectedTimingMetric?.id ?? ''}
                      onChange={(event) => setSelectedTimingMetricId(event.target.value)}
                      className="w-full sm:min-w-[260px] rounded-full border border-[rgb(var(--color-accent)/0.28)] bg-white px-4 py-3 text-sm text-[rgb(var(--color-text))] shadow-sm outline-none transition focus:border-[rgb(var(--color-primary-dark)/0.42)] focus:ring-2 focus:ring-[rgb(var(--color-primary-dark)/0.12)]"
                    >
                      {rhythmMetricOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )
          ) : null}
        </div>

        {/* What usually comes next */}
        <div className="eb-card p-6">
          <div className="eb-card-header mb-4">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 font-semibold tracking-tight">What usually comes next</h3>
            </div>
            <div className="eb-icon-frame"><Compass className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            <p className="text-neutral-700">
              If this rhythm follows your usual pattern, you’ll likely shift into your <span className="font-medium opacity-90">{computed.nextPhase}</span> ({computed.nextSci}) in around <span className="font-medium opacity-90">{computed.daysToNext ?? 5} days</span>.
            </p>

            <div className="eb-inset-callout rounded-xl p-4">
              <div className="text-base font-medium text-neutral-800">{nextPhasePlanning.title}</div>
              <div className="mt-1 text-base text-neutral-800 font-normal">{nextPhasePlanning.body}</div>
            </div>
          </div>
        </div>

        {/* Why this happens */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
          <details className="eb-disclosure eb-disclosure--plain">
            <summary className="font-medium text-neutral-900 px-0 py-0">
              <span className="flex items-start justify-between gap-3 w-full">
                <span className="inline-flex items-center gap-3 min-w-0 flex-1">
                  <ChevronDown className="w-4 h-4 text-[rgb(var(--color-text-secondary))] shrink-0" />
                  <span>{content.whyTitle}</span>
                </span>
                <span className="eb-icon-frame self-start"><Info className="w-5 h-5" /></span>
              </span>
            </summary>
            <div className="mt-3 space-y-4 text-[rgb(var(--color-text-secondary))]">
              {content.whyBody.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </details>
        </div>

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
                    {userData?.cycleTrackingMode === 'cycle'
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="eb-inset rounded-xl p-4">
                  <div className="text-xs text-[rgba(0,0,0,0.60)]">Average</div>
                  <div className="text-lg font-semibold">{avgCycleLen ? `${avgCycleLen} days` : '—'}</div>
                </div>
                <div className="eb-inset rounded-xl p-4">
                  <div className="text-xs text-[rgba(0,0,0,0.60)]">Last cycle</div>
                  <div className="text-lg font-semibold">{lastCycleLen ? `${lastCycleLen} days` : '—'}</div>
                </div>
                <div className="eb-inset rounded-xl p-4">
                  <div className="text-xs text-[rgba(0,0,0,0.60)]">Prediction</div>
                  <div className="text-lg font-semibold">{cycleStats?.predictedNextStartISO ? 'Next start' : '—'}</div>
                  {cycleStats?.predictedNextStartISO ? (
                    <div className="mt-1 text-sm text-[rgba(0,0,0,0.65)]">{cycleStats.predictedNextStartISO}</div>
                  ) : null}
                </div>
              </div>

              {cycleStats?.predictionNote ? (
                <div className="mt-4 text-sm text-[rgba(0,0,0,0.70)]">{cycleStats.predictionNote}</div>
              ) : null}
            </div>
          </div>
        )}

    </div>
      </div>
  );

}
