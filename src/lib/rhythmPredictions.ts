import type { CheckInEntry, ExperimentHistoryItem, UserData } from '../types';
import type { InsightMetricKey } from '../types';
import { pearsonCorrelation } from './analytics';
import { labelForMetric, valueForMetric } from './experiments';

const INFLUENCE_LABELS: Record<string, string> = {
  lateNight: 'going to bed earlier',
  socialising: 'a quieter social plan',
  exercise: 'workout changes',
  alcohol: 'alcohol-free days',
  travel: 'travel',
  illness: 'resting while unwell',
  stressfulDay: 'stress buffers',
  medication: 'medication changes',
  caffeine: 'caffeine changes',
  lowHydration: 'hydration support',
  sex: 'intimacy changes',
};

function bestLagCorrelation(
  a: Array<number | null>,
  b: Array<number | null>,
  maxLag = 3
): { lag: number; r: number; n: number } {
  let best = { lag: 0, r: 0, n: 0 };

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= b.length) continue;
      const av = a[i];
      const bv = b[j];
      if (av == null || bv == null) continue;
      xs.push(av);
      ys.push(bv);
    }
    if (xs.length < 8) continue;
    const r = pearsonCorrelation(xs, ys);
    if (!isFinite(r)) continue;
    if (Math.abs(r) > Math.abs(best.r)) best = { lag, r, n: xs.length };
  }

  return best;
}

function buildSeries(entries: CheckInEntry[], key: InsightMetricKey): Array<number | null> {
  return entries.map((e) => {
    const v = valueForMetric(e, key);
    return typeof v === 'number' && isFinite(v) ? v : null;
  });
}

/**
 * Returns up to 2 short, safe learnings that can be shown on the Rhythm page.
 * These are supportive patterns, not medical advice.
 */
export function getRhythmExperimentLearnings(
  entriesSorted: CheckInEntry[],
  history: ExperimentHistoryItem[],
  userData: UserData
): string[] {
  if (!Array.isArray(history) || history.length === 0) return [];

  // Use the most recent completed items.
  const recent = [...history]
    .filter((h) => h && typeof h === 'object' && typeof h.completedAtISO === 'string')
    .sort((a, b) => (a.completedAtISO < b.completedAtISO ? 1 : -1))
    .slice(0, 6);

  const out: string[] = [];

  // Window for analysis: last ~90 days of entries (if available)
  const windowEntries = entriesSorted.slice(Math.max(0, entriesSorted.length - 90));

  for (const h of recent) {
    if (out.length >= 2) break;

    if (h.kind === 'change') {
      const focus = (h.metrics || []).slice(0, 2).map((k) => labelForMetric(k, userData));
      const change = h.changeKey ? (INFLUENCE_LABELS[h.changeKey] || h.changeKey) : 'a small change';

      if (h.outcomeStatus === 'helped') {
        out.push(`Your experiment suggests ${change} may help with ${focus.join(' and ')}.`);
      } else if (h.outcomeStatus === 'notReally') {
        out.push(`Your experiment suggests ${change} did not noticeably shift ${focus.join(' and ')} (yet).`);
      }
      continue;
    }

    // Tracking experiments: translate to a timing/co-movement insight.
    const pair = (h.metrics || []).slice(0, 2);
    if (pair.length < 2) continue;
    const [aKey, bKey] = pair;

    const aSeries = buildSeries(windowEntries, aKey);
    const bSeries = buildSeries(windowEntries, bKey);
    const best = bestLagCorrelation(aSeries, bSeries, 3);

    const aName = labelForMetric(aKey, userData);
    const bName = labelForMetric(bKey, userData);

    if (best.n >= 10 && Math.abs(best.r) >= 0.35) {
      if (best.lag === 0) {
        out.push(`${aName} and ${bName} often rise and fall together for you.`);
      } else if (best.lag > 0) {
        out.push(`${aName} often shows up about ${best.lag} day${best.lag === 1 ? '' : 's'} before ${bName}.`);
      } else {
        const d = Math.abs(best.lag);
        out.push(`${bName} often shows up about ${d} day${d === 1 ? '' : 's'} before ${aName}.`);
      }
    } else {
      out.push(`Keep logging: we are still learning whether ${aName} and ${bName} reliably move together.`);
    }
  }

  return out.slice(0, 2);
}
