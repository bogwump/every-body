import React, { useMemo } from 'react';
import { Moon, Sprout, Sparkles, Shield, Eye, Leaf, Compass, Info } from 'lucide-react';
import { useEntries, useUser } from '../lib/appStore';
import type { CheckInEntry, SymptomKey } from '../types';
import type { UserData } from '../types';

type ConfidenceLevel = 'Learning' | 'Emerging' | 'Established';

function confidenceLabel(daysLogged: number): ConfidenceLevel {
  if (daysLogged >= 60) return 'Established';
  if (daysLogged >= 21) return 'Emerging';
  return 'Learning';
}

function confidenceCopy(level: ConfidenceLevel): string {
  switch (level) {
    case 'Established':
      return 'We have enough history now to recognise your rhythm more reliably.';
    case 'Emerging':
      return 'Early patterns are starting to show. This will get clearer with a little more time.';
    default:
      return 'It’s early days. For now, we’ll keep things gentle and learn as you log.';
  }
}

type PhaseKey = 'reset' | 'rebuilding' | 'expressive' | 'protective';

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

function estimateDaysToNext(key: PhaseKey, dayInCycle: number | null, cycleLen: number | null): number | null {
  if (dayInCycle != null && cycleLen != null) {
    const flowPhase = phaseFromDay(dayInCycle, cycleLen, null);
    const bounds = () => {
      const ovulationCenter = Math.round(clamp(cycleLen - 14, 10, cycleLen - 10));
      const ovStart = clamp(ovulationCenter - 1, 8, cycleLen - 8);
      const ovEnd = clamp(ovulationCenter + 1, ovStart + 1, cycleLen - 6);
      if (key === 'reset') return 6; // to rebuilding start
      if (key === 'rebuilding') return ovStart;
      if (key === 'expressive') return ovEnd + 1;
      return cycleLen + 1; // next cycle start (approx)
    };
    const nextStart = bounds();
    const remaining = nextStart - dayInCycle;
    return remaining > 0 ? remaining : null;
  }
  // signal-based fallback
  const defaults: Record<PhaseKey, number> = { reset: 3, rebuilding: 5, expressive: 3, protective: 5 };
  return defaults[key] ?? 5;
}


export function Rhythm({ userData }: { userData?: UserData }) {
  const { entries: storeEntries } = useEntries();
  // Back-compat: some older wiring passed entries via userData. Prefer store entries.
  const entries: CheckInEntry[] = (Array.isArray((userData as any)?.entries) ? ((userData as any).entries as any[]) : storeEntries) as any;

  const daysLogged = useMemo(() => {
    try {
      if (!Array.isArray(entries) || entries.length === 0) return 0;
      const dates = new Set<string>();
      for (const e of entries) {
        const d = (e as any)?.dateISO || (e as any)?.date;
        if (typeof d === 'string' && d.length >= 10) dates.add(d.slice(0, 10));
      }
      return dates.size;
    } catch {
      return 0;
    }
  }, [entries]);
const level = useMemo(() => confidenceLabel(daysLogged), [daysLogged]);

  const computed = useMemo(() => {
    const sorted = [...entries].filter((e) => (e as any)?.dateISO).sort((a, b) => ((a as any).dateISO).localeCompare((b as any).dateISO));
    const todayISO = new Date().toISOString().slice(0, 10);
    const flowToday = (() => {
      const t = sorted.find((e) => (e as any).dateISO === todayISO);
      return t ? flowTo10(getSymptom(t, 'flow')) : null;
    })();

    const starts = detectCycleStarts(sorted);
    const { avg, last } = computeCycleLength(starts);
    const cycleLen = avg ?? 28;

    const lastStart = starts.length ? starts[starts.length - 1] : null;
    const dayInCycle = lastStart ? daysBetween(lastStart, todayISO) + 1 : null;

    let phaseKey: PhaseKey | null = null;
    let sci = 'Luteal phase';
    let soft = 'Protective Phase';

    if (dayInCycle != null && dayInCycle > 0 && dayInCycle <= 60) {
      const p = phaseFromDay(dayInCycle, cycleLen, flowToday);
      phaseKey = p.key;
      sci = p.sci;
      soft = p.soft;
    } else {
      const inferred = inferPhaseKeyFromSignals(sorted);
      if (inferred) {
        phaseKey = inferred;
        const meta = softPhaseMeta(inferred);
        sci = meta.sci;
        soft = meta.soft;
      } else {
        phaseKey = 'protective';
        const meta = softPhaseMeta('protective');
        sci = meta.sci;
        soft = meta.soft;
      }
    }

    // Confidence: anchored cycles -> higher, otherwise learning based on days logged
    let confidence: ConfidenceLevel = confidenceLabel(daysLogged);
    if (starts.length >= 2 && daysLogged >= 21) confidence = 'Established';
    else if (starts.length >= 1 && daysLogged >= 14) confidence = 'Emerging';

    const daysToNext = estimateDaysToNext(phaseKey, dayInCycle, cycleLen);
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
      avgCycleLen: avg,
      lastCycleLen: last,
      dayInCycle,
      phaseKey,
      sci,
      soft,
      confidence,
      daysToNext,
      nextPhaseKey,
      nextSci,
      nextPhase,
    };
  }, [entries, daysLogged]);
  
  // Phase key for reminders (kept simple for v1; can be wired to your phase engine later)
  const phaseKey: PhaseKey = computed.phaseKey;
  const softMeta = softPhaseMeta(phaseKey);
  const gentleReminder = useMemo(() => pickDailyReminder(phaseKey, localISODate(new Date())), [phaseKey]);

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
    <div className="eb-container space-y-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Your Rhythm</h1>
          <p>A calm, phase-based story that becomes more personal the more you check in.</p>
        </div>

        {/* Where you are */}
        <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-8 sm:p-10 overflow-hidden shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <div className="text-white">{phaseIcon}</div>
                </div>
                <h3 className="mb-1 eb-hero-title eb-hero-on-dark text-white">{computed.soft}</h3>
              </div>
              <div className="eb-hero-subtitle eb-hero-on-dark-muted text-white/90">{computed.sci}</div>
              <div className="text-xs text-white/80 mt-1">Based on your recent check-ins.</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/80">Confidence</div>
              <div className="text-sm font-medium text-white/90">{computed.confidence}</div>
            </div>
          </div>

          <p className="eb-hero-on-dark-muted text-white/90">
            Based on your recent check-ins, you may be in a slightly more inward phase. Energy can feel less steady,
            and your body may ask for a bit more care.
          </p>

          <div className="eb-inset rounded-xl p-4 bg-[rgb(var(--color-accent)/0.10)] border border-[rgb(var(--color-accent)/0.18)]">
            <div className="text-base font-medium text-neutral-800">Gentle reminder</div>
            <div className="text-base text-neutral-800 font-normal">{gentleReminder}</div>
          </div>
        </div>

        {/* Phase timeline */}
        <div className="eb-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <IconBadge icon={<Compass className="w-5 h-5" />} />
            <h3 className="font-semibold tracking-tight">Your cycle, at a glance</h3>
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
                    <div key={s.key} className={`${base} ${isHere ? here : ""}`}>
                      {s.label}
                      <br />
                      <span className={`text-[11px] ${isHere ? "text-neutral-700 font-normal" : "text-neutral-600"}`}>
                        {s.sci}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="mt-3 flex justify-end">
            <div className="text-xs text-neutral-600 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--color-primary-dark))]" />
              You’re here
            </div>
          </div>
        </div>

        

        <div className="eb-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Eye className="w-5 h-5" />} />
            <h3 className="mb-1">What this can look like</h3>
          </div>
          <p className="text-neutral-700">
            These are common signs in this phase. Over time, we’ll swap more of these for patterns that are uniquely yours.
          </p>

          <ul className="space-y-3">
  <li className="grid grid-cols-[14px_1fr] gap-3 items-start">
    <span className="mt-2 h-2 w-2 rounded-full bg-[rgb(var(--color-primary))] flex-shrink-0" />
    <span className="text-neutral-800 leading-6">You may need a bit more sleep or downtime than usual</span>
  </li>
  <li className="grid grid-cols-[14px_1fr] gap-3 items-start">
    <span className="mt-2 h-2 w-2 rounded-full bg-[rgb(var(--color-accent))] flex-shrink-0" />
    <span className="text-neutral-800 leading-6">Social energy can dip, even if you still want connection</span>
  </li>
  <li className="grid grid-cols-[14px_1fr] gap-3 items-start">
    <span className="mt-2 h-2 w-2 rounded-full bg-[rgb(var(--color-primary-dark))] flex-shrink-0" />
    <span className="text-neutral-800 leading-6">Your body may feel more sensitive (digestion, aches, cravings, or low tolerance)</span>
  </li>
</ul>

          <p className="text-neutral-700">
            <span className="font-medium opacity-90">Helpful to remember:</span> this usually lasts around <span className="font-medium opacity-90">4–7 days</span> before things shift.
          </p>
        </div>

        {/* What you can do */}
        <div className="eb-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Leaf className="w-5 h-5" />} />
            <h3 className="mb-1 font-semibold tracking-tight">What you can do about it</h3>
          </div>
          <p className="text-neutral-700">
            This isn’t about “pushing through”. It’s about giving your body what it’s quietly asking for.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="eb-inset rounded-xl p-4 !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Permission</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">It’s okay to rest more and protect your energy.</div>
            </div>
            <div className="eb-inset rounded-xl p-4 !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Plans</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">Keep evenings lighter if you can. Next week often feels easier.</div>
            </div>
            <div className="eb-inset rounded-xl p-4 !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Work</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">Favour gentle progress and finishing touches.</div>
            </div>
            <div className="eb-inset rounded-xl p-4 !bg-[rgb(var(--color-accent)/0.10)] !border !border-[rgb(var(--color-accent)/0.18)]">
              <div className="eb-inset-label !text-base !font-medium !text-neutral-800">Body</div>
              <div className="eb-inset-value !text-base !font-normal !text-neutral-800">Hydrate, warm meals, gentle movement, and earlier nights help many people.</div>
            </div>
          </div>
        </div>

        {/* It grows with you (reassurance) */}
        <div className="eb-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <IconBadge icon={<Sprout className="w-5 h-5" />} />
              <div>
                <h3 className="mb-1 font-semibold tracking-tight">It grows with you</h3>
                <div className="mt-2 text-neutral-800">
                  This space gets smarter as you use it. You’ll see helpful reflections from day one, but the real magic appears after a few consistent weeks. Patterns take a little time to emerge. Keep logging, and we’ll build your rhythm together.
                </div>
                <div className="mt-4 text-neutral-800">{confidenceCopy(level)}</div>
              </div>
            </div>
</div>
        </div>

        {/* What usually comes next */}
        <div className="eb-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Compass className="w-5 h-5" />} />
            <h3 className="mb-1 font-semibold tracking-tight">What usually comes next</h3>
          </div>

          <p className="text-neutral-700">
            If this rhythm follows your usual pattern, you’ll likely shift into your <span className="font-medium opacity-90">{computed.nextPhase}</span> ({computed.nextSci}) in around <span className="font-medium opacity-90">{computed.daysToNext ?? 5} days</span>.
          </p>

          <div className="eb-inset rounded-xl p-4 bg-[rgb(var(--color-accent)/0.10)] border border-[rgb(var(--color-accent)/0.18)]">
            <div className="text-base font-medium text-neutral-800">Plan gently if you can</div>
            <div className="text-base text-neutral-800 font-normal">Fatigue and physical sensitivity may rise briefly, then energy tends to rebuild again.</div>
          </div>
        </div>

        {/* Why this happens */}
        <div className="bg-gradient-to-br from-[rgb(var(--color-accent))] from-opacity-20 to-transparent rounded-2xl p-6 border border-[rgb(var(--color-accent))] border-opacity-30">
          <details>
            <summary className="cursor-pointer font-medium text-neutral-900">
              <span className="inline-flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.20)] flex items-center justify-center shrink-0">
                  <span className="text-[rgb(var(--color-primary))]"><Info className="w-5 h-5" /></span>
                </span>
                <span>Why this happens</span>
              </span>
            </summary>
            <div className="mt-3 space-y-2 text-neutral-700">
              <p>
                In the luteal phase, progesterone rises. For many people that can increase sleep need, change appetite, and make the body feel a little more sensitive.
              </p>
              <p>
                The key thing: these shifts are common and temporary. Over time, we’ll learn exactly how they show up for you.
              </p>
            </div>
          </details>
        </div>
    </div>
  );

}