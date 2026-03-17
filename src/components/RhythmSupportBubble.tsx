import React from 'react';

export function RhythmSupportBubble(props: { title?: string; body: string }) {
  const lines = props.body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="eb-inset eb-hero-panel rounded-2xl p-4 insights-hero-bubble">
      <div className="eb-hero-panel-label">
        <span>{props.title ?? 'Gentle reminder'}</span>
      </div>
      <div className="mt-2 space-y-2">
        {lines.length ? lines.map((line, index) => <p key={index} className="eb-hero-panel-body">{line}</p>) : <p className="eb-hero-panel-body">{props.body}</p>}
      </div>
    </div>
  );
}
