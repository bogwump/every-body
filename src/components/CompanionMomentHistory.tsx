import React from 'react';
import { Activity, FlaskConical, RefreshCw, Sparkles, Star } from 'lucide-react';
import type { CompanionMoment } from '../lib/companionMoments';
import { phaseLabelFromKey } from '../lib/phaseChange';

function iconForType(type: CompanionMoment['type']) {
  switch (type) {
    case 'phase_change':
      return <RefreshCw className="w-4 h-4" />;
    case 'new_pattern':
      return <Sparkles className="w-4 h-4" />;
    case 'experiment_suggestion':
    case 'experiment_result_ready':
      return <FlaskConical className="w-4 h-4" />;
    case 'rhythm_shift':
      return <Activity className="w-4 h-4" />;
    default:
      return <Star className="w-4 h-4" />;
  }
}

function lineForMoment(moment: CompanionMoment): string {
  const data = moment.data ?? {};
  switch (moment.type) {
    case 'phase_change':
      return `Moved into ${phaseLabelFromKey(typeof data.phase === 'string' ? data.phase : null)}`;
    case 'new_pattern':
      return typeof data.title === 'string' ? data.title : 'New pattern spotted';
    case 'experiment_suggestion':
      return typeof data.title === 'string' ? data.title : 'Experiment idea suggested';
    case 'experiment_result_ready':
      return typeof data.title === 'string' ? data.title : 'Experiment result ready';
    case 'rhythm_shift':
      return typeof data.title === 'string' ? data.title : 'Rhythm shift noticed';
    case 'unlock_milestone':
      return typeof data.title === 'string' ? data.title : 'New insight milestone unlocked';
    default:
      return typeof data.title === 'string' ? data.title : 'Nice work checking in';
  }
}

export function CompanionMomentHistory(props: { moments: CompanionMoment[]; onSelectMoment?: (moment: CompanionMoment) => void }) {
  if (!props.moments.length) return null;

  return (
    <div className="eb-card">
      <div className="eb-card-header">
        <div>
          <div className="eb-card-title">Recent updates</div>
          <div className="eb-card-sub">A quick look at what your companion has been noticing lately.</div>
        </div>
      </div>
      <div className="space-y-3">
        {props.moments.map((moment) => {
          const clickable = Boolean(props.onSelectMoment) && (moment.type === 'experiment_suggestion' || moment.type === 'experiment_result_ready');
          return (
          <button
            key={moment.id}
            type="button"
            onClick={() => clickable ? props.onSelectMoment?.(moment) : undefined}
            className={`w-full text-left flex items-start gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[rgba(255,255,255,0.6)] p-3 ${clickable ? 'hover:bg-white transition-colors cursor-pointer' : ''}`}
            disabled={!clickable}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-accent)/0.18)] text-[rgb(var(--color-primary))]">
              {iconForType(moment.type)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[rgb(var(--color-text))]">{lineForMoment(moment)}</div>
              <div className="mt-0.5 text-xs text-[rgb(var(--color-text-secondary))]">{moment.date}</div>
              {clickable ? <div className="mt-2 text-xs font-medium text-[rgb(var(--color-primary))]">Tap to open</div> : null}
            </div>
          </button>
        );})}
      </div>
    </div>
  );
}
