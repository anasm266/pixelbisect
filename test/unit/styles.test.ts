import assert from 'node:assert/strict';
import test from 'node:test';
import { diffComputedStyles } from '../../src/styles.js';

test('reports only changed computed properties in stable property order', () => {
  assert.deepEqual(diffComputedStyles(
    { color: 'rgb(255, 255, 255)', display: 'block', '--layer-map-marker': '30' },
    { color: 'rgb(23, 32, 51)', display: 'block', '--layer-map-marker': '3', opacity: '1' },
  ), [
    { property: '--layer-map-marker', lastGood: '30', firstBad: '3' },
    { property: 'color', lastGood: 'rgb(255, 255, 255)', firstBad: 'rgb(23, 32, 51)' },
    { property: 'opacity', lastGood: '', firstBad: '1' },
  ]);
});
