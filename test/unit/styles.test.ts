import assert from 'node:assert/strict';
import test from 'node:test';
import { diffComputedStyles } from '../../src/styles.js';

test('reports only changed computed properties in stable property order', () => {
  assert.deepEqual(diffComputedStyles(
    { color: 'rgb(255, 255, 255)', display: 'block', '--button-primary': '#2563eb' },
    { color: 'rgb(23, 32, 51)', display: 'block', '--button-primary': '#e5e7eb', opacity: '1' },
  ), [
    { property: '--button-primary', lastGood: '#2563eb', firstBad: '#e5e7eb' },
    { property: 'color', lastGood: 'rgb(255, 255, 255)', firstBad: 'rgb(23, 32, 51)' },
    { property: 'opacity', lastGood: '', firstBad: '1' },
  ]);
});
