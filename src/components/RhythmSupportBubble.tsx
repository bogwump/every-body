import React from 'react';

export function RhythmSupportBubble(props: { title?: string; body: string }) {
  return (
    <div className="eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.14)] border border-[rgba(255,255,255,0.18)] insights-hero-bubble">
      <div className="text-sm font-semibold text-[rgba(0,0,0,0.70)]">{props.title ?? 'Gentle reminder'}</div>
      <p className="mt-2 leading-6 text-sm text-[rgba(0,0,0,0.65)]">{props.body}</p>
    </div>
  );
}
