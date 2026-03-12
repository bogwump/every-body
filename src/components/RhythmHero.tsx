import React, { useMemo } from 'react';
import type { CheckInEntry, UserData } from '../types';
import { getRhythmLowDataPatternLines, getRhythmPatternLines, type RhythmPhaseKey } from '../lib/rhythmCopy';
import { getRhythmTimingModel } from '../lib/rhythmTiming';
import { getBodyWeatherLines } from '../lib/companionLogic';
import { getTopInsights } from '../lib/insightEngine';
import { estimatePhaseByFlow } from '../lib/analytics';
import { isoTodayLocal } from '../lib/date';
import { RhythmPatternBubble } from './RhythmPatternBubble';
import { RhythmPhaseHeader } from './RhythmPhaseHeader';
import { RhythmSupportBubble } from './RhythmSupportBubble';

export function RhythmHero(props: {
  entries: CheckInEntry[];
  userData: UserData;
  phaseKey: RhythmPhaseKey;
  phaseTitle: string;
  phaseSubtitle: string;
  phaseDescription: string;
  confidenceLabel: string;
  phaseStatusLabel?: string;
  phaseIcon: React.ReactNode;
}) {
  const distinctDays = useMemo(
    () => new Set((props.entries ?? []).map((entry) => entry?.dateISO).filter((value): value is string => typeof value === 'string')).size,
    [props.entries],
  );

  const lowData = distinctDays < 5;
  const patternState = useMemo(() => {
    if (lowData) return { lines: getRhythmLowDataPatternLines(), strongestSignal: null };
    return getRhythmPatternLines(props.entries, props.userData, props.phaseKey, 2);
  }, [lowData, props.entries, props.userData, props.phaseKey]);

  const timingModel = useMemo(() => getRhythmTimingModel(props.entries, props.userData), [props.entries, props.userData]);

  const predictionBody = useMemo(() => {
    if (lowData) return 'A few more check-ins will help this turn into a more personal prediction window.';
    const currentPhase = estimatePhaseByFlow(isoTodayLocal(), props.entries);
    const strongSignals = getTopInsights(props.entries, props.userData, 8).filter((signal) => signal.type !== 'low_data' && signal.confidence !== 'low');
    const lines = getBodyWeatherLines({
      entries: props.entries,
      userData: props.userData,
      currentPhase,
      heroSignals: strongSignals.slice(0, 3),
      strongPatternSignals: strongSignals,
    }).slice(0, 3);
    return lines.map((line) => `• ${line}`).join('\n');
  }, [lowData, props.entries, props.userData]);

  return (
    <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-6 sm:p-8 overflow-hidden shadow-sm space-y-4">
      <RhythmPhaseHeader
        icon={props.phaseIcon}
        phaseTitle={props.phaseTitle}
        phaseSubtitle={props.phaseSubtitle}
        description={props.phaseDescription}
        confidenceLabel={props.confidenceLabel}
        phaseStatusLabel={props.phaseStatusLabel}
        timingCopy={timingModel.timingCopy}
        progressPercent={timingModel.progressPercent}
      />

      <RhythmPatternBubble
        title={lowData ? 'Getting to know your patterns' : 'Your body lately'}
        lines={patternState.lines.slice(0, 2)}
        isLowData={lowData}
      />

      <RhythmSupportBubble title="Over the next few days you might notice" body={predictionBody} />
    </div>
  );
}
