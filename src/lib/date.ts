// Date helpers that use the *local* day (not UTC).
// This avoids off-by-one errors around midnight when using toISOString().

export function isoFromDateLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isoTodayLocal(): string {
  return isoFromDateLocal(new Date());
}
