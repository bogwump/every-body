import React, { useMemo, useRef, useState } from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dotFillAlpha(index: number) {
  return 0.18 + index * 0.06;
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
  const pointerStateRef = useRef({ active: false, pointerId: -1, dragging: false, startX: 0, suppressClick: false });
  const [animatingDot, setAnimatingDot] = useState<number | null>(null);
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

  const triggerTapAnimation = (dot: number) => {
    setAnimatingDot(dot);
    window.setTimeout(() => {
      setAnimatingDot((current) => (current === dot ? null : current));
    }, 150);
  };

  const commitValue = (next: number, allowClear = false) => {
    triggerTapAnimation(next);
    if (allowClear && safeValue === next) {
      onChange(undefined);
      return;
    }
    if (next !== safeValue) onChange(next);
  };

  const commitFromPointer = (clientX: number) => {
    const next = getValueFromClientX(clientX);
    if (next !== safeValue) {
      triggerTapAnimation(next);
      onChange(next);
    }
  };

  return (
    <div className="w-full">
      <div
        ref={wrapRef}
        className="flex items-center gap-2.5 select-none touch-pan-y"
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
          pointerStateRef.current = {
            active: true,
            pointerId: e.pointerId,
            dragging: false,
            startX: e.clientX,
            suppressClick: false,
          };
          (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const state = pointerStateRef.current;
          if (!state.active || state.pointerId !== e.pointerId) return;
          if (Math.abs(e.clientX - state.startX) > 6) {
            state.dragging = true;
            state.suppressClick = true;
          }
          if (state.dragging) commitFromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          const state = pointerStateRef.current;
          if (state.pointerId !== e.pointerId) return;
          if (state.dragging) {
            e.preventDefault();
            commitFromPointer(e.clientX);
          }
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false, startX: 0, suppressClick: state.suppressClick };
          window.setTimeout(() => {
            pointerStateRef.current.suppressClick = false;
          }, 0);
        }}
        onPointerCancel={() => {
          pointerStateRef.current = { active: false, pointerId: -1, dragging: false, startX: 0, suppressClick: false };
        }}
      >
        {dots.map((dot) => {
          const active = safeValue != null && dot <= safeValue;
          const previousHere = safePrevious === dot;
          const selectedHere = safeValue === dot;
          const pulsing = animatingDot === dot;
          return (
            <button
              key={dot}
              type="button"
              className="relative h-11 flex-1 min-w-0 rounded-full"
              onClick={(e) => {
                if (pointerStateRef.current.suppressClick) {
                  e.preventDefault();
                  return;
                }
                commitValue(dot, true);
              }}
              aria-label={`${ariaLabel} ${dot} out of 10`}
              aria-pressed={selectedHere}
            >
              <span
                className="absolute left-1/2 top-1/2 block rounded-full border"
                style={{
                  width: selectedHere ? '1.38rem' : '1.16rem',
                  height: selectedHere ? '1.38rem' : '1.16rem',
                  transform: `translate(-50%, -50%) scale(${pulsing ? 1.1 : 1})`,
                  transition: 'transform 150ms cubic-bezier(0.22, 1, 0.36, 1), background-color 140ms ease, border-color 140ms ease, width 140ms ease, height 140ms ease, box-shadow 140ms ease',
                  background: active ? `rgb(var(--color-primary) / ${selectedHere ? 0.92 : dotFillAlpha(dot)})` : 'rgb(var(--color-surface))',
                  borderColor: active ? `rgb(var(--color-primary) / ${selectedHere ? 0.96 : 0.55})` : 'rgb(var(--color-primary) / 0.42)',
                  boxShadow: selectedHere ? '0 8px 18px rgb(var(--color-primary-dark) / 0.16)' : 'none',
                }}
              />
              {previousHere && !selectedHere ? (
                <span
                  className="absolute left-1/2 top-1/2 block rounded-full border"
                  style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    transform: 'translate(-50%, -50%)',
                    borderColor: 'rgb(var(--color-primary-dark) / 0.30)',
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {(leftLabel || rightLabel) ? (
        <div className="mt-3 flex items-center justify-between px-0.5 text-[11px] font-medium text-[rgb(var(--color-text-secondary)/0.92)]">
          <span>{leftLabel ?? ''}</span>
          <span>{rightLabel ?? ''}</span>
        </div>
      ) : null}
    </div>
  );
}

export default SymptomScale;
