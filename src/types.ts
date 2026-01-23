export type UserGoal = 'cycle-health' | 'perimenopause' | 'post-contraception' | 'wellbeing';
export type ColorTheme = 'sage' | 'lavender' | 'ocean' | 'terracotta';

export type CycleTrackingMode = 'cycle' | 'no-cycle';

export type SymptomKey =
  | 'energy'
  | 'sleep'
  | 'pain'
  | 'flow'
  | 'stress'
  | 'focus'
  | 'bloating'
  | 'hairShedding'
  | 'facialSpots'
  | 'cysts'
  | 'brainFog'
  | 'fatigue'
  | 'nightSweats';

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


}

export interface CheckInEntry {
  id: string;
  dateISO: string; // YYYY-MM-DD
  /** Manually mark this day as a new cycle start (day 1) */
  cycleStartOverride?: boolean;
  /** Mood chosen on the 3-point picker */
  mood?: 1 | 2 | 3;
  notes?: string;
  /** Per-module values 0-100 */
  values: Partial<Record<SymptomKey, number>>;

  /** Optional non-symptom events (kept separate from symptom modules) */
  events?: {
    /** Sex logged for the day (only shown when Fertility mode is enabled) */
    sex?: boolean;
  };
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
