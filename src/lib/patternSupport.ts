import type { InsightSignal } from './insightEngine';

export type SupportSuggestion = {
  title: string;
  body: string;
};

function hasMetric(signal: InsightSignal, key: string): boolean {
  return Array.isArray(signal.metrics) && signal.metrics.some((metric) => String(metric) === key);
}

export function getSupportSuggestion(signal: InsightSignal): SupportSuggestion | null {
  if (!signal || signal.type === 'low_data') return null;

  if (String(signal.id).includes('sleep') && String(signal.id).includes('phase')) {
    return {
      title: 'What could help',
      body: 'Protecting your wind-down routine a few nights either side of this phase may help this window feel steadier.',
    };
  }

  if (String(signal.id).includes('sleep_before_bleed')) {
    return {
      title: 'What could help',
      body: 'Protecting your wind-down routine a few nights before your bleed may make this window feel steadier.',
    };
  }

  if (hasMetric(signal, 'sleep') && hasMetric(signal, 'stress')) {
    return {
      title: 'What could help',
      body: 'On busier days, keeping evenings lower-friction may help your sleep feel a bit less fragile.',
    };
  }

  if (hasMetric(signal, 'cravings') || hasMetric(signal, 'appetite')) {
    return {
      title: 'What could help',
      body: 'Keeping satisfying snacks nearby may make this phase feel a little easier to work with.',
    };
  }

  if (hasMetric(signal, 'fatigue') || hasMetric(signal, 'energy')) {
    return {
      title: 'What could help',
      body: 'Building in a little more recovery time around this window may help things feel more manageable.',
    };
  }

  if (hasMetric(signal, 'pain') || hasMetric(signal, 'cramps')) {
    return {
      title: 'What could help',
      body: 'Lighter plans and a gentler pace in this window may help you feel less knocked by it.',
    };
  }

  return null;
}
