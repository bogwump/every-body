import { BACKUP_KEYS, applyBackupPayload, hydrateForBackup, type BackupPayload } from "./appStore";

export type BackupFileV1 = {
  type: "everybody-backup";
  version: 1;
  generatedAtISO: string;
  data: BackupPayload;
};

export type BackupFileV2 = {
  type: "everybody-backup";
  version: 2;
  generatedAtISO: string;
  app: "EveryBody";
  includesKeys: string[];
  data: BackupPayload;
};

// Backward compat with earlier builds that used { app: "EveryBody", version: 1, exportedAtISO, payload }
type LegacyBackupFile = {
  app: "EveryBody";
  version: 1;
  exportedAtISO: string;
  payload: BackupPayload;
};

export type BackupFile = BackupFileV2 | BackupFileV1 | LegacyBackupFile;

export async function makeBackupFile(): Promise<BackupFileV2> {
  await hydrateForBackup();
  const data: BackupPayload = {};
  for (const key of BACKUP_KEYS) {
    data[key] = localStorage.getItem(key);
  }
  return {
    type: "everybody-backup",
    version: 2,
    generatedAtISO: new Date().toISOString(),
    app: "EveryBody",
    includesKeys: [...BACKUP_KEYS],
    data,
  };
}

function filenameForBackup(iso: string) {
  return `everybody-backup-${iso.slice(0, 10)}.json`;
}

export function downloadBackupFile(file: BackupFile) {
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const iso = ("generatedAtISO" in file ? file.generatedAtISO : file.exportedAtISO);
  a.download = filenameForBackup(iso);
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
    const iso = ("generatedAtISO" in file ? file.generatedAtISO : file.exportedAtISO);
    const f = new File([blob], filenameForBackup(iso), { type: "application/json" });
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

export function parseBackupJson(raw: string): BackupFileV2 | BackupFileV1 | LegacyBackupFile | null {
  try {
    const obj: any = JSON.parse(raw);

    // Preferred, explicit backup format
    if (obj?.type === "everybody-backup" && (obj?.version === 2 || obj?.version === 1) && obj?.data && typeof obj.data === "object") {
      return obj as BackupFileV2 | BackupFileV1;
    }

    // Legacy format (keep supporting older user backups)
    if (obj?.app === "EveryBody" && obj?.version === 1 && obj?.payload && typeof obj.payload === "object") {
      return obj as LegacyBackupFile;
    }

    return null;
  } catch {
    return null;
  }
}

export function looksLikeInsightsExport(raw: string): boolean {
  try {
    const obj: any = JSON.parse(raw);
    if (obj?.type === "everybody-insights-export") return true;
    // Legacy insights export shape (pre-versioning)
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.generatedAt === "string" &&
      typeof obj.timeframe === "string" &&
      Array.isArray(obj.selectedMetrics) &&
      Array.isArray(obj.entries)
    );
  } catch {
    return false;
  }
}

export function importBackupFile(file: BackupFile) {
  const payload = ("data" in file ? file.data : file.payload);
  applyBackupPayload(payload);
}
