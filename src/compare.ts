import { readFile, writeFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { PixelBisectError } from './errors.js';
import type { ComparisonResult } from './types.js';

export function calculateChangedPercent(changedPixels: number, totalPixels: number): number {
  if (!Number.isFinite(changedPixels) || !Number.isFinite(totalPixels) || changedPixels < 0 || totalPixels <= 0 || changedPixels > totalPixels) {
    throw new PixelBisectError('Invalid changed-pixel counts.');
  }
  return (changedPixels / totalPixels) * 100;
}

export function verdictForPercent(changedPercent: number, maxChangedPixelPercent: number): 'GOOD' | 'BAD' {
  return changedPercent > maxChangedPixelPercent ? 'BAD' : 'GOOD';
}

export async function comparePngFiles(options: {
  baselinePath: string;
  candidatePath: string;
  diffPath: string;
  pixelColorThreshold: number;
  maxChangedPixelPercent: number;
}): Promise<ComparisonResult> {
  let baseline: PNG;
  let candidate: PNG;
  try {
    [baseline, candidate] = await Promise.all([
      readFile(options.baselinePath).then((buffer) => PNG.sync.read(buffer)),
      readFile(options.candidatePath).then((buffer) => PNG.sync.read(buffer)),
    ]);
  } catch (error) {
    throw new PixelBisectError('Could not decode one of the PNG screenshots.', 2, { cause: error });
  }
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    throw new PixelBisectError(
      `Screenshot dimensions do not match: baseline is ${baseline.width}x${baseline.height}, candidate is ${candidate.width}x${candidate.height}. Images are not resized.`,
    );
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const changedPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: options.pixelColorThreshold,
      includeAA: false,
      alpha: 0.35,
      diffColor: [239, 68, 68],
      aaColor: [245, 158, 11],
    },
  );
  await writeFile(options.diffPath, PNG.sync.write(diff));
  const totalPixels = baseline.width * baseline.height;
  const changedPercent = calculateChangedPercent(changedPixels, totalPixels);
  return {
    changedPixels,
    totalPixels,
    changedPercent,
    verdict: verdictForPercent(changedPercent, options.maxChangedPixelPercent),
    width: baseline.width,
    height: baseline.height,
  };
}
