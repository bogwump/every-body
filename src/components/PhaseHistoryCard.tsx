import React from 'react';
import type { PhaseHistoryEntry } from '../lib/phaseHistory';

function phaseLabel(phase: string) {
  switch (phase) {
    case 'reset':
    case 'bleed':
      return 'Bleed';
    case 'rebuilding':
      return 'Rebuilding';
    case 'expressive':
      return 'Expressive';
    case 'protective':
      return 'Protective';
    default:
      return phase;
  }
}

export function PhaseHistoryCard(props: { history: PhaseHistoryEntry[] }) {
  const items = props.history.slice(-8).reverse();
  const maxDuration = Math.max(1, ...items.map((item) => Math.max(1, item.duration ?? 1)));

  return (
    <div className="eb-card p-6">
      <div className="mb-4">
        <h3 className="font-semibold tracking-tight">Recent rhythm</h3>
        <p className="mt-1 text-sm text-[rgba(0,0,0,0.65)]">A quick look at how your recent phases have been moving.</p>
      </div>

      <div className="space-y-3">
        {items.length ? (
          items.map((item) => {
            const duration = item.duration ?? 1;
            const width = Math.max(12, Math.round((duration / maxDuration) * 100));
            return (
              <div key={`${item.phase}-${item.startDate}`} className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
                <div className="text-sm font-medium text-neutral-800 min-w-[6.5rem]">{phaseLabel(item.phase)}</div>
                <div className="h-2 rounded-full bg-[rgb(var(--color-accent)/0.16)] overflow-hidden">
                  <div className="h-full rounded-full bg-[rgb(var(--color-primary))]" style={{ width: `${width}%` }} />
                </div>
                <div className="text-sm text-[rgba(0,0,0,0.7)] whitespace-nowrap">{duration} {duration === 1 ? 'day' : 'days'}</div>
              </div>
            );
          })
        ) : (
          <div className="text-sm text-[rgba(0,0,0,0.65)]">As you move through a few more phase shifts, your recent rhythm will start to appear here.</div>
        )}
      </div>
    </div>
  );
}
