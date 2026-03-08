import React, { useMemo } from 'react';
import type { CheckInEntry, UserData } from '../types';
import { getRhythmLowDataNudge, getRhythmLowDataPatternLines, getRhythmPatternLines, getRhythmSupportNudge, type RhythmPhaseKey } from '../lib/rhythmCopy';
import { getRhythmTimingModel } from '../lib/rhythmTiming';
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

  const supportNudge = useMemo(() => {
    if (lowData) return getRhythmLowDataNudge();
    return getRhythmSupportNudge({
      phaseKey: props.phaseKey,
      strongestSignal: patternState.strongestSignal,
      userData: props.userData,
      entries: props.entries,
    });
  }, [lowData, props.phaseKey, patternState.strongestSignal, props.userData, props.entries]);

  return (
    <div className="eb-hero-surface eb-hero-on-dark rounded-3xl p-6 sm:p-8 overflow-hidden shadow-sm space-y-4">
      <RhythmPhaseHeader
        icon={props.phaseIcon}
        phaseTitle={props.phaseTitle}
        phaseSubtitle={props.phaseSubtitle}
        description={props.phaseDescription}
        confidenceLabel={props.confidenceLabel}
        timingCopy={timingModel.timingCopy}
        progressPercent={timingModel.progressPercent}
      />

      <RhythmPatternBubble
        title={lowData ? 'Getting to know your patterns' : 'Your body lately'}
        lines={patternState.lines.slice(0, 2)}
        isLowData={lowData}
      />

      <RhythmSupportBubble body={supportNudge} />
    </div>
  );
}
