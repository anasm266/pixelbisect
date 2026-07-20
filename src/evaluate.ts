import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureElement } from './capture.js';
import { comparePngFiles } from './compare.js';
import { PixelBisectError } from './errors.js';
import { commitInfo, currentCommit } from './git.js';
import { runShellCommand, startServer } from './processes.js';
import { formatDuration } from './time.js';
import { green, red } from './terminal.js';
import type { ComputedStyleSnapshot, EvaluationRecord, EvaluationState } from './types.js';

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function lockfileFingerprint(worktreePath: string): Promise<string> {
  for (const name of ['npm-shrinkwrap.json', 'package-lock.json']) {
    const file = path.join(worktreePath, name);
    if (await exists(file)) {
      const buffer = await readFile(file);
      return `${name}:${createHash('sha256').update(buffer).digest('hex')}`;
    }
  }
  const packageJson = path.join(worktreePath, 'package.json');
  if (!(await exists(packageJson))) throw new PixelBisectError('No package-lock.json, npm-shrinkwrap.json, or package.json was found.');
  return `package.json:${createHash('sha256').update(await readFile(packageJson)).digest('hex')}`;
}

async function ensureDependencies(state: EvaluationState, logDir: string): Promise<void> {
  const fingerprint = await lockfileFingerprint(state.worktreePath);
  let installedFingerprint = '';
  try { installedFingerprint = (await readFile(state.installStatePath, 'utf8')).trim(); } catch { /* first install */ }
  const nodeModules = path.join(state.worktreePath, 'node_modules');
  if (installedFingerprint === fingerprint && await exists(nodeModules)) {
    console.log('  install  reused (lockfile unchanged)');
    return;
  }
  console.log('  install  dependencies');
  await runShellCommand(state.config.installCommand, {
    cwd: state.worktreePath,
    timeoutMs: Math.max(120_000, state.config.startupTimeoutMs * 4),
    label: 'Dependency installation',
    logPath: path.join(logDir, 'install.log'),
  });
  const afterInstallFingerprint = await lockfileFingerprint(state.worktreePath);
  if (afterInstallFingerprint !== fingerprint) {
    throw new PixelBisectError('The install command modified the active npm lockfile. Use a frozen install command such as "npm ci".');
  }
  await writeFile(state.installStatePath, fingerprint, 'utf8');
}

async function readRecords(resultsPath: string): Promise<EvaluationRecord[]> {
  try { return JSON.parse(await readFile(resultsPath, 'utf8')) as EvaluationRecord[]; } catch { return []; }
}

export async function captureCurrentCommit(
  state: EvaluationState,
  options: { label: string; outputPath?: string; includeComputedStyle?: boolean },
): Promise<{ hash: string; shortHash: string; subject: string; screenshotPath: string; durationMs: number; computedStyle?: ComputedStyleSnapshot }> {
  const started = Date.now();
  const hash = await currentCommit(state.worktreePath);
  const info = await commitInfo(state.worktreePath, hash);
  const short = info.shortHash;
  const artifactName = options.label;
  const commitDir = path.join(state.artifactDir, 'commits', artifactName);
  await mkdir(commitDir, { recursive: true });
  console.log(`  checkout ${short}  ${info.subject}`);
  await ensureDependencies(state, commitDir);
  if (state.config.buildCommand) {
    console.log('  build    project');
    await runShellCommand(state.config.buildCommand, {
      cwd: state.worktreePath,
      timeoutMs: 120_000,
      label: 'Build',
      logPath: path.join(commitDir, 'build.log'),
    });
  }
  console.log(`  start    port ${state.config.port}`);
  const server = await startServer({
    command: state.config.startCommand,
    cwd: state.worktreePath,
    port: state.config.port,
    readinessUrl: state.config.readinessUrl,
    timeoutMs: state.config.startupTimeoutMs,
    logPath: path.join(commitDir, 'server.log'),
  });
  const screenshotPath = options.outputPath ?? path.join(commitDir, 'screenshot.png');
  let computedStyle: ComputedStyleSnapshot | undefined;
  try {
    console.log(`  capture  ${state.config.selector}`);
    ({ computedStyle } = await captureElement(state.config, screenshotPath, { includeComputedStyle: options.includeComputedStyle }));
  } finally {
    await server.stop();
  }
  return { hash, shortHash: short, subject: info.subject, screenshotPath, durationMs: Date.now() - started, computedStyle };
}

export async function evaluateCurrentCommit(
  state: EvaluationState,
  options: { label?: string; record?: boolean } = {},
): Promise<EvaluationRecord> {
  const started = Date.now();
  const captured = await captureCurrentCommit(state, { label: options.label ?? (await currentCommit(state.worktreePath)).slice(0, 12) });
  const commitDir = path.dirname(captured.screenshotPath);
  const diffPath = path.join(commitDir, 'diff.png');
  console.log('  compare  good baseline');
  const comparison = await comparePngFiles({
    baselinePath: state.baselinePath,
    candidatePath: captured.screenshotPath,
    diffPath,
    pixelColorThreshold: state.config.pixelColorThreshold,
    maxChangedPixelPercent: state.config.maxChangedPixelPercent,
  });
  const record: EvaluationRecord = {
    ...comparison,
    hash: captured.hash,
    shortHash: captured.shortHash,
    subject: captured.subject,
    durationMs: Date.now() - started,
    screenshotPath: captured.screenshotPath,
    diffPath,
    timestamp: new Date().toISOString(),
  };
  if (options.record !== false) {
    const records = await readRecords(state.resultsPath);
    records.push(record);
    await writeFile(state.resultsPath, JSON.stringify(records, null, 2), 'utf8');
    const completed = records.length;
    const remaining = Math.max(0, state.expectedComparisons - completed);
    const verdict = record.verdict === 'GOOD' ? green(record.verdict.padEnd(4)) : red(record.verdict.padEnd(4));
    console.log(`[${completed}/${state.expectedComparisons}] ${captured.shortHash}  ${verdict}  ${record.changedPercent.toFixed(3)}% changed  ~${remaining} remaining  elapsed ${formatDuration(Date.now() - state.startedAt)}`);
  }
  return record;
}

export async function runEvaluator(statePath: string): Promise<number> {
  let state: EvaluationState;
  try {
    state = JSON.parse(await readFile(path.resolve(statePath), 'utf8')) as EvaluationState;
    if (state.version !== 1) throw new PixelBisectError('Unsupported evaluator state version.');
    const result = await evaluateCurrentCommit(state);
    return result.verdict === 'GOOD' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PixelBisect infrastructure error: ${message}`);
    return 255;
  }
}
