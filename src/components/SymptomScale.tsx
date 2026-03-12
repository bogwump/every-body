import React, { useMemo, useRef } from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dotOpacity(index: number) {
  return 0.24 + index * 0.055;
}

export interface SymptomScaleProps {
  value?: number | null;
  onChange: (value: number | undefined) => void;
  previousValue?: number | null;
  ariaLabel: string;
  leftLabel?: string;
  rightLabel?: string;
}

export function SymptomScale({
  value,
  onChange,
  previousValue = null,
  ariaLabel,
  leftLabel,
  rightLabel,
}: SymptomScaleProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef({ active: false, pointerId: -1, dragging: false });
  const safeValue = typeof value === 'number' ? clamp(Math.round(value), 1, 10) : null;
  const safePrevious = typeof previousValue === 'number' ? clamp(Math.round(previousValue), 1, 10) : null;

  const dots = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);

  const getValueFromClientX = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return safeValue ?? 1;
    const rect = wrap.getBoundingClientRect();
    const relative = clamp(clientX - rect.left, 0, rect.width);
    const segment = rect.width / 10;
    if (!segment) return safeValue ?? 1;
    return clamp(Math.round(relative / segment + 0.5), 1, 10);
  };

  const commitValue = (next: number, allowClear = false) => {
    if (allowClear && safeValue === next) {
      onChange(undefined);
      return;
    }
    if (next !== safeValue) onChange(next);
  };

  const commitFromPointer = (clientX: number) => {
    const next = getValueFromClientX(clientX);
    if (next !== safeValue) onChange(next);
  };

  return (
    <div className="w-full">
      <div
        ref={wrapRef}
        className="flex items-center gap-2 select-none touch-pan-y"
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={safeValue ?? 0}
        aria-valuetext={safeValue ? `${safeValue} out of 10` : 'Not set'}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clamp((safeValue ?? 0) + 1, 1, 10));
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (safeValue == null || safeValue <= 1) onChange(undefined);
            else onChange(clamp(safeValue - 1, 1, 10));
          }
          if (e.key === 'Home' || e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onChange(undefined);
          }
          if (e.key === 'End') {
            e.preventDefault();
            onChange(10);
          }
        }}
        onPointerDown={(e) => {
          pointerStateRef.current = { active: true, pointerId: e.pointerId, dragging: false };
          (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
          commitFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          const state = pointerStateRef.current;
          if (!state.active || state.pointerId !== e.pointerId) return;
          state.dragging = true;
          commitFromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          const state = pointerStateRef.current;
          if (state.pointerId !== e.pointerId) return;
          if (!state.dragging) {
            commitValue(getValueFromClientX(e.clientX), true);
          }
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false };
        }}
        onPointerCancel={() => {
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false };
        }}
      >
        {dots.map((dot) => {
          const active = safeValue != null && dot <= safeValue;
          const previousHere = safePrevious === dot;
          const selectedHere = safeValue === dot;
          return (
            <button
              key={dot}
              type="button"
              className="relative h-11 flex-1 min-w-0 rounded-full transition-transform active:scale-[0.98]"
              onClick={() => commitValue(dot, true)}
              aria-label={`${ariaLabel} ${dot} out of 10`}
              aria-pressed={selectedHere}
            >
              <span
                className={[
                  'absolute left-1/2 top-1/2 block rounded-full border transition-all',
                  active
                    ? 'shadow-sm border-transparent'
                    : 'border-[rgb(var(--color-primary)/0.34)] bg-[rgb(var(--color-primary-light)/0.18)]'
                ].join(' ')}
                style={{
                  width: selectedHere ? '1.3rem' : '1.12rem',
                  height: selectedHere ? '1.3rem' : '1.12rem',
                  transform: 'translate(-50%, -50%)',
                  background: active ? `rgb(var(--color-primary) / ${dotOpacity(dot)})` : undefined,
                  boxShadow: selectedHere ? '0 0 0 1px rgb(var(--color-primary-dark) / 0.18)' : undefined,
                }}
              />
              {previousHere && !selectedHere ? (
                <span
                  className="absolute left-1/2 top-1/2 block rounded-full border border-[rgb(var(--color-primary-dark)/0.42)]"
                  style={{ width: '1.55rem', height: '1.55rem', transform: 'translate(-50%, -50%)' }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {(leftLabel || rightLabel) ? (
        <div className="mt-2 flex items-center justify-between px-0.5 text-[11px] font-medium text-[rgb(var(--color-text-secondary))]">
          <span>{leftLabel ?? ''}</span>
          <span>{rightLabel ?? ''}</span>
        </div>
      ) : null}
    </div>
  );
}

export default SymptomScale;
