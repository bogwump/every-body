import type { CheckInEntry, UserData } from '../types';
import { isoTodayLocal } from './date';
import type { InsightSignal } from './insightEngine';
import { getDiscoveredPatterns, getTopInsights } from './insightEngine';
import { createMoment, getActiveMoments, getCompanionMoments, getHighestPriorityMoment } from './companionMoments';
import { generateExperimentSuggestions, getExperimentForSignal, rankExperimentSuggestions } from './experimentSuggestions';
import { detectLongCycle, detectShortCycle, detectUnusualPhaseLength } from './rhythmDiagnostics';
import { getHelpfulPatternsFromExperiments } from './experimentLearning';
import { getExperimentSuggestionSuppression, getWeeklyReflectionMoment, shouldSuppressCompanionMoment } from './companionLogic';
import { getConfidencePhrase } from './confidenceCopy';
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
    return { title: `Sleep ${getConfidencePhrase('high')} dip before your bleed`, body: 'Insights has picked up a repeat pattern around sleep that looks worth keeping an eye on.' };
  }
  if (signal.type === 'metric_pair') {
    return { title: `${niceMetric} is showing a clearer pattern`, body: 'Insights has noticed a stronger link between a couple of your recent signals.' };
  }
  if (signal.type === 'phase_shift') {
    return { title: `${niceMetric} ${getConfidencePhrase('high')} shift with this part of your cycle`, body: 'This has started looking repeatable enough to feel worth noticing.' };
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
  const experimentSuggestionSuppression = getExperimentSuggestionSuppression(refISO);
  const latestCompleted = experimentHistory
    .filter((item) => item?.outcome?.completedAtISO)
    .sort((a, b) => String(b?.outcome?.completedAtISO || '').localeCompare(String(a?.outcome?.completedAtISO || '')))[0] ?? null;
  if (latestCompleted) {
    const completedDate = String(latestCompleted?.outcome?.completedAtISO || '').slice(0, 10);
    const momentId = `experiment-result:${String(latestCompleted?.experimentId || latestCompleted?.title || 'latest')}:${completedDate}`;
    if (completedDate && completedDate >= refISO && !hasMomentWithId(momentId) && !active.some((moment) => moment.type === 'experiment_result_ready') && !shouldSuppressCompanionMoment({ type: 'experiment_result_ready', refISO, cooldownDays: 7, dismissalCooldownDays: 10, experimentId: String(latestCompleted?.experimentId || '') })) {
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
  if (latestDiscovery && latestDiscovery.firstDetected >= refISO && !hasMomentWithId(`pattern:${latestDiscovery.id}:${latestDiscovery.firstDetected}`) && !shouldSuppressCompanionMoment({ type: 'new_pattern', refISO, cooldownDays: 6, dismissalCooldownDays: 12, signalId: latestDiscovery.id })) {
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

  const helpfulPattern = getHelpfulPatternsFromExperiments().filter((item) => item.confidence !== 'low')[0] ?? null;
  if (helpfulPattern && !active.some((moment) => moment.type === 'helpful_pattern_detected') && !shouldSuppressCompanionMoment({ type: 'helpful_pattern_detected', refISO, cooldownDays: 10, dismissalCooldownDays: 14, signalId: helpfulPattern.signal })) {
    const helpfulDate = helpfulPattern.lastEvidenceDate || refISO;
    const helpfulId = `helpful:${helpfulPattern.signal}:${helpfulPattern.evidenceCount}:${helpfulDate}`;
    if (!hasMomentWithId(helpfulId)) {
      createMoment({
        id: helpfulId,
        type: 'helpful_pattern_detected',
        date: helpfulDate,
        data: {
          signalId: helpfulPattern.signal,
          title: 'Something that helps',
          body: helpfulPattern.text,
        },
      });
      return;
    }
  }

  const strongestSignal = getTopInsights(entries, userData, 6).filter((signal) => signal.type !== 'low_data' && signal.confidence !== 'low');
  const topSuggestion = rankExperimentSuggestions(generateExperimentSuggestions(strongestSignal))[0] ?? null;
  if (topSuggestion && !experimentSuggestionSuppression.active && !experimentSuggestionSuppression.recentCompletion && !active.some((moment) => moment.type === 'experiment_suggestion') && !shouldSuppressCompanionMoment({ type: 'experiment_suggestion', refISO, cooldownDays: 7, dismissalCooldownDays: 14, experimentId: String(topSuggestion.experimentId || '') })) {
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
        experimentDescription: topSuggestion.note || linkedExperiment?.experimentDescription || topSuggestion.experimentDescription,
        metrics: linkedExperiment?.metrics ?? topSuggestion.metrics,
        durationDays: linkedExperiment?.durationDays ?? topSuggestion.durationDays,
        changeKey: linkedExperiment?.changeKey ?? topSuggestion.changeKey,
      },
    });
    return;
  }

  const diagnostic = detectUnusualPhaseLength(refISO) ?? detectShortCycle() ?? detectLongCycle();
  if (diagnostic && !active.some((moment) => moment.type === 'rhythm_shift') && !shouldSuppressCompanionMoment({ type: 'rhythm_shift', refISO, cooldownDays: 5, dismissalCooldownDays: 8 })) {
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
  if (milestone && !shouldSuppressCompanionMoment({ type: milestone.id.startsWith('unlock') ? 'unlock_milestone' : 'encouragement', refISO, cooldownDays: 6, dismissalCooldownDays: 10 })) {
    createMoment({
      id: milestone.id,
      type: milestone.id.startsWith('unlock') ? 'unlock_milestone' : 'encouragement',
      date: refISO,
      data: {
        title: milestone.title,
        body: milestone.body,
      },
    });
    return;
  }

  const reflection = getWeeklyReflectionMoment(entries, refISO);
  if (reflection && !shouldSuppressCompanionMoment({ type: reflection.type, refISO, cooldownDays: 6, dismissalCooldownDays: 10 })) {
    createMoment({
      id: reflection.id,
      type: reflection.type,
      date: refISO,
      data: {
        title: reflection.title,
        body: reflection.body,
      },
    });
  }
}
