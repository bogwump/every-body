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


type WhatsComingPrediction = {
  text: string;
  confidence: 'Learning' | 'Emerging' | 'Established';
};

/**
 * Predictive, user-friendly "what might be coming next" lines.
 * Conservative: only triggers when a recently observed "lead" symptom suggests a likely follow-on symptom soon.
 */
export function getWhatsComingPredictions(
  entriesSorted: CheckInEntry[],
  history: ExperimentHistoryItem[],
  userData: UserData,
  todayISO: string
): string[] {
  if (!Array.isArray(entriesSorted) || entriesSorted.length < 10) return [];
  if (!Array.isArray(history) || history.length === 0) return [];

  // Focus on recent entries (up to 90 days) for stability
  const recent = entriesSorted.slice(-90);
  const byISO = new Map<string, CheckInEntry>();
  for (const e of recent) {
    if (e && typeof e === 'object' && typeof (e as any).dateISO === 'string') {
      byISO.set((e as any).dateISO, e);
    }
  }

  const predictions: WhatsComingPrediction[] = [];

  const tracked = history.filter((h) => h && typeof h === 'object' && (h as any).kind === 'track');
  for (const h of tracked.slice(0, 12)) {
    const metrics = Array.isArray((h as any).metrics) ? ((h as any).metrics as InsightMetricKey[]) : [];
    if (metrics.length < 2) continue;

    const a = metrics[0];
    const b = metrics[1];

    // Only do this for symptom-to-symptom style metrics (avoid custom: for now)
    if (String(a).startsWith('custom:') || String(b).startsWith('custom:')) continue;

    const seriesA = buildSeries(recent, a);
    const seriesB = buildSeries(recent, b);
    const best = bestLagCorrelation(seriesA, seriesB, 3);

    // Conservative thresholds
    if (best.n < 10) continue;
    if (Math.abs(best.r) < 0.35) continue;

    // Determine lead/follow
    // best.lag > 0 means A aligns best with B shifted later => A tends to lead B by lag days.
    const lead = best.lag > 0 ? a : best.lag < 0 ? b : a;
    const follow = best.lag > 0 ? b : best.lag < 0 ? a : b;
    const lagDays = Math.abs(best.lag);

    // Trigger only if lead symptom is high in the last 2 logged days.
    const lastTwo = recent.slice(-2);
    const leadRecentHigh = lastTwo.some((e) => {
      const v = valueForMetric(e, lead as any);
      return typeof v === 'number' && v >= 7;
    });

    if (!leadRecentHigh) continue;

    const leadLabel = labelForMetric(lead as any, userData);
    const followLabel = labelForMetric(follow as any, userData);

    let windowText = '';
    if (lagDays === 0) {
      windowText = 'today or tomorrow';
    } else if (lagDays === 1) {
      windowText = 'in the next day or two';
    } else {
      windowText = `in the next ${Math.max(1, lagDays - 1)}–${lagDays + 1} days`;
    }

    predictions.push({
      text: `Heads up: when ${leadLabel.toLowerCase()} is high, ${followLabel.toLowerCase()} often follows ${windowText}.`,
      confidence: 'Emerging',
    });
  }

  // If nothing triggered, return empty (avoid filler predictions)
  const uniq: string[] = [];
  for (const p of predictions) {
    if (!uniq.includes(p.text)) uniq.push(p.text);
  }
  return uniq.slice(0, 2);
}

