import assert from 'node:assert/strict';
import { access, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { generateDemoFixture } from '../../src/fixture/generate.js';
import { escapeHtml } from '../../src/html.js';
import { isPortOpen, runExecutable } from '../../src/processes.js';
import { runInvestigation } from '../../src/runner.js';
import { temporaryDirectory } from '../helpers.js';

let firstFixtureIdentity: string | undefined;

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Condition was not met within ${timeoutMs} ms.`);
}

async function assertClean(repo: string, expectedStatus: string): Promise<void> {
  assert.equal((await runExecutable('git', ['status', '--porcelain=v1'], { cwd: repo })).stdout, expectedStatus);
  const worktrees = (await runExecutable('git', ['worktree', 'list', '--porcelain'], { cwd: repo })).stdout;
  assert.doesNotMatch(worktrees, /pixelbisect-worktree-/i);
  assert.equal((await runExecutable('git', ['for-each-ref', '--format=%(refname)', 'refs/bisect'], { cwd: repo })).stdout, '');
  const gitDirText = (await runExecutable('git', ['rev-parse', '--git-dir'], { cwd: repo })).stdout.trim();
  const gitDir = path.resolve(repo, gitDirText);
  for (const name of ['BISECT_START', 'BISECT_LOG', 'BISECT_NAMES', 'BISECT_RUN']) {
    await assert.rejects(access(path.join(gitDir, name)), /ENOENT/, `${name} should not remain after cleanup`);
  }
  assert.equal(await isPortOpen(4173), false);
}

async function singleRunDirectory(artifactRoot: string): Promise<string | undefined> {
  try {
    const entries = await readdir(artifactRoot, { withFileTypes: true });
    const run = entries.find((entry) => entry.isDirectory());
    return run ? path.join(artifactRoot, run.name) : undefined;
  } catch { return undefined; }
}

async function assertCleanupArtifact(artifactRoot: string): Promise<void> {
  const run = await singleRunDirectory(artifactRoot);
  assert.ok(run, 'run artifact directory should exist');
  const cleanup = JSON.parse(await readFile(path.join(run, 'cleanup.json'), 'utf8')) as { worktreeRemoved: boolean; portReleased: boolean; bisectStateRemoved: boolean; error: string | null };
  assert.deepEqual(cleanup && {
    worktreeRemoved: cleanup.worktreeRemoved,
    portReleased: cleanup.portReleased,
    bisectStateRemoved: cleanup.bisectStateRemoved,
    error: cleanup.error,
  }, { worktreeRemoved: true, portReleased: true, bisectStateRemoved: true, error: null });
}

test('complete workflow identifies the planted culprit twice and produces a working offline report', { timeout: 180_000 }, async () => {
  const root = await temporaryDirectory('pixelbisect-e2e-');
  try {
    const fixture = await generateDemoFixture(path.join(root, 'fixture'));
    firstFixtureIdentity = `${fixture.goodHash}:${fixture.culpritHash}:${fixture.badHash}`;
    assert.equal(fixture.commitCount, 64);
    const [goodLock, badLock, merges] = await Promise.all([
      runExecutable('git', ['show', 'visual-good:package-lock.json'], { cwd: fixture.repoPath }),
      runExecutable('git', ['show', 'visual-bad:package-lock.json'], { cwd: fixture.repoPath }),
      runExecutable('git', ['rev-list', '--merges', 'visual-good..visual-bad'], { cwd: fixture.repoPath }),
    ]);
    assert.equal(goodLock.stdout, badLock.stdout, 'lockfile must remain byte-identical across the 64-commit range');
    assert.equal(merges.stdout, '', 'fixture history must be linear');
    const [lockChanges, appChanges, cssChanges, mainSource, cssSource] = await Promise.all([
      runExecutable('git', ['log', '--format=%H', 'visual-good..visual-bad', '--', 'package-lock.json'], { cwd: fixture.repoPath }),
      runExecutable('git', ['log', '--format=%H', 'visual-good..visual-bad', '--', 'package.json', 'index.html', 'src/main.js'], { cwd: fixture.repoPath }),
      runExecutable('git', ['log', '--format=%H', 'visual-good..visual-bad', '--', 'src/style.css'], { cwd: fixture.repoPath }),
      runExecutable('git', ['show', 'visual-bad:src/main.js'], { cwd: fixture.repoPath }),
      runExecutable('git', ['show', 'visual-bad:src/style.css'], { cwd: fixture.repoPath }),
    ]);
    assert.equal(lockChanges.stdout, '', 'no intermediate commit may alter the lockfile');
    assert.equal(appChanges.stdout, '', 'runtime/package files must remain stable across the range');
    assert.equal(cssChanges.stdout.trim(), fixture.culpritHash, 'only the planted culprit may alter rendering CSS');
    assert.match(mainSource.stdout, /id="checkout-button"/);
    assert.doesNotMatch(`${mainSource.stdout}\n${cssSource.stdout}`, /Math\.random|Date\.|fetch\(|XMLHttpRequest|https?:\/\/|animation\s*:|transition\s*:/i);
    assert.match(cssSource.stdout, /Arial, Helvetica, sans-serif/);
    await writeFile(path.join(fixture.repoPath, 'keep-uncommitted.txt'), 'must survive every run\n', 'utf8');
    const statusBefore = (await runExecutable('git', ['status', '--porcelain=v1'], { cwd: fixture.repoPath })).stdout;
    const headBefore = (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: fixture.repoPath })).stdout.trim();

    const first = await runInvestigation(fixture.configPath, { artifactRoot: path.join(root, 'artifacts-first') });
    assert.equal(first.culprit.hash, fixture.culpritHash);
    assert.equal(first.records.length, 6);
    const expectedLastGood = (await runExecutable('git', ['rev-parse', `${fixture.culpritHash}^1`], { cwd: fixture.repoPath })).stdout.trim();
    assert.equal(first.lastGood.hash, expectedLastGood);
    assert.match(first.diffText, /--button-primary: #2563eb/);
    assert.match(first.diffText, /\+  --button-primary: #e5e7eb/);
    const artifactFiles = await readdir(first.artifactDir, { recursive: true });
    assert.equal(artifactFiles.filter((entry) => String(entry).endsWith('install.log')).length, 1, 'unchanged lockfile should install exactly once');
    for (const name of ['final/before.png', 'final/after.png', 'final/diff.png', 'git-bisect.log', 'cleanup.json']) await access(path.join(first.artifactDir, name));
    const [beforePng, afterPng] = await Promise.all([
      readFile(path.join(first.artifactDir, 'final', 'before.png')).then((buffer) => PNG.sync.read(buffer)),
      readFile(path.join(first.artifactDir, 'final', 'after.png')).then((buffer) => PNG.sync.read(buffer)),
    ]);
    assert.deepEqual({ width: beforePng.width, height: beforePng.height }, { width: afterPng.width, height: afterPng.height });
    await assertCleanupArtifact(path.dirname(first.artifactDir));
    assert.equal((await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: fixture.repoPath })).stdout.trim(), headBefore);
    await assertClean(fixture.repoPath, statusBefore);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(pathToFileURL(first.reportPath).href, { waitUntil: 'load' });
      assert.equal(await page.locator('img').count(), 3);
      assert.equal(await page.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), true);
      const naturalSizes = await page.locator('#comparison img').evaluateAll((images) => images.map((image) => ({ width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight })));
      assert.deepEqual(naturalSizes[0], naturalSizes[1]);
      assert.match(await page.locator('body').innerText(), new RegExp(fixture.culpritHash.slice(0, 7)));
      assert.match(await page.locator('pre').innerText(), /--button-primary: #2563eb/);
      const slider = page.locator('#slider');
      const comparisonPng = PNG.sync.read(await page.locator('#comparison').screenshot());
      const sample = (x: number, y: number) => {
        const offset = (Math.floor(y * comparisonPng.height) * comparisonPng.width + Math.floor(x * comparisonPng.width)) * 4;
        return [...comparisonPng.data.subarray(offset, offset + 3)];
      };
      const leftPixel = sample(0.25, 0.75);
      const rightPixel = sample(0.75, 0.75);
      assert.ok(leftPixel[2] > leftPixel[0] + 100, `left side should show blue last-good image, got ${leftPixel}`);
      assert.ok(Math.max(...rightPixel) - Math.min(...rightPixel) < 15, `right side should show neutral first-bad image, got ${rightPixel}`);
      const sliderBox = await slider.boundingBox();
      assert.ok(sliderBox);
      await page.mouse.click(sliderBox.x + sliderBox.width * 0.31, sliderBox.y + sliderBox.height / 2);
      const mouseValue = Number(await slider.inputValue());
      assert.ok(mouseValue >= 29 && mouseValue <= 33, `mouse click should move slider near 31, got ${mouseValue}`);
      assert.equal(await page.locator('#comparison').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--position')), `${mouseValue}%`);
      await slider.evaluate((element: HTMLInputElement) => { element.value = '73'; element.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await page.locator('#comparison').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--position')), '73%');
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await slider.inputValue(), '74');
      assert.equal(requests.every((url) => url.startsWith('file:') || url.startsWith('data:')), true);
    } finally { await browser.close(); }

    const report = await readFile(first.reportPath, 'utf8');
    assert.equal((report.match(/data:image\/png;base64,/g) ?? []).length, 3);
    for (const expected of [first.culprit.hash, first.lastGood.hash, escapeHtml(first.culprit.author), first.culprit.date, first.culprit.subject, 'src/style.css', '@@ -2,7 +2,7 @@', 'Screenshots may contain application data', '6 midpoint comparisons']) assert.ok(report.includes(expected), `report should contain ${expected}`);
    const second = await runInvestigation(fixture.configPath, { artifactRoot: path.join(root, 'artifacts-second') });
    assert.equal(second.culprit.hash, fixture.culpritHash);
    await assertClean(fixture.repoPath, statusBefore);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Ctrl+C cleans startup and bisect-loop interruptions, then an immediate run succeeds', { timeout: 150_000 }, async () => {
  const root = await temporaryDirectory('pixelbisect-interrupt-e2e-');
  try {
    const fixture = await generateDemoFixture(path.join(root, 'fixture'));
    assert.equal(`${fixture.goodHash}:${fixture.culpritHash}:${fixture.badHash}`, firstFixtureIdentity, 'two independent fixture generations should produce identical history');
    const statusBefore = (await runExecutable('git', ['status', '--porcelain=v1'], { cwd: fixture.repoPath })).stdout;
    const interruptedRoot = path.join(root, 'startup-interrupted-artifacts');
    const pending = runInvestigation(fixture.configPath, { artifactRoot: interruptedRoot });
    await waitUntil(async () => {
      const run = await singleRunDirectory(interruptedRoot);
      if (!run) return false;
      try { await access(path.join(run, 'commits', 'endpoint-good', 'server.log')); return true; } catch { return false; }
    }, 30_000);
    process.emit('SIGINT', 'SIGINT');
    await assert.rejects(pending, /Investigation interrupted by SIGINT/);
    await assertClean(fixture.repoPath, statusBefore);
    await assertCleanupArtifact(interruptedRoot);

    const bisectInterruptedRoot = path.join(root, 'bisect-interrupted-artifacts');
    const bisectPending = runInvestigation(fixture.configPath, { artifactRoot: bisectInterruptedRoot });
    await waitUntil(async () => {
      const run = await singleRunDirectory(bisectInterruptedRoot);
      if (!run) return false;
      try {
        const records = JSON.parse(await readFile(path.join(run, 'bisect-results.json'), 'utf8')) as unknown[];
        return records.length >= 1;
      } catch { return false; }
    }, 45_000);
    process.emit('SIGINT', 'SIGINT');
    await assert.rejects(bisectPending, /Investigation interrupted by SIGINT/);
    await assertClean(fixture.repoPath, statusBefore);
    await assertCleanupArtifact(bisectInterruptedRoot);

    const recovered = await runInvestigation(fixture.configPath, { artifactRoot: path.join(root, 'recovered-artifacts') });
    assert.equal(recovered.culprit.hash, fixture.culpritHash);
    await assertClean(fixture.repoPath, statusBefore);
  } finally { await rm(root, { recursive: true, force: true }); }
});
