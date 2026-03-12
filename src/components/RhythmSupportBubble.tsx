import React from 'react';
import { Leaf } from 'lucide-react';

export function RhythmSupportBubble(props: { title?: string; body: string }) {
  return (
    <div className="eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.14)] border border-[rgba(255,255,255,0.18)] insights-hero-bubble">
      <div className="flex items-center gap-2 text-sm font-semibold !text-neutral-800">
        <Leaf className="w-4 h-4 !text-[rgb(var(--color-primary-dark))]" />
        <span>{props.title ?? 'Gentle reminder'}</span>
      </div>
      <p className="mt-2 leading-6 text-sm !text-neutral-800 whitespace-pre-line" style={{ color: 'rgba(0,0,0,0.72)' }}>{props.body}</p>
    </div>
  );
}
