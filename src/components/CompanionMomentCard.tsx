import React from 'react';
import { Activity, FlaskConical, RefreshCw, Sparkles, Star, X } from 'lucide-react';
import type { CompanionMoment } from '../lib/companionMoments';
import { dismissMoment } from '../lib/companionMoments';
import { phaseLabelFromKey } from '../lib/phaseChange';

function iconForType(type: CompanionMoment['type']) {
  switch (type) {
    case 'phase_change':
      return <RefreshCw className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'new_pattern':
      return <Sparkles className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'experiment_suggestion':
      return <FlaskConical className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    case 'rhythm_shift':
      return <Activity className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    default:
      return <Star className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
  }
}

function copyForMoment(moment: CompanionMoment): { eyebrow?: string; title: string; body: string; button: string; screen: string } {
  const data = moment.data ?? {};
  switch (moment.type) {
    case 'phase_change': {
      const phase = phaseLabelFromKey(typeof data.phase === 'string' ? data.phase : null);
      return {
        eyebrow: 'New phase detected',
        title: `You’ve moved into ${phase}`,
        body: 'Your rhythm page has been updated for this new window.',
        button: 'View rhythm',
        screen: 'rhythm',
      };
    }
    case 'new_pattern':
      return {
        eyebrow: 'New pattern spotted',
        title: typeof data.title === 'string' ? data.title : 'A new pattern has started standing out',
        body: typeof data.body === 'string' ? data.body : 'Head to Insights for the fuller read on what has been showing up.',
        button: 'See insights',
        screen: 'insights',
      };
    case 'experiment_suggestion':
      return {
        eyebrow: 'Experiment idea',
        title: typeof data.title === 'string' ? data.title : 'Something may be worth testing this week',
        body: typeof data.body === 'string' ? data.body : 'A gentle experiment can help you see whether this pattern is worth supporting differently.',
        button: 'Try experiment',
        screen: 'insights',
      };
    case 'rhythm_shift':
      return {
        eyebrow: 'Rhythm shift noticed',
        title: typeof data.title === 'string' ? data.title : 'Your rhythm looks a little different lately',
        body: typeof data.body === 'string' ? data.body : 'Rhythm has picked up a small change in timing worth keeping an eye on.',
        button: 'View rhythm',
        screen: 'rhythm',
      };
    case 'unlock_milestone':
      return {
        eyebrow: 'For you',
        title: typeof data.title === 'string' ? data.title : 'New insights unlocked',
        body: typeof data.body === 'string' ? data.body : 'You have logged enough to start seeing more useful patterns.',
        button: 'See insights',
        screen: 'insights',
      };
    case 'encouragement':
    default:
      return {
        eyebrow: 'For you',
        title: typeof data.title === 'string' ? data.title : 'Nice work checking in',
        body: typeof data.body === 'string' ? data.body : 'You are building a clearer picture of your rhythm over time.',
        button: 'Keep going',
        screen: 'check-in',
      };
  }
}

export function CompanionMomentCard(props: { moment: CompanionMoment; onNavigate: (screen: string) => void; onDismiss?: () => void }) {
  const copy = copyForMoment(props.moment);

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
            <button type="button" className="eb-btn-primary" onClick={() => props.onNavigate(copy.screen)}>{copy.button}</button>
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
