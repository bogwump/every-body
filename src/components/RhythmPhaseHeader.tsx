import React from 'react';

export function RhythmPhaseHeader(props: {
  icon: React.ReactNode;
  phaseTitle: string;
  phaseSubtitle: string;
  description: string;
  confidenceLabel: string;
  timingCopy?: string;
  progressPercent?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <div className="text-white">{props.icon}</div>
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 eb-hero-title eb-hero-on-dark text-white">{props.phaseTitle}</h3>
            <div className="eb-hero-subtitle eb-hero-on-dark-muted text-white/90">{props.phaseSubtitle}</div>
          </div>
        </div>
        <div className="text-sm text-white/90 mt-3">{props.description}</div>
        {props.timingCopy ? (
          <div className="mt-3 text-xs sm:text-sm text-white/80">{props.timingCopy}</div>
        ) : null}
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/65">Phase progress</div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-[rgb(var(--color-primary-dark))] transition-all duration-500"
              style={{ width: `${Math.max(8, Math.min(100, props.progressPercent ?? 36))}%` }}
            />
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-white/80">Confidence</div>
        <div className="text-sm font-medium text-white/90">{props.confidenceLabel}</div>
      </div>
    </div>
  );
}
