import React from 'react';
import { HandHeart } from 'lucide-react';

export function WhatsHelpingCard(props: { items: string[] }) {
  if (!props.items.length) return null;

  return (
    <div className="eb-card">
      <div className="eb-card-header">
        <div className="min-w-0 flex-1">
          <div className="eb-card-title">What&apos;s helping lately</div>
          <div className="eb-card-sub">A gentle read on what has looked useful for your body before.</div>
        </div>
        <div className="eb-icon-frame">
          <HandHeart className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {props.items.slice(0, 3).map((item) => (
          <div key={item} className="eb-inset rounded-2xl p-4 text-sm eb-muted">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
