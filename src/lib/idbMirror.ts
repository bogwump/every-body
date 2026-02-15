/**
 * Minimal IndexedDB key/value helper for "self-healing" local storage.
 * Goal: if iOS/Safari clears localStorage unexpectedly, we can restore
 * from IndexedDB when available. Still device-only (no cloud).
 */
const DB_NAME = "everybody-db";
const STORE = "kv";
const VERSION = 1;

type IDBValue = string; // we store raw JSON strings

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function idbGet(key: string): Promise<IDBValue | null> {
  try {
    const v = await withStore<IDBValue | undefined>("readonly", (s) => s.get(key));
    return (v ?? null);
  } catch {
    return null;
  }
}

export async function idbSet(key: string, value: IDBValue): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(value, key));
  } catch {
    // ignore (best-effort)
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(key));
  } catch {}
}

/**
 * One-time hydration:
 * - If localStorage missing but IDB has data -> restore to localStorage.
 * - If localStorage has data but IDB missing -> seed IDB.
 *
 * Returns true if anything was restored into localStorage.
 */
export async function hydrateFromIDB(keys: string[]): Promise<boolean> {
  let restored = false;
  for (const key of keys) {
    try {
      const ls = localStorage.getItem(key);
      const idb = await idbGet(key);
      if ((ls == null || ls === "") && idb != null) {
        localStorage.setItem(key, idb);
        restored = true;
      } else if (ls != null && ls !== "" && (idb == null || idb === "")) {
        await idbSet(key, ls);
      }
    } catch {
      // ignore
    }
  }
  return restored;
}
