import React from 'react';
import { Activity, FlaskConical, RefreshCw, Sparkles, Star, X } from 'lucide-react';
import { dismissMoment, getMomentDisplayCopy, getMomentFocusTarget, type CompanionMoment } from '../lib/companionMoments';
import { inferPendingExperimentLaunchFromText, queuePendingExperimentLaunch } from '../lib/experimentLaunch';
import { phaseLabelFromKey } from '../lib/phaseChange';

function iconForType(type: CompanionMoment['type']) {
  switch (type) {
    case 'phase_change':
      return <RefreshCw className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'new_pattern':
      return <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'experiment_suggestion':
    case 'experiment_result_ready':
      return <FlaskConical className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'helpful_pattern_detected':
      return <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'rhythm_shift':
      return <Activity className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    default:
      return <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
  }
}

function setPageFocus(target?: string) {
  if (!target || !target.includes(':')) return;
  try {
    localStorage.setItem('everybody:v2:page_focus', target);
  } catch {
    // ignore
  }
}


export function CompanionMomentCard(props: { moment: CompanionMoment; onNavigate: (screen: string) => void; onDismiss?: () => void }) {
  const copy = getMomentDisplayCopy(props.moment);

  const completeInteractionAndNavigate = (screen: string, focusTarget?: string | null) => {
    dismissMoment(props.moment.id, 'interacted');
    props.onDismiss?.();
    if (focusTarget) setPageFocus(focusTarget);
    props.onNavigate(screen);
  };

  const handlePrimaryAction = () => {
    const data = props.moment.data ?? {};
    const focusTarget = getMomentFocusTarget(props.moment) ?? null;
    if (props.moment.type === 'experiment_suggestion') {
      const inferred = inferPendingExperimentLaunchFromText(
        typeof data.title === 'string' ? data.title : copy.title,
        typeof data.body === 'string' ? data.body : copy.body,
      );
      const payload = (typeof data.experimentId === 'string' && typeof data.experimentName === 'string')
        ? {
            experimentId: data.experimentId,
            experimentName: data.experimentName,
            experimentDescription: typeof data.experimentDescription === 'string' ? data.experimentDescription : copy.body,
            metrics: Array.isArray(data.metrics) ? data.metrics.map((item) => String(item)) : [],
            durationDays: typeof data.durationDays === 'number' ? data.durationDays : 3,
            changeKey: typeof data.changeKey === 'string' ? data.changeKey : undefined,
            signalId: typeof data.signalId === 'string' ? data.signalId : undefined,
            source: 'companion' as const,
          }
        : (inferred ? { ...inferred, source: 'companion' as const } : null);

      if (payload) {
        queuePendingExperimentLaunch(payload);
        completeInteractionAndNavigate('insights', focusTarget);
        return;
      }
    }

    completeInteractionAndNavigate(copy.screen, focusTarget);
  };

  return (
    <div className="eb-card mb-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-accent)/0.20)] flex items-center justify-center shrink-0">
          {iconForType(props.moment.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.08em] text-[rgba(0,0,0,0.52)] font-semibold">{copy.eyebrow ?? 'For you'}</div>
          <h3 className="mt-1 mb-1">{copy.title}</h3>
          <p className="text-sm text-[rgba(0,0,0,0.68)]">{copy.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="eb-btn-primary" onClick={handlePrimaryAction}>{copy.button}</button>
            <button
              type="button"
              className="eb-btn-secondary inline-flex items-center gap-2"
              onClick={() => {
                dismissMoment(props.moment.id);
                props.onDismiss?.();
              }}
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
