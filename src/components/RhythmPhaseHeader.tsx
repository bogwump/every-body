import React from 'react';

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
  return (
    <div>
      <div className="eb-hero-header">
        <div className="eb-hero-header-main">
          <h3 className="eb-hero-title text-white">{props.phaseTitle}</h3>
          <p className="mt-1 eb-hero-subtitle eb-hero-on-dark-muted">{props.description}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <div className="eb-icon-frame eb-icon-frame--hero">{props.icon}</div>
          <div>
            <div className="text-xs text-white/80">Confidence</div>
            <div className="text-sm font-medium text-white/90">{props.confidenceLabel}</div>
          </div>
        </div>
      </div>
      {props.timingCopy ? (
        <div className="mt-3 eb-hero-subtitle eb-hero-on-dark-muted text-white/80">{props.timingCopy}</div>
      ) : null}
      <div className="mt-3">
        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-white/65">Phase progress</div>
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
