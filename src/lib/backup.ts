import { STORAGE_KEYS, applyBackupPayload, type BackupPayload } from "./appStore";

export type BackupFile = {
  app: "EveryBody";
  version: 1;
  exportedAtISO: string;
  payload: BackupPayload;
};

export function makeBackupFile(): BackupFile {
  const payload: BackupPayload = {};
  for (const key of STORAGE_KEYS) {
    payload[key] = localStorage.getItem(key);
  }
  return {
    app: "EveryBody",
    version: 1,
    exportedAtISO: new Date().toISOString(),
    payload,
  };
}

export function downloadBackupFile(file: BackupFile) {
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `everybody-backup-${file.exportedAtISO.slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareOrDownloadBackup(file: BackupFile) {
  // iOS supports Web Share for files in many cases, but not always.
  try {
    const json = JSON.stringify(file, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const f = new File([blob], `everybody-backup-${file.exportedAtISO.slice(0,10)}.json`, { type: "application/json" });
    const nav: any = navigator;
    if (nav?.canShare?.({ files: [f] }) && nav?.share) {
      await nav.share({ files: [f], title: "EveryBody backup" });
      return;
    }
  } catch {
    // fall back
  }
  downloadBackupFile(file);
}

export function parseBackupJson(raw: string): BackupFile | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.app !== "EveryBody" || obj.version !== 1) return null;
    if (!obj.payload || typeof obj.payload !== "object") return null;
    return obj as BackupFile;
  } catch {
    return null;
  }
}

export function importBackupFile(file: BackupFile) {
  applyBackupPayload(file.payload);
}
