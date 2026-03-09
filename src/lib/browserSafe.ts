export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function parseISODateLocal(iso?: string | null): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isValidDate(dt) ? dt : null;
}

function fallbackDateString(date: Date, includeYear = true): string {
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()] ?? 'Unknown';
  return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`;
}

export function safeFormatDate(date: Date, options?: Intl.DateTimeFormatOptions, fallback?: string): string {
  if (!isValidDate(date)) return fallback ?? '';
  try {
    return date.toLocaleDateString(undefined, options);
  } catch {
    const includeYear = Boolean(options?.year);
    return fallback ?? fallbackDateString(date, includeYear);
  }
}

export function safeFormatISODate(iso: string, options?: Intl.DateTimeFormatOptions, fallback?: string): string {
  const dt = parseISODateLocal(iso);
  if (!dt) return fallback ?? iso;
  return safeFormatDate(dt, options, fallback ?? iso);
}

export function safeFormatMonthYearFromKey(key: string): string {
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dt = new Date(year, month - 1, 1);
  return safeFormatDate(dt, { month: 'long', year: 'numeric' }, key);
}

export function safeScrollIntoView(element: Element | null | undefined, options?: ScrollIntoViewOptions): void {
  if (!element || typeof (element as any).scrollIntoView !== 'function') return;
  try {
    element.scrollIntoView(options);
  } catch {
    try {
      element.scrollIntoView();
    } catch {
      // ignore
    }
  }
}

export function hasResizeObserver(): boolean {
  try {
    return typeof window !== 'undefined' && typeof (window as any).ResizeObserver === 'function';
  } catch {
    return false;
  }
}
