export type DebugEntry = {
  atISO: string;
  scope: string;
  message: string;
  details?: string;
};

const DEBUG_KEY = 'everybody:v2:runtime_debug';
const MAX_ENTRIES = 40;

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function serialiseError(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n');
  }
  if (typeof error === 'object') return safeStringify(error);
  return String(error);
}

export function readRuntimeDebug(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DebugEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeRuntimeDebug(entries: DebugEntry[]): void {
  try {
    localStorage.setItem(DEBUG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

export function pushRuntimeDebug(scope: string, message: string, details?: unknown): void {
  const next: DebugEntry = {
    atISO: new Date().toISOString(),
    scope,
    message,
    details: details == null ? undefined : safeStringify(details),
  };
  const entries = readRuntimeDebug();
  entries.push(next);
  writeRuntimeDebug(entries);
  try {
    console.error(`[EveryBody][${scope}] ${message}`, details ?? '');
  } catch {
    // ignore
  }
}

export function clearRuntimeDebug(): void {
  try {
    localStorage.removeItem(DEBUG_KEY);
  } catch {
    // ignore
  }
}
