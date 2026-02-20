export type UserGoal = 'cycle-health' | 'perimenopause' | 'post-contraception' | 'wellbeing';
export type ColorTheme = 'sage' | 'lavender' | 'ocean' | 'terracotta';

export type CycleTrackingMode = 'cycle' | 'no-cycle';

export type SymptomKey =
  | 'energy'
  | 'motivation'
  | 'sleep'
  | 'insomnia'
  | 'pain'
  | 'headache'
  | 'migraine'
  | 'backPain'
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
  | 'constipation'
  | 'diarrhoea'
  | 'acidReflux'
  | 'hairShedding'
  | 'facialSpots'
  | 'cysts'
  | 'skinDryness'
  | 'brainFog'
  | 'fatigue'
  | 'dizziness'
  | 'appetite'
  | 'libido'
  | 'breastTenderness'
  | 'hotFlushes'
  | 'nightSweats'
  | 'restlessLegs';

/** Metrics that can be shown on the dashboard chart */
export type DashboardMetric = SymptomKey | 'mood';

export type SymptomKind = 'behaviour' | 'state' | 'physio' | 'hormonal' | 'other';

export type InfluenceKey =
  | 'sex'
  | 'exercise'
  | 'travel'
  | 'illness'
  | 'alcohol'
  | 'lateNight'
  | 'stressfulDay'
  | 'medication'
  | 'caffeine'
  | 'socialising'
  | 'lowHydration';

export interface CustomSymptom {
  id: string;
  label: string;
  enabled: boolean;
  /** Optional: what kind of symptom this is (used for safer insights + experiments). */
  kind?: SymptomKind;
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

  /** Which lifestyle / influence toggles show in the daily check-in */
  enabledInfluences?: InfluenceKey[];

    /** Optional: show extra sleep detail questions in the daily check-in (collapsed by default). */
  sleepDetailsEnabled?: boolean;

  /** Optional: show sleep charts and pattern views in Insights. */
  sleepInsightsEnabled?: boolean;

  /** Optional: Fitbit import toggle (wiring prepared; can be switched on later). */
  fitbitEnabled?: boolean;

/** True once we've applied goal-based defaults during first onboarding (prevents future goal changes auto-resetting settings). */
  onboardingPresetApplied?: boolean;

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

  /** Optional: ignore older check-ins for Insights (keeps data saved, but Insights only uses entries on/after this date). */
  insightsFromISO?: string | null;

  /** Optional: per-metric cutoff for Insights. Keyed by metric id (eg "sleep" or "custom:abc"). */
  metricRetiredFromISO?: Record<string, string>;

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

  /** Optional extra sleep detail fields (not part of the 0–10 symptom sliders) */
  sleepDetails?: {
    /** 0, 1, 2, or 3 (meaning 3+) */
    timesWoke?: 0 | 1 | 2 | 3;
    /** 0 none, 1 a bit, 2 a lot */
    troubleFallingAsleep?: 0 | 1 | 2;
    wokeTooEarly?: boolean;
  };

  /** Optional non-symptom events (kept separate from symptom modules) */
  events?: {
    /** Intimacy logged for the day (kept private) */
    sex?: boolean;
    /** Exercise (any workout or brisk activity) */
    exercise?: boolean;
    /** Travel or major routine change */
    travel?: boolean;
    /** Illness (cold/flu/infection/feeling unwell) */
    illness?: boolean;
    /** Alcohol (more than usual) */
    alcohol?: boolean;
    /** Late night or disrupted sleep routine */
    lateNight?: boolean;
    /** Stressful day */
    stressfulDay?: boolean;
    /** Medication taken (yes/no influence) */
    medication?: boolean;
    /** Higher caffeine than usual */
    caffeine?: boolean;
    /** More social than usual (or big social event) */
    socialising?: boolean;
    /** Low hydration */
    lowHydration?: boolean;
  };

  /** Optional extra details for events (kept small and future-proof). */
  eventsDetails?: {
    /** If exercise is logged, how intense did it feel? */
    exerciseIntensity?: 'light' | 'moderate' | 'hard';
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
  /** What the user is changing (influence tag), e.g. caffeine, medication, lateNight */
  changeKey?: string;
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
