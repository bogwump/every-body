import React from 'react';

function CompanionHandIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12.4 6.2c.9-1.2 2.2-2 3.8-2 2.7 0 4.8 2.1 4.8 4.8 0 4.6-5 7.4-8.2 9.9-3.2-2.5-8.2-5.3-8.2-9.9 0-2.7 2.1-4.8 4.8-4.8 1.6 0 2.9.8 3.8 2Z" />
      <path d="M7.3 14.4h3.4c.8 0 1.3.4 1.6 1.1l.5 1.2c.2.4.5.6 1 .6h1.8c.7 0 1.2.6 1.2 1.2 0 .7-.5 1.2-1.2 1.2h-4.2c-1.1 0-1.9-.3-2.8-1l-1.6-1.3H5.4" />
      <path d="M5.4 13.9v5.5" />
    </svg>
  );
}

export function WhatsHelpingCard(props: { items: string[] }) {
  if (!props.items.length) return null;

  return (
    <div className="eb-card">
      <div className="eb-card-header">
        <div>
          <div className="eb-card-title">What&apos;s helping lately</div>
          <div className="eb-card-sub">A gentle read on what has looked useful for your body before.</div>
        </div>
        <CompanionHandIcon className="w-5 h-5 text-[rgb(var(--color-accent))]" />
      </div>
      <div className="mt-5 space-y-3">
        {props.items.slice(0, 3).map((item) => (
          <div key={item} className="eb-inset rounded-2xl p-4 text-sm eb-muted">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
