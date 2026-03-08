import React from 'react';

export function RhythmSupportBubble(props: { title?: string; body: string }) {
  return (
    <div className="eb-inset rounded-3xl p-5 sm:p-6 bg-[rgb(var(--color-accent)/0.10)] border border-[rgb(var(--color-accent)/0.18)]">
      <div className="text-base font-medium text-neutral-800">{props.title ?? 'Gentle reminder'}</div>
      <p className="mt-3 text-base text-neutral-800 leading-7 font-normal">{props.body}</p>
    </div>
  );
}
