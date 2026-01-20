export const USER_KEY = 'everybody:user:v2';
export const ENTRIES_KEY = 'everybody:entries:v1';

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    return safeJsonParse<T>(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    const raw = safeJsonStringify(value);
    if (raw) {
      localStorage.setItem(key, raw);
      // Notify same-tab listeners. The native "storage" event only fires across documents.
      window.dispatchEvent(new CustomEvent('everybody:storage', { detail: { key } }));
    }
  } catch {
    // ignore
  }
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
