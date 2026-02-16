import type { SymptomKey, SymptomKind } from '../types';

export type SymptomMeta = {
  key: SymptomKey;
  label: string;
  description: string;
  kind: SymptomKind;
  /** True for symptoms that are commonly hormone-driven (helps keep insights safe). */
  hormonal: boolean;
};

// Keep this intentionally simple and conservative.
// Goal: avoid over-claiming, and avoid suggesting experiments for hormone-driven signals.
export const SYMPTOM_META: Record<SymptomKey, SymptomMeta> = {
  energy: {
    key: 'energy',
    label: 'Energy',
    description: 'How much fuel you have in the tank',
    kind: 'state',
    hormonal: false,
  },
  motivation: {
    key: 'motivation',
    label: 'Motivation',
    description: 'Drive and willingness to do things',
    kind: 'state',
    hormonal: true,
  },
  sleep: {
    key: 'sleep',
    label: 'Sleep quality',
    description: 'Quality of sleep, not just hours',
    kind: 'state',
    hormonal: false,
  },
  insomnia: {
    key: 'insomnia',
    label: 'Insomnia',
    description: 'Trouble falling or staying asleep',
    kind: 'state',
    hormonal: true,
  },
  stress: {
    key: 'stress',
    label: 'Stress',
    description: 'Mental pressure or feeling on edge',
    kind: 'state',
    hormonal: false,
  },
  anxiety: {
    key: 'anxiety',
    label: 'Anxiety',
    description: 'Worry, racing thoughts',
    kind: 'state',
    hormonal: false,
  },
  irritability: {
    key: 'irritability',
    label: 'Irritability',
    description: 'Short fuse, feeling snappy',
    kind: 'state',
    hormonal: true,
  },
  focus: {
    key: 'focus',
    label: 'Focus',
    description: 'Concentration and mental sharpness',
    kind: 'state',
    hormonal: false,
  },
  bloating: {
    key: 'bloating',
    label: 'Bloating',
    description: 'Fullness or swollen belly feeling',
    kind: 'physio',
    hormonal: true,
  },
  digestion: {
    key: 'digestion',
    label: 'Digestion',
    description: 'Gut comfort and regularity',
    kind: 'physio',
    hormonal: false,
  },
  nausea: {
    key: 'nausea',
    label: 'Nausea',
    description: 'Sick or queasy feeling',
    kind: 'physio',
    hormonal: false,
  },
  constipation: {
    key: 'constipation',
    label: 'Constipation',
    description: 'Hard stools or difficulty going',
    kind: 'physio',
    hormonal: false,
  },
  diarrhoea: {
    key: 'diarrhoea',
    label: 'Diarrhoea',
    description: 'Loose stools or urgent bathroom trips',
    kind: 'physio',
    hormonal: false,
  },
  pain: {
    key: 'pain',
    label: 'Pain',
    description: 'Overall body pain or aches',
    kind: 'physio',
    hormonal: false,
  },
  headache: {
    key: 'headache',
    label: 'Headache',
    description: 'Head pain or pressure',
    kind: 'physio',
    hormonal: true,
  },
  migraine: {
    key: 'migraine',
    label: 'Migraine',
    description: 'Migraine-type headache (light/sound sensitivity, nausea etc)',
    kind: 'physio',
    hormonal: true,
  },
  backPain: {
    key: 'backPain',
    label: 'Back pain',
    description: 'Lower or upper back pain',
    kind: 'physio',
    hormonal: true,
  },
  cramps: {
    key: 'cramps',
    label: 'Cramps',
    description: 'Lower belly cramps or spasms',
    kind: 'physio',
    hormonal: true,
  },
  jointPain: {
    key: 'jointPain',
    label: 'Joint pain',
    description: 'Stiff or sore joints',
    kind: 'physio',
    hormonal: true,
  },
  flow: {
    key: 'flow',
    label: 'Bleeding / spotting (optional)',
    description: 'Bleeding or spotting level',
    kind: 'hormonal',
    hormonal: true,
  },
  hairShedding: {
    key: 'hairShedding',
    label: 'Hair shedding',
    description: 'More hair loss than usual',
    kind: 'hormonal',
    hormonal: true,
  },
  facialSpots: {
    key: 'facialSpots',
    label: 'Facial spots',
    description: 'Breakouts or spots on face',
    kind: 'hormonal',
    hormonal: true,
  },
  cysts: {
    key: 'cysts',
    label: 'Cysts',
    description: 'Painful lumps or cystic spots',
    kind: 'hormonal',
    hormonal: true,
  },
  skinDryness: {
    key: 'skinDryness',
    label: 'Skin dryness',
    description: 'Dry, itchy, or sensitive skin',
    kind: 'hormonal',
    hormonal: true,
  },
  brainFog: {
    key: 'brainFog',
    label: 'Brain fog',
    description: 'Foggy thinking, forgetfulness',
    kind: 'state',
    hormonal: true,
  },
  fatigue: {
    key: 'fatigue',
    label: 'Fatigue',
    description: 'Heavy tiredness or drained feeling',
    kind: 'state',
    hormonal: true,
  },
  dizziness: {
    key: 'dizziness',
    label: 'Dizziness',
    description: 'Light-headed or unsteady',
    kind: 'physio',
    hormonal: false,
  },
  appetite: {
    key: 'appetite',
    label: 'Appetite',
    description: 'Hunger and cravings',
    kind: 'state',
    hormonal: true,
  },
  libido: {
    key: 'libido',
    label: 'Libido',
    description: 'Interest in sex',
    kind: 'hormonal',
    hormonal: true,
  },
  breastTenderness: {
    key: 'breastTenderness',
    label: 'Breast tenderness',
    description: 'Sore or tender breasts',
    kind: 'hormonal',
    hormonal: true,
  },
  hotFlushes: {
    key: 'hotFlushes',
    label: 'Hot flushes',
    description: 'Sudden heat and flushing',
    kind: 'hormonal',
    hormonal: true,
  },
  nightSweats: {
    key: 'nightSweats',
    label: 'Night sweats',
    description: 'Waking sweaty at night',
    kind: 'hormonal',
    hormonal: true,
  },
};

export function kindLabel(k: SymptomKind | undefined): string {
  if (k === 'behaviour') return 'Behaviour';
  if (k === 'state') return 'How you feel';
  if (k === 'physio') return 'Body';
  if (k === 'hormonal') return 'Hormonal';
  return 'Other';
}
