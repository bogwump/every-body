// A mixed palette pulled from *all* EveryBody themes so multi-line charts stay readable.
// We keep values aligned with the theme tokens in index.css (RGB triplets).
export const MIXED_PALETTE_RGB: string[] = [
  // Sage
  'rgb(96 115 94)',      // primary-dark
  'rgb(132 155 130)',    // primary
  'rgb(203 186 159)',    // accent

  // Lavender
  'rgb(122 102 147)',    // primary-dark
  'rgb(156 136 177)',    // primary
  'rgb(217 186 203)',    // accent

  // Ocean
  'rgb(82 125 145)',     // primary-dark
  'rgb(115 155 175)',    // primary
  'rgb(186 216 217)',    // accent

  // Terracotta
  'rgb(160 100 80)',     // primary-dark
  'rgb(190 130 110)',    // primary
  'rgb(225 195 170)',    // accent
];

export function getMixedChartColors(count: number): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(MIXED_PALETTE_RGB[i % MIXED_PALETTE_RGB.length]);
  return out;
}
