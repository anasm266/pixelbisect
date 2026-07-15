import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { calculateChangedPercent, comparePngFiles, verdictForPercent } from '../../src/compare.js';
import { temporaryDirectory } from '../helpers.js';

function png(width: number, height: number, changed = false): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = changed && i === 0 ? 255 : 0;
    image.data[i + 1] = 0;
    image.data[i + 2] = 0;
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}

test('calculates percentages and applies an exclusive maximum threshold', () => {
  assert.equal(calculateChangedPercent(1, 4), 25);
  assert.equal(verdictForPercent(0.5, 0.5), 'GOOD');
  assert.equal(verdictForPercent(0.50001, 0.5), 'BAD');
  assert.throws(() => calculateChangedPercent(5, 4), /Invalid/);
});

test('compares PNG pixels and writes a highlighted diff', async () => {
  const dir = await temporaryDirectory('pixelbisect-compare-');
  const baselinePath = path.join(dir, 'a.png');
  const candidatePath = path.join(dir, 'b.png');
  const diffPath = path.join(dir, 'diff.png');
  await writeFile(baselinePath, png(2, 2));
  await writeFile(candidatePath, png(2, 2, true));
  const result = await comparePngFiles({ baselinePath, candidatePath, diffPath, pixelColorThreshold: 0, maxChangedPixelPercent: 20 });
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedPercent, 25);
  assert.equal(result.verdict, 'BAD');
});

test('explicitly rejects mismatched screenshot dimensions', async () => {
  const dir = await temporaryDirectory('pixelbisect-dimensions-');
  const baselinePath = path.join(dir, 'a.png');
  const candidatePath = path.join(dir, 'b.png');
  await writeFile(baselinePath, png(2, 2));
  await writeFile(candidatePath, png(3, 2));
  await assert.rejects(comparePngFiles({ baselinePath, candidatePath, diffPath: path.join(dir, 'd.png'), pixelColorThreshold: 0.1, maxChangedPixelPercent: 0.5 }), /dimensions do not match/);
});

test('per-pixel color tolerance is independent from the changed-area verdict threshold', async () => {
  const dir = await temporaryDirectory('pixelbisect-color-threshold-');
  const baselinePath = path.join(dir, 'black.png');
  const candidatePath = path.join(dir, 'near-black.png');
  const baseline = new PNG({ width: 1, height: 1 });
  const candidate = new PNG({ width: 1, height: 1 });
  baseline.data.set([0, 0, 0, 255]);
  candidate.data.set([12, 12, 12, 255]);
  await writeFile(baselinePath, PNG.sync.write(baseline));
  await writeFile(candidatePath, PNG.sync.write(candidate));
  const strict = await comparePngFiles({ baselinePath, candidatePath, diffPath: path.join(dir, 'strict.png'), pixelColorThreshold: 0, maxChangedPixelPercent: 50 });
  const tolerant = await comparePngFiles({ baselinePath, candidatePath, diffPath: path.join(dir, 'tolerant.png'), pixelColorThreshold: 0.5, maxChangedPixelPercent: 50 });
  assert.equal(strict.changedPixels, 1);
  assert.equal(strict.verdict, 'BAD');
  assert.equal(tolerant.changedPixels, 0);
  assert.equal(tolerant.verdict, 'GOOD');
});
