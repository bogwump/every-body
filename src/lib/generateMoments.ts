import type { CheckInEntry, UserData } from '../types';
import { isoTodayLocal } from './date';
import type { InsightSignal } from './insightEngine';
import { getDiscoveredPatterns, getTopInsights } from './insightEngine';
import { createMoment, getActiveMoments, getCompanionMoments, getHighestPriorityMoment } from './companionMoments';
import { generateExperimentSuggestions, getExperimentForSignal, rankExperimentSuggestions } from './experimentSuggestions';
import { detectLongCycle, detectShortCycle, detectUnusualPhaseLength } from './rhythmDiagnostics';
import { phaseLabelFromKey } from './phaseChange';

function hasMomentWithId(id: string): boolean {
  return getCompanionMoments().some((moment) => moment.id === id);
}

function readExperimentHistory(): any[] {
  try {
    const raw = localStorage.getItem('everybody:v2:experiment_history');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function patternCopy(signal: InsightSignal): { title: string; body: string } {
  const metric = String(signal.metrics?.[0] ?? 'This pattern');
  const niceMetric = metric.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  if (signal.id.includes('sleep_before_bleed')) {
    return { title: 'Sleep tends to dip before your bleed', body: 'Insights has picked up a repeat pattern around sleep worth keeping an eye on.' };
  }
  if (signal.type === 'metric_pair') {
    return { title: `${niceMetric} is showing a clearer pattern`, body: 'Insights has noticed a stronger link between a couple of your recent signals.' };
  }
  if (signal.type === 'phase_shift') {
    return { title: `${niceMetric} often shifts with this part of your cycle`, body: 'This has started looking repeatable enough to feel worth noticing.' };
  }
  return { title: `${niceMetric} has started standing out`, body: 'Insights has picked up a pattern that looks more repeatable now.' };
}

function logsMilestone(entries: CheckInEntry[]): { title: string; body: string; id: string } | null {
  const count = entries.length;
  if (count >= 7 && !hasMomentWithId('unlock:7-logs')) {
    return {
      id: 'unlock:7-logs',
      title: 'New insights unlocked',
      body: 'You have logged enough days to start seeing early sleep and energy patterns.',
    };
  }
  if (count >= 3 && !hasMomentWithId('encouragement:3-logs')) {
    return {
      id: 'encouragement:3-logs',
      title: 'You’re building your rhythm',
      body: 'A few more check-ins will help this start turning into personalised guidance.',
    };
  }
  return null;
}

export function generateMoments(entries: CheckInEntry[], userData: UserData, refISO: string = isoTodayLocal()) {
  const active = getActiveMoments(refISO);
  const topActive = getHighestPriorityMoment(refISO);

  const currentTopPriority = topActive ? topActive.type : null;
  if (currentTopPriority === 'phase_change') return;

  const experimentHistory = readExperimentHistory();
  const latestCompleted = experimentHistory
    .filter((item) => item?.outcome?.completedAtISO)
    .sort((a, b) => String(b?.outcome?.completedAtISO || '').localeCompare(String(a?.outcome?.completedAtISO || '')))[0] ?? null;
  if (latestCompleted) {
    const completedDate = String(latestCompleted?.outcome?.completedAtISO || '').slice(0, 10);
    const momentId = `experiment-result:${String(latestCompleted?.experimentId || latestCompleted?.title || 'latest')}:${completedDate}`;
    if (completedDate && completedDate >= refISO && !hasMomentWithId(momentId) && !active.some((moment) => moment.type === 'experiment_result_ready')) {
      createMoment({
        id: momentId,
        type: 'experiment_result_ready',
        date: completedDate,
        data: {
          title: 'Experiment result ready',
          body: 'Your latest experiment now has enough data to look back on.',
          experimentId: String(latestCompleted?.experimentId || ''),
          experimentName: String(latestCompleted?.title || 'Your experiment'),
          experimentDescription: 'Open Insights to review how this one felt.',
          metrics: Array.isArray(latestCompleted?.metrics) ? latestCompleted.metrics : [],
          durationDays: typeof latestCompleted?.durationDays === 'number' ? latestCompleted.durationDays : 3,
          changeKey: typeof latestCompleted?.changeKey === 'string' ? latestCompleted.changeKey : undefined,
        },
      });
      return;
    }
  }

  const discovered = getDiscoveredPatterns()
    .slice()
    .sort((a, b) => b.firstDetected.localeCompare(a.firstDetected));
  const latestDiscovery = discovered[0] ?? null;
  if (latestDiscovery && latestDiscovery.firstDetected >= refISO && !hasMomentWithId(`pattern:${latestDiscovery.id}:${latestDiscovery.firstDetected}`)) {
    const signal = getTopInsights(entries, userData, 8).find((item) => item.id === latestDiscovery.id);
    if (signal) {
      const copy = patternCopy(signal);
      createMoment({
        id: `pattern:${latestDiscovery.id}:${latestDiscovery.firstDetected}`,
        type: 'new_pattern',
        date: latestDiscovery.firstDetected,
        data: {
          signalId: signal.id,
          metric: signal.metrics?.[0] ?? null,
          title: copy.title,
          body: copy.body,
        },
      });
      return;
    }
  }

  const strongestSignal = getTopInsights(entries, userData, 6).filter((signal) => signal.type !== 'low_data' && signal.confidence !== 'low');
  const topSuggestion = rankExperimentSuggestions(generateExperimentSuggestions(strongestSignal))[0] ?? null;
  if (topSuggestion && !active.some((moment) => moment.type === 'experiment_suggestion')) {
    const sourceSignal = strongestSignal.find((signal) => `experiment:${signal.id}` === topSuggestion.id) ?? null;
    const linkedExperiment = sourceSignal ? getExperimentForSignal(sourceSignal) : null;
    createMoment({
      id: `experiment:${topSuggestion.id}`,
      type: 'experiment_suggestion',
      date: refISO,
      data: {
        title: topSuggestion.title,
        body: topSuggestion.note,
        signalId: sourceSignal?.id,
        experimentId: linkedExperiment?.experimentId ?? topSuggestion.experimentId,
        experimentName: linkedExperiment?.experimentName ?? topSuggestion.experimentName,
        experimentDescription: linkedExperiment?.experimentDescription ?? topSuggestion.experimentDescription,
        metrics: linkedExperiment?.metrics ?? topSuggestion.metrics,
        durationDays: linkedExperiment?.durationDays ?? topSuggestion.durationDays,
        changeKey: linkedExperiment?.changeKey ?? topSuggestion.changeKey,
      },
    });
    return;
  }

  const diagnostic = detectUnusualPhaseLength(refISO) ?? detectShortCycle() ?? detectLongCycle();
  if (diagnostic && !active.some((moment) => moment.type === 'rhythm_shift')) {
    const body = diagnostic.type === 'long_phase'
      ? `Your ${phaseLabelFromKey(diagnostic.phase)} has been lasting a little longer than usual recently.`
      : diagnostic.type === 'short_cycle'
        ? 'This cycle looks a little shorter than your recent pattern.'
        : 'This cycle looks a little longer than your recent pattern.';
    createMoment({
      id: `diagnostic:${diagnostic.type}:${diagnostic.phase ?? 'cycle'}:${refISO}`,
      type: 'rhythm_shift',
      date: refISO,
      data: {
        title: 'Rhythm shift noticed',
        body,
      },
    });
    return;
  }

  const milestone = logsMilestone(entries);
  if (milestone) {
    createMoment({
      id: milestone.id,
      type: milestone.id.startsWith('unlock') ? 'unlock_milestone' : 'encouragement',
      date: refISO,
      data: {
        title: milestone.title,
        body: milestone.body,
      },
    });
  }
}
