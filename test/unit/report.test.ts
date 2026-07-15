import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { generateReport } from '../../src/report.js';
import type { CommitInfo, ResolvedConfig } from '../../src/types.js';
import { temporaryDirectory } from '../helpers.js';

const commit = (hash: string, subject: string): CommitInfo => ({
  hash, shortHash: hash.slice(0, 7), author: 'A <a@example.test>', date: '2025-01-01T00:00:00Z', subject, body: '',
});

test('generates one offline report with embedded images, slider, escaped repository text, and evidence', async () => {
  const dir = await temporaryDirectory('pixelbisect-report-');
  const image = new PNG({ width: 2, height: 2 });
  image.data.fill(255);
  const buffer = PNG.sync.write(image);
  const before = path.join(dir, 'before.png');
  const after = path.join(dir, 'after.png');
  const diff = path.join(dir, 'diff.png');
  await Promise.all([writeFile(before, buffer), writeFile(after, buffer), writeFile(diff, buffer)]);
  const config: ResolvedConfig = {
    configPath: path.join(dir, 'config.json'), repoPath: '<unsafe>&repo', goodCommit: 'good', badCommit: 'bad',
    goodHash: 'a'.repeat(40), badHash: 'b'.repeat(40), commitCount: 2,
    installCommand: 'npm ci <unsafe-install>', buildCommand: null, startCommand: 'npm start', port: 4173,
    readinessUrl: 'http://127.0.0.1:4173', targetUrl: 'http://127.0.0.1:4173/checkout', selector: '#button',
    viewport: { width: 1280, height: 720 }, startupTimeoutMs: 1000, captureTimeoutMs: 1000,
    pixelColorThreshold: 0.1, maxChangedPixelPercent: 0.5,
  };
  const output = path.join(dir, 'report.html');
  await generateReport({
    outputPath: output,
    config,
    culprit: { ...commit('b'.repeat(40), '<script>alert(1)</script>'), author: '<unsafe-author>', body: '<unsafe-body>' },
    lastGood: { ...commit('a'.repeat(40), 'good'), subject: '<unsafe-good-subject>' },
    comparison: { changedPixels: 1, totalPixels: 4, changedPercent: 25, verdict: 'BAD', width: 2, height: 2 },
    records: [{
      changedPixels: 0, totalPixels: 4, changedPercent: 0, verdict: 'GOOD', width: 2, height: 2,
      hash: 'c'.repeat(40), shortHash: 'ccccccc', subject: '<unsafe-record>', durationMs: 500,
      screenshotPath: before, diffPath: diff, timestamp: '2025-01-01T00:00:00Z',
    }],
    durationMs: 1234, diffText: 'diff --git a/src/style.css b/src/style.css\n@@ -1,1 +1,1 @@\n+<danger>',
    beforeScreenshotPath: before, afterScreenshotPath: after, diffImagePath: diff,
    generatedAt: new Date('2025-01-01T00:00:00Z'),
  });
  const html = await readFile(output, 'utf8');
  assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 3);
  assert.match(html, /type="range"/);
  assert.match(html, /addEventListener\('input'/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /\+&lt;danger&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  for (const unsafe of ['<unsafe-author>', '<unsafe-body>', '<unsafe-good-subject>', '<unsafe-record>', '<unsafe-install>']) assert.doesNotMatch(html, new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp('b'.repeat(40)));
  assert.match(html, /Screenshots may contain application data/);
  assert.match(html, /1 midpoint comparison/);
  assert.match(html, /1\.2 s total/);
  assert.match(html, /src\/style\.css/);
  assert.match(html, /@@ -1,1 \+1,1 @@/);
  assert.match(html, /Result assumes one monotonic good-to-bad transition/);
});
