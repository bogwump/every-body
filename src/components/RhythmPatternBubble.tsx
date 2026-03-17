import React from 'react';

export function RhythmPatternBubble(props: { title?: string; lines: string[]; isLowData?: boolean }) {
  return (
    <div className="eb-inset rounded-2xl p-4 insights-hero-bubble">
      <div className="eb-hero-panel-label">{props.title ?? 'Your body lately'}</div>
      <div className="mt-2 space-y-2">
        {props.lines.map((line) => (
          <p key={line} className="eb-hero-panel-body">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
