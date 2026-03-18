import React from 'react';

function splitTimingCopy(timingCopy?: string): string[] {
  if (!timingCopy) return [];
  return timingCopy
    .split(/\s*[·•]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function RhythmPhaseHeader(props: {
  icon: React.ReactNode;
  phaseTitle: string;
  phaseSubtitle?: string;
  description: string;
  confidenceLabel: string;
  phaseStatusLabel?: string;
  timingCopy?: string;
  progressPercent?: number;
}) {
  const timingParts = splitTimingCopy(props.timingCopy);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="eb-hero-title text-white">{props.phaseTitle}</h3>
          <p className="mt-1 eb-hero-subtitle text-white">{props.description}</p>
        </div>
        <div className="shrink-0">
          <div className="eb-icon-frame eb-icon-frame--hero">{props.icon}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {timingParts.map((part) => (
          <div
            key={part}
            className="inline-flex max-w-full items-center rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-sm font-medium text-white"
          >
            <span className="min-w-0 truncate">{part}</span>
          </div>
        ))}
        <div className="inline-flex items-center rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-sm font-medium text-white">
          Confidence: {props.confidenceLabel}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white">Phase progress</div>
        <div className="h-2 rounded-full bg-white/28 overflow-hidden border border-white/10">
          <div
            className="h-full rounded-full bg-[rgb(var(--color-accent))] transition-all duration-500"
            style={{ width: `${Math.max(8, Math.min(100, props.progressPercent ?? 36))}%`, boxShadow: '0 0 0 1px rgba(255,255,255,0.12) inset' }}
          />
        </div>
      </div>
    </div>
  );
}
