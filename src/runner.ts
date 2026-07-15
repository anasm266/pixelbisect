import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { closeActiveBrowsers } from './capture.js';
import { comparePngFiles } from './compare.js';
import { captureCurrentCommit } from './evaluate.js';
import { PixelBisectError, errorMessage } from './errors.js';
import {
  checkout,
  commitInfo,
  createDetachedWorktree,
  firstParent,
  firstParentCommitCount,
  git,
  gitDiff,
  isAncestor,
  isFirstParentAncestor,
  removeWorktree,
  resolveCommit,
  verifyRepository,
} from './git.js';
import { runExecutable, terminateAllProcesses, terminateProcessesOnPort, isPortOpen } from './processes.js';
import { generateReport } from './report.js';
import { formatDuration } from './time.js';
import type { EvaluationRecord, EvaluationState, ResolvedConfig, RunResult } from './types.js';

function runId(repoPath: string): string {
  const name = path.basename(repoPath).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'repo';
  return `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
}

async function readRecords(filePath: string): Promise<EvaluationRecord[]> {
  try { return JSON.parse(await readFile(filePath, 'utf8')) as EvaluationRecord[]; } catch { return []; }
}

async function resolveConfiguration(configPath: string): Promise<ResolvedConfig> {
  const loaded = await loadConfig(configPath);
  await verifyRepository(loaded.repoPath);
  const goodHash = await resolveCommit(loaded.repoPath, loaded.goodCommit, 'goodCommit');
  const badHash = await resolveCommit(loaded.repoPath, loaded.badCommit, 'badCommit');
  if (goodHash === badHash) throw new PixelBisectError('The good and bad Git references resolve to the same commit.');
  if (!(await isAncestor(loaded.repoPath, goodHash, badHash))) {
    throw new PixelBisectError(`The good commit (${goodHash.slice(0, 12)}) is not an ancestor of the bad commit (${badHash.slice(0, 12)}).`);
  }
  if (!(await isFirstParentAncestor(loaded.repoPath, goodHash, badHash))) {
    throw new PixelBisectError(`The good commit (${goodHash.slice(0, 12)}) is not on the bad commit's first-parent history.`);
  }
  const commitCount = await firstParentCommitCount(loaded.repoPath, goodHash, badHash);
  return { ...loaded, goodHash, badHash, commitCount };
}

export interface RunOptions {
  evaluatorScript?: string;
  artifactRoot?: string;
}

export async function runInvestigation(configPath: string, options: RunOptions = {}): Promise<RunResult> {
  const started = Date.now();
  const config = await resolveConfiguration(configPath);
  const goodInfo = await commitInfo(config.repoPath, config.goodHash);
  const badInfo = await commitInfo(config.repoPath, config.badHash);
  const expectedComparisons = Math.ceil(Math.log2(Math.max(1, config.commitCount - 1)));
  const root = options.artifactRoot ? path.resolve(options.artifactRoot) : path.join(os.tmpdir(), 'pixelbisect-runs');
  const artifactDir = path.join(root, runId(config.repoPath));
  let worktreeParent: string | undefined;
  let worktreePath: string | undefined;
  const baselinePath = path.join(artifactDir, 'endpoints', 'good.png');
  const resultsPath = path.join(artifactDir, 'bisect-results.json');
  const installStatePath = path.join(artifactDir, 'install-lock.txt');
  const statePath = path.join(artifactDir, 'evaluator-state.json');
  const evaluatorScript = options.evaluatorScript ?? fileURLToPath(new URL('./cli.js', import.meta.url));
  let worktreeCreated = false;
  let bisectStarted = false;
  let interrupted: NodeJS.Signals | undefined;
  let cleanupError: string | undefined;
  const initialPortOccupied = await isPortOpen(config.port);

  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(resultsPath, '[]', 'utf8');

  const onSignal = (signal: NodeJS.Signals) => {
    if (!interrupted) {
      interrupted = signal;
      console.error(`\n${signal} received. Cleaning up PixelBisect…`);
    }
    void Promise.all([terminateAllProcesses(), closeActiveBrowsers()]);
  };
  const assertNotInterrupted = () => {
    if (interrupted) throw new PixelBisectError(`Investigation interrupted by ${interrupted}.`, 130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.log('\nPixelBisect');
  console.log('────────────────────────────────────────────────────────────');
  console.log('⚠ Executes install, build, and server commands from historical commits.');
  console.log('  Run PixelBisect only on repositories you trust; a worktree is not a sandbox.\n');
  console.log(`Good:  ${goodInfo.shortHash}  ${goodInfo.subject}`);
  console.log(`Bad:   ${badInfo.shortHash}  ${badInfo.subject}`);
  console.log(`Range: ${config.commitCount} commits (first-parent), ~${expectedComparisons} comparisons\n`);

  try {
    worktreeParent = await mkdtemp(path.join(os.tmpdir(), 'pixelbisect-worktree-'));
    worktreePath = path.join(worktreeParent, 'repo');
    assertNotInterrupted();
    console.log('Creating detached temporary worktree…');
    await createDetachedWorktree(config.repoPath, worktreePath, config.badHash);
    worktreeCreated = true;
    assertNotInterrupted();
    const state: EvaluationState = {
      version: 1,
      startedAt: started,
      config,
      worktreePath,
      artifactDir,
      baselinePath,
      resultsPath,
      installStatePath,
      expectedComparisons,
    };
    await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

    console.log('\nVerifying known-good endpoint');
    await checkout(worktreePath, config.goodHash);
    assertNotInterrupted();
    await captureCurrentCommit(state, { label: 'endpoint-good', outputPath: baselinePath });
    assertNotInterrupted();

    console.log('\nVerifying known-bad endpoint');
    await checkout(worktreePath, config.badHash);
    assertNotInterrupted();
    const badEndpointPath = path.join(artifactDir, 'endpoints', 'bad.png');
    const badCaptured = await captureCurrentCommit(state, { label: 'endpoint-bad', outputPath: badEndpointPath });
    assertNotInterrupted();
    const endpointDiffPath = path.join(artifactDir, 'endpoints', 'diff.png');
    const endpointComparison = await comparePngFiles({
      baselinePath,
      candidatePath: badCaptured.screenshotPath,
      diffPath: endpointDiffPath,
      pixelColorThreshold: config.pixelColorThreshold,
      maxChangedPixelPercent: config.maxChangedPixelPercent,
    });
    assertNotInterrupted();
    console.log(`  endpoint ${endpointComparison.verdict}  ${endpointComparison.changedPercent.toFixed(3)}% changed`);
    if (endpointComparison.verdict !== 'BAD') {
      throw new PixelBisectError(
        `The known-good and known-bad endpoints are visually identical within the configured threshold (${endpointComparison.changedPercent.toFixed(3)}% changed; must exceed ${config.maxChangedPixelPercent}%).`,
      );
    }
    assertNotInterrupted();

    console.log('\nRunning native Git bisect');
    await git(worktreePath, ['bisect', 'start', '--first-parent', config.badHash, config.goodHash]);
    bisectStarted = true;
    assertNotInterrupted();
    const bisect = await runExecutable('git', ['bisect', 'run', process.execPath, evaluatorScript, '__evaluate', statePath], {
      cwd: worktreePath,
      stream: true,
      allowFailure: true,
    });
    await writeFile(path.join(artifactDir, 'git-bisect.log'), `${bisect.stdout}${bisect.stderr}`, 'utf8');
    assertNotInterrupted();
    if (bisect.code !== 0) {
      const detail = (bisect.stderr || bisect.stdout).trim().slice(-4000);
      throw new PixelBisectError(`Native Git bisect aborted because the visual evaluator failed.${detail ? `\n${detail}` : ''}`);
    }
    const culpritResult = await git(worktreePath, ['rev-parse', 'refs/bisect/bad'], true);
    if (culpritResult.code !== 0) throw new PixelBisectError('Git bisect completed without recording a first bad commit.');
    const culpritHash = culpritResult.stdout.trim();
    const lastGoodHash = await firstParent(config.repoPath, culpritHash);
    await git(worktreePath, ['bisect', 'reset'], true);
    bisectStarted = false;
    assertNotInterrupted();

    console.log('\nCapturing adjacent last-good and first-bad commits');
    const finalDir = path.join(artifactDir, 'final');
    await mkdir(finalDir, { recursive: true });
    const beforePath = path.join(finalDir, 'before.png');
    await checkout(worktreePath, lastGoodHash);
    assertNotInterrupted();
    await captureCurrentCommit(state, { label: 'final-good', outputPath: beforePath });
    assertNotInterrupted();
    await checkout(worktreePath, culpritHash);
    assertNotInterrupted();
    const afterPath = path.join(finalDir, 'after.png');
    const finalBadCapture = await captureCurrentCommit(state, { label: 'final-bad', outputPath: afterPath });
    assertNotInterrupted();
    const reproductionComparison = await comparePngFiles({
      baselinePath,
      candidatePath: afterPath,
      diffPath: path.join(finalDir, 'baseline-reproduction-diff.png'),
      pixelColorThreshold: config.pixelColorThreshold,
      maxChangedPixelPercent: config.maxChangedPixelPercent,
    });
    if (reproductionComparison.verdict !== 'BAD') throw new PixelBisectError('The first-bad commit no longer reproduces the visual difference from the known-good baseline.');
    const adjacentDiffPath = path.join(finalDir, 'diff.png');
    const adjacentComparison = await comparePngFiles({
      baselinePath: beforePath,
      candidatePath: afterPath,
      diffPath: adjacentDiffPath,
      pixelColorThreshold: config.pixelColorThreshold,
      maxChangedPixelPercent: config.maxChangedPixelPercent,
    });
    assertNotInterrupted();

    const [culprit, lastGood, diffText, records] = await Promise.all([
      commitInfo(config.repoPath, culpritHash),
      commitInfo(config.repoPath, lastGoodHash),
      gitDiff(config.repoPath, lastGoodHash, culpritHash),
      readRecords(resultsPath),
    ]);
    assertNotInterrupted();
    const durationMs = Date.now() - started;
    const reportPath = await generateReport({
      outputPath: path.join(artifactDir, 'report.html'),
      config,
      culprit,
      lastGood,
      comparison: adjacentComparison,
      records,
      durationMs,
      diffText,
      beforeScreenshotPath: beforePath,
      afterScreenshotPath: finalBadCapture.screenshotPath,
      diffImagePath: adjacentDiffPath,
    });
    assertNotInterrupted();
    const result: RunResult = { reportPath, artifactDir, culprit, lastGood, comparison: adjacentComparison, records, durationMs, diffText };
    await writeFile(path.join(artifactDir, 'run-result.json'), JSON.stringify(result, null, 2), 'utf8');
    assertNotInterrupted();
    console.log(`\nFirst bad commit: ${culprit.shortHash}  ${culprit.subject}`);
    console.log(`Last good commit: ${lastGood.shortHash}`);
    console.log(`Changed pixels:   ${adjacentComparison.changedPixels.toLocaleString()} / ${adjacentComparison.totalPixels.toLocaleString()} (${adjacentComparison.changedPercent.toFixed(3)}%)`);
    console.log(`Comparisons:      ${records.length}`);
    console.log(`Duration:         ${formatDuration(durationMs)}`);
    console.log(`Report:           ${reportPath}`);
    assertNotInterrupted();
    return result;
  } catch (error) {
    if (interrupted) throw new PixelBisectError(`Investigation interrupted by ${interrupted}.`, 130, { cause: error });
    throw error;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await Promise.all([terminateAllProcesses(), closeActiveBrowsers()]).catch(() => undefined);
    if (worktreeCreated && worktreePath) {
      try {
        if (bisectStarted) await git(worktreePath, ['bisect', 'reset'], true);
        await removeWorktree(config.repoPath, worktreePath);
      } catch (error) {
        cleanupError = errorMessage(error);
      }
    }
    if (worktreeParent) {
      await rm(worktreeParent, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }).catch((error) => { cleanupError ??= errorMessage(error); });
    }
    let worktreeRemoved = !worktreeCreated;
    try {
      const worktreeList = (await git(config.repoPath, ['worktree', 'list', '--porcelain'])).stdout;
      worktreeRemoved = !worktreePath || !worktreeList.includes(worktreePath.replaceAll('\\', '/'));
    } catch (error) {
      cleanupError ??= `Could not verify worktree cleanup: ${errorMessage(error)}`;
    }
    if (!initialPortOccupied && await isPortOpen(config.port)) await terminateProcessesOnPort(config.port);
    const portReleased = !(await isPortOpen(config.port));
    if (!portReleased && !initialPortOccupied) cleanupError ??= `Port ${config.port} remained occupied after cleanup.`;
    const cleanup = {
      completedAt: new Date().toISOString(),
      worktreeRemoved,
      portReleased,
      bisectStateRemoved: worktreeRemoved,
      error: cleanupError ?? null,
    };
    await writeFile(path.join(artifactDir, 'cleanup.json'), JSON.stringify(cleanup, null, 2), 'utf8').catch((error) => { cleanupError ??= `Could not write cleanup evidence: ${errorMessage(error)}`; });
    if (cleanupError) throw new PixelBisectError(`PixelBisect could not complete cleanup: ${cleanupError}`);
  }
}
