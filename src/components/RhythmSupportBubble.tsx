import React from 'react';

export function RhythmSupportBubble(props: { title?: string; body: string }) {
  const lines = props.body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.14)] border border-[rgba(255,255,255,0.18)] insights-hero-bubble">
      <div className="text-sm font-semibold !text-neutral-800">
        <span>{props.title ?? 'Gentle reminder'}</span>
      </div>
      <div className="mt-2 space-y-2 text-sm leading-6 !text-neutral-800" style={{ color: 'rgba(0,0,0,0.72)' }}>
        {lines.length ? lines.map((line, index) => <p key={index}>{line}</p>) : <p>{props.body}</p>}
      </div>
    </div>
  );
}
