import React from 'react';

export function RhythmPatternBubble(props: { title?: string; lines: string[]; isLowData?: boolean }) {
  return (
    <div className="eb-inset rounded-3xl p-5 sm:p-6 bg-[rgb(var(--color-accent)/0.10)] border border-[rgb(var(--color-accent)/0.18)]">
      <div className="text-base font-medium text-neutral-800">{props.title ?? 'Your body lately'}</div>
      <div className="mt-3 space-y-2">
        {props.lines.map((line) => (
          <p key={line} className="text-base text-neutral-800 leading-7 font-normal">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
