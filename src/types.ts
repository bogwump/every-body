export type UserGoal = 'cycle-health' | 'perimenopause' | 'post-contraception' | 'wellbeing';
export type ColorTheme = 'sage' | 'lavender' | 'ocean' | 'terracotta';

export type CycleTrackingMode = 'cycle' | 'no-cycle';

export type SymptomKey =
  | 'energy'
  | 'sleep'
  | 'pain'
  | 'headache'
  | 'cramps'
  | 'jointPain'
  | 'flow'
  | 'stress'
  | 'anxiety'
  | 'irritability'
  | 'focus'
  | 'bloating'
  | 'digestion'
  | 'nausea'
  | 'acidReflux'
  | 'hairShedding'
  | 'facialSpots'
  | 'cysts'
  | 'brainFog'
  | 'fatigue'
  | 'dizziness'
  | 'appetite'
  | 'libido'
  | 'breastTenderness'
  | 'hotFlushes'
  | 'nightSweats';

/** Metrics that can be shown on the dashboard chart */
export type DashboardMetric = SymptomKey | 'mood';

export interface CustomSymptom {
  id: string;
  label: string;
  enabled: boolean;
}


export interface UserData {
  name: string;
  goal: UserGoal | null;
  colorTheme: ColorTheme;
  onboardingComplete: boolean;
  /** Whether to use cycle-phase features (period tracking). Users can still track symptoms in all modes. */
  cycleTrackingMode: CycleTrackingMode;
  /** Show the small cycle-length bubble on the Dashboard hero (only relevant when cycle tracking is on) */
  showCycleBubble: boolean;
  /** Which symptom modules are enabled for the daily check-in */
  enabledModules: SymptomKey[];

  /** Optional: user-defined custom symptoms (freeform). Stored as ids + labels. */
  customSymptoms?: CustomSymptom[];

  /** Dev/testing: use local mock Eve (no API calls) */
  useMockEve: boolean;
  /** Reduce context length and reply size for cheaper API usage */
  eveLowCostMode: boolean;
  /** Optional: cloud sync (local-first). Default off. */
  cloudSyncEnabled?: boolean;
  /** Which cloud provider to use when cloudSyncEnabled is on */
  cloudProvider?: 'supabase';
  /** Optional: profile photo stored locally as a Data URL */
  avatarDataUrl?: string;
  /** Optional: selected built-in avatar icon */
  avatarStockId?: string;

  /** Optional: trying to conceive mode (enables fertility features like sex log + fertile window shading) */
  fertilityMode?: boolean;

  /** Optional: if enabled, starting bleeding automatically starts a new period without asking. */
  autoStartPeriodFromBleeding?: boolean;

  /** Optional: which 3 metrics to show on the dashboard "week at a glance" chart */
  dashboardChartMetrics?: [DashboardMetric, DashboardMetric, DashboardMetric];

  /** Optional: user-confirmed ovulation dates (YYYY-MM-DD) to override predicted fertile windows */
  ovulationOverrideISOs?: string[];

}


export interface CheckInEntry {
  id: string;
  dateISO: string; // YYYY-MM-DD
  /** Manually mark this day as a new cycle start (day 1) */
  cycleStartOverride?: boolean;
  breakthroughBleed?: boolean;
  /** Mood chosen on the 3-point picker */
  mood?: 1 | 2 | 3;
  notes?: string;
  /** Per-module values 0-10 */
  values: Partial<Record<SymptomKey, number>>;

  /** Optional custom symptom values keyed by CustomSymptom.id (0-10) */
  customValues?: Record<string, number>;

  /** Optional non-symptom events (kept separate from symptom modules) */
  events?: {
    /** Sex logged for the day (only shown when Fertility mode is enabled) */
    sex?: boolean;
  };
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/**
 * A lightweight in-app “experiment” the user can run for a few days.
 * Stored locally only.
 */
export type InsightMetricKey = SymptomKey | 'mood' | `custom:${string}`;

export interface ExperimentPlan {
  id: string;
  title: string;
  startDateISO: string; // YYYY-MM-DD
  durationDays: number;
  /** Which metrics to focus on logging during the experiment */
  metrics: InsightMetricKey[];
  /** Small, realistic steps */
  steps: string[];
  /** A short coaching note */
  note: string;

  /** Optional outcome captured at the end of the experiment */
  outcome?: {
    /** 1–5 quick rating */
    rating?: 1 | 2 | 3 | 4 | 5;
    /** Freeform note */
    note?: string;
    /** When the user completed the experiment */
    completedAtISO?: string;
  };
}
