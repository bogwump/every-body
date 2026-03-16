import React from 'react';

export function CompanionHandIcon(props: { className?: string }) {
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
