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
  /** Which symptom modules are enabled for the daily check-in */
  enabledModules: SymptomKey[];
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
  createdAt: string; // ISO
  updatedAt: string; // ISO
}