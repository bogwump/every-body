import type { UserData } from "../types";

/**
 * Single source of truth for a clean "day 1" user state.
 * Used by onboarding + the "Reset app data" actions.
 */
export const DEFAULT_USER: UserData = {
  name: "",
  goal: null,
  colorTheme: "sage",
  onboardingComplete: false,
  cycleTrackingMode: "cycle",
  showCycleBubble: true,

  // Eve (dev defaults)
  useMockEve: true,
  eveLowCostMode: true,

  // Cycle / fertility
  fertilityMode: false,
  autoStartPeriodFromBleeding: false,
  ovulationOverrideISOs: [],

  // What you track (light by default)
  customSymptoms: [],
  enabledModules: ["energy", "sleep", "stress", "focus", "bloating", "flow"],
  enabledInfluences: ["stressfulDay", "lateNight", "alcohol"],

  // Optional modules
  sleepDetailsEnabled: false,
  sleepInsightsEnabled: true,
  fitbitEnabled: false,

  onboardingPresetApplied: false,

  // Insights scoping
  insightsFromISO: null,
  metricRetiredFromISO: {},
};
