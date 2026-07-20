import type { ComputedStyleDifference, ComputedStyleSnapshot } from './types.js';

export function diffComputedStyles(
  lastGood: ComputedStyleSnapshot,
  firstBad: ComputedStyleSnapshot,
): ComputedStyleDifference[] {
  const properties = new Set([...Object.keys(lastGood), ...Object.keys(firstBad)]);
  return [...properties]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((property) => {
      const before = lastGood[property] ?? '';
      const after = firstBad[property] ?? '';
      return before === after ? [] : [{ property, lastGood: before, firstBad: after }];
    });
}
