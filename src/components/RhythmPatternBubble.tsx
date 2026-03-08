import React from 'react';

export function RhythmPatternBubble(props: { title?: string; lines: string[]; isLowData?: boolean }) {
  return (
    <div className="eb-inset rounded-2xl p-4 bg-[rgba(255,255,255,0.14)] border border-[rgba(255,255,255,0.18)] insights-hero-bubble">
      <div className="text-sm font-semibold text-[rgba(0,0,0,0.70)]">{props.title ?? 'Your body lately'}</div>
      <div className="mt-2 space-y-2 text-sm text-[rgba(0,0,0,0.65)]">
        {props.lines.map((line) => (
          <p key={line} className="leading-6 text-[rgba(0,0,0,0.65)]">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
