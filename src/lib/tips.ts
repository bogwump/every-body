import type { UserGoal } from '../types';

export type Tip = {
  title: string;
  body: string;
  /** Optional tiny nudge action label the UI can show. */
  cta?: { label: string; screen: string };
};

type Phase = 'Menstrual' | 'Follicular' | 'Ovulation' | 'Luteal' | null;

function hashStr(s: string): number {
  // Simple deterministic hash (stable across sessions). Not cryptographic.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: string, offset = 0): T {
  if (!arr.length) throw new Error('pick: empty array');
  const idx = (hashStr(seed) + offset) % arr.length;
  return arr[idx];
}

const GENERAL: Tip[] = [
  {
    title: 'Make it easy to log',
    body: 'Pick 3–6 symptoms you actually care about. More is not better, consistency is.',
    cta: { label: 'Customise symptoms', screen: 'profile' },
  },
  {
    title: 'Back up once, relax after',
    body: 'Export a backup file now and then (Profile → Privacy & security). If you ever switch phone or browser, you can import it in seconds.',
    cta: { label: 'Back up / restore', screen: 'profile' },
  },
  {
    title: 'Use yesterday as your baseline',
    body: 'If you are unsure, compare today to yesterday. The daily check-in shows yesterday’s number to make quick comparisons easier.',
  },
  {
    title: 'Tiny reset, big impact',
    body: 'Try 2 minutes: drink water, drop your shoulders, 4 slow breaths. Then carry on.',
  },
  {
    title: 'Patterns need a run-up',
    body: 'After 3 days you will see early nudges. After 7 days, trends start to get clearer.',
    cta: { label: 'Do today’s check-in', screen: 'check-in' },
  },
];

const PERI: Tip[] = [
  {
    title: 'Track sleep and hot moments',
    body: 'If you are in perimenopause mode, sleep plus hot flushes/night sweats are often the most telling pair.',
    cta: { label: 'Customise symptoms', screen: 'profile' },
  },
  {
    title: 'Energy is not willpower',
    body: 'If energy dips, make the day lighter on purpose. That is data, not failure.',
  },
];

const POST_CONTRACEPTION: Tip[] = [
  {
    title: 'Keep it simple for a month',
    body: 'If you’ve recently changed contraception, aim for consistent logging rather than perfect interpretation.',
  },
  {
    title: 'Add one extra symptom at a time',
    body: 'When you turn on new symptoms, do it one or two at a time so your insights stay readable.',
    cta: { label: 'Customise symptoms', screen: 'profile' },
  },
];

const BY_PHASE: Record<Exclude<Phase, null>, Tip[]> = {
  Menstrual: [
    { title: 'Go gentle', body: 'Warmth, hydration, and a slightly earlier night can help more than pushing through.' },
    { title: 'Pain baseline', body: 'If cramps/headaches are up, note it. Your future self will thank you when patterns appear.' },
  ],
  Follicular: [
    { title: 'Use the lift', body: 'If your energy is rising, it can be a good time to plan, batch-cook, or start something new.' },
    { title: 'Try a small strength session', body: 'Even 10 minutes counts. Keep it easy and repeatable.' },
  ],
  Ovulation: [
    { title: 'Social window', body: 'Many people feel more “up” here. If you do, schedule the things that need confidence.' },
    { title: 'Hydrate and snack', body: 'If headaches show up mid-cycle, hydration plus a snack can sometimes help.' },
  ],
  Luteal: [
    { title: 'Reduce friction', body: 'If symptoms ramp up here, simplify: earlier nights, fewer plans, and kinder food choices.' },
    { title: 'Name the need', body: 'If irritability is high, it often means you need rest, food, or less input. That’s useful data.' },
  ],
};

export function getDailyTip(args: {
  dateISO: string;
  phase: Phase;
  goal: UserGoal | null;
  daysTracked: number;
  offset?: number;
}): Tip {
  const { dateISO, phase, goal, daysTracked, offset = 0 } = args;

  const pool: Tip[] = [];
  pool.push(...GENERAL);

  if (goal === 'perimenopause') pool.push(...PERI);
  if (goal === 'post-contraception') pool.push(...POST_CONTRACEPTION);

  if (phase && BY_PHASE[phase]) pool.push(...BY_PHASE[phase]);

  // Early-user nudges: keep it a bit more motivating in the first week.
  if (daysTracked < 7) {
    // Make sure new users see the backup/restore idea early.
    if (daysTracked <= 2) {
      return {
        title: 'Save your progress',
        body: 'Before you get too far in, export a backup (Profile → Privacy & security). It is a quick safety net if you switch devices.',
        cta: { label: 'Back up / restore', screen: 'profile' },
      };
    }
    pool.unshift({
      title: 'One small win',
      body: 'Log today even if it’s messy. The point is a habit, not a perfect score.',
      cta: { label: 'Do today’s check-in', screen: 'check-in' },
    });
  }

  return pick(pool, `${dateISO}|${goal ?? 'none'}|${phase ?? 'nophase'}|${daysTracked}`, offset);
}
