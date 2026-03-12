import React, { useMemo, useRef } from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dotOpacity(index: number) {
  return 0.18 + index * 0.075;
}

export interface SymptomScaleProps {
  value: number;
  onChange: (value: number) => void;
  previousValue?: number | null;
  ariaLabel: string;
}

export function SymptomScale({ value, onChange, previousValue = null, ariaLabel }: SymptomScaleProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef({ active: false, pointerId: -1, dragging: false });
  const safeValue = clamp(Math.round(value), 0, 10);
  const safePrevious = typeof previousValue === 'number' ? clamp(Math.round(previousValue), 0, 10) : null;

  const dots = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);

  const getValueFromClientX = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return safeValue;
    const rect = wrap.getBoundingClientRect();
    const relative = clamp(clientX - rect.left, 0, rect.width);
    const segment = rect.width / 10;
    if (!segment) return safeValue;
    return clamp(Math.round(relative / segment + 0.5), 1, 10);
  };

  const commitFromPointer = (clientX: number) => {
    const next = getValueFromClientX(clientX);
    if (next !== safeValue) onChange(next);
  };

  return (
    <div className="w-full">
      <div
        ref={wrapRef}
        className="flex items-center gap-1.5 select-none touch-pan-y"
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={safeValue}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clamp(safeValue + 1, 0, 10));
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(safeValue - 1, 0, 10));
          }
          if (e.key === 'Home') {
            e.preventDefault();
            onChange(0);
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
          commitFromPointer(e.clientX);
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false };
        }}
        onPointerCancel={() => {
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false };
        }}
      >
        <button
          type="button"
          className={[
            'shrink-0 h-9 min-w-9 rounded-full border text-[11px] font-semibold transition-all',
            safeValue === 0
              ? 'border-[rgb(var(--color-primary-dark)/0.2)] bg-[rgb(var(--color-primary-light)/0.16)] text-[rgb(var(--color-primary-dark))] shadow-sm'
              : 'border-[rgba(0,0,0,0.08)] bg-white text-[rgb(var(--color-text-secondary))]'
          ].join(' ')}
          onClick={() => onChange(0)}
          aria-label={`${ariaLabel} 0 out of 10`}
        >
          0
        </button>

        {dots.map((dot) => {
          const active = dot <= safeValue && safeValue > 0;
          const previousHere = safePrevious === dot;
          return (
            <button
              key={dot}
              type="button"
              className="relative h-10 flex-1 min-w-0 rounded-full transition-transform active:scale-[0.98]"
              onClick={() => onChange(dot)}
              aria-label={`${ariaLabel} ${dot} out of 10`}
            >
              <span
                className={[
                  'absolute left-1/2 top-1/2 block rounded-full border transition-all',
                  active
                    ? 'shadow-sm border-transparent'
                    : 'border-[rgb(var(--color-primary)/0.18)] bg-[rgb(var(--color-primary-light)/0.08)]'
                ].join(' ')}
                style={{
                  width: active ? '1.15rem' : '1rem',
                  height: active ? '1.15rem' : '1rem',
                  transform: 'translate(-50%, -50%)',
                  background: active ? `rgb(var(--color-primary) / ${dotOpacity(dot)})` : undefined,
                }}
              />
              {previousHere && !active ? (
                <span
                  className="absolute left-1/2 top-1/2 block rounded-full border border-[rgb(var(--color-primary-dark)/0.32)]"
                  style={{ width: '1.35rem', height: '1.35rem', transform: 'translate(-50%, -50%)' }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SymptomScale;
