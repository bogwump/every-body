import React from 'react';
import { FlaskConical, Bookmark, X } from 'lucide-react';

export type TryNextItem = {
  id: string;
  title: string;
  description: string;
  label?: string;
  saved?: boolean;
};

export function TryNextCard(props: {
  items: TryNextItem[];
  onStart: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (!props.items.length) return null;

  return (
    <div className="eb-card">
      <div className="eb-card-header">
        <div>
          <div className="eb-card-title">Try this next</div>
          <div className="eb-card-sub">A small next step based on what has been standing out.</div>
        </div>
        <FlaskConical className="w-5 h-5" style={{ color: 'rgb(var(--color-accent))' }} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {props.items.slice(0, 2).map((item) => (
          <div key={item.id} className="eb-inset rounded-2xl p-5 h-full flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">{item.title}</div>
              {item.label ? <span className="eb-pill">{item.label}</span> : null}
            </div>
            <div className="mt-2 text-sm eb-muted">{item.description}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="eb-btn-primary" onClick={() => props.onStart(item.id)}>
                Start experiment
              </button>
              <button type="button" className="eb-btn-secondary inline-flex items-center gap-2" onClick={() => props.onSave(item.id)}>
                <Bookmark className="w-4 h-4" />
                {item.saved ? 'Saved' : 'Save for later'}
              </button>
              <button type="button" className="eb-btn-secondary inline-flex items-center gap-2" onClick={() => props.onDismiss(item.id)}>
                <X className="w-4 h-4" />
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
