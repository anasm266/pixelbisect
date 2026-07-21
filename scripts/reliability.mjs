import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const configPath = path.resolve(process.argv[2] ?? path.join(root, 'demo-fixture', 'pixelbisect.config.json'));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const repoPath = path.resolve(path.dirname(configPath), config.repoPath);
const outputDir = path.join(root, 'reliability-results');
await mkdir(outputDir, { recursive: true });

function command(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { const text = String(chunk); stdout += text; process.stdout.write(text); });
    child.stderr.on('data', (chunk) => { const text = String(chunk); stderr += text; process.stderr.write(text); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function pathExists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function inspectBisectState(repo) {
  const refs = await command('git', ['for-each-ref', '--format=%(refname)', 'refs/bisect/'], repo);
  const gitDirResult = await command('git', ['rev-parse', '--absolute-git-dir'], repo);
  if (refs.code !== 0 || gitDirResult.code !== 0) throw new Error('Could not inspect Git bisect state.');
  const gitDir = gitDirResult.stdout.trim();
  const stateFiles = ['BISECT_START', 'BISECT_LOG', 'BISECT_NAMES', 'BISECT_TERMS', 'BISECT_ANCESTORS_OK'];
  const presentFiles = [];
  for (const name of stateFiles) if (await pathExists(path.join(gitDir, name))) presentFiles.push(name);
  return { refs: refs.stdout.trim().split(/\r?\n/).filter(Boolean), presentFiles };
}

const expected = (await command('git', ['log', '--format=%H', '--fixed-strings', '--grep=refactor(theme): normalize map overlay layers', 'visual-good..visual-bad'], repoPath)).stdout.trim().split(/\r?\n/)[0];
if (!expected) throw new Error('Could not resolve the planted fixture culprit.');
const initialStatus = (await command('git', ['status', '--porcelain=v1'], repoPath)).stdout;
const runs = [];
const summaryPath = path.join(outputDir, `reliability-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

for (let index = 1; index <= 5; index += 1) {
  if (await portOpen(config.port)) throw new Error(`Port ${config.port} was occupied before run ${index}.`);
  process.stdout.write(`\n========== RELIABILITY RUN ${index}/5 ==========\n`);
  const wallStarted = Date.now();
  const invocation = await command(process.execPath, [path.join(root, 'dist', 'cli.js'), 'run', configPath], root);
  if (invocation.code !== 0) throw new Error(`Reliability run ${index} exited ${invocation.code}.`);
  const reportMatch = invocation.stdout.match(/^Report:\s+(.+report\.html)\s*$/m);
  if (!reportMatch) throw new Error(`Reliability run ${index} did not print a report path.`);
  const reportPath = reportMatch[1].trim();
  const artifactDir = path.dirname(reportPath);
  const terminalLogPath = path.join(outputDir, `terminal-run-${index}.log`);
  await writeFile(terminalLogPath, `${invocation.stdout}${invocation.stderr}`, 'utf8');
  const result = JSON.parse(await readFile(path.join(artifactDir, 'run-result.json'), 'utf8'));
  const cleanup = JSON.parse(await readFile(path.join(artifactDir, 'cleanup.json'), 'utf8'));
  const status = (await command('git', ['status', '--porcelain=v1'], repoPath)).stdout;
  const worktrees = (await command('git', ['worktree', 'list', '--porcelain'], repoPath)).stdout;
  const bisectState = await inspectBisectState(repoPath);
  const checks = {
    culpritCorrect: result.culprit.hash === expected,
    statusPreserved: status === initialStatus,
    worktreeRemoved: cleanup.worktreeRemoved === true && !/pixelbisect-worktree-/i.test(worktrees),
    bisectStateRemoved: cleanup.bisectStateRemoved === true && bisectState.refs.length === 0 && bisectState.presentFiles.length === 0,
    portReleased: cleanup.portReleased === true && !(await portOpen(config.port)),
    cleanupErrorFree: cleanup.error === null,
    under90Seconds: result.durationMs < 90_000,
    progressContract: /Range: 64 commits/.test(invocation.stdout)
      && /install\s+(dependencies|reused)/.test(invocation.stdout)
      && /start\s+port/.test(invocation.stdout)
      && /capture\s+#fleet-board/.test(invocation.stdout)
      && /compare\s+good baseline/.test(invocation.stdout)
      && /\[\d+\/6\].*(GOOD|BAD).*% changed.*remaining.*elapsed/.test(invocation.stdout),
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Reliability run ${index} failed checks: ${JSON.stringify(checks)}`);
  runs.push({
    run: index,
    culprit: result.culprit.hash,
    durationMs: result.durationMs,
    wallDurationMs: Date.now() - wallStarted,
    comparisons: result.records.length,
    changedPercent: result.comparison.changedPercent,
    reportPath,
    artifactDir,
    terminalLogPath,
    bisectState,
    checks,
  });
  await writeFile(summaryPath, JSON.stringify({ expectedCulprit: expected, configPath, completedRuns: runs.length, runs }, null, 2), 'utf8');
}

const summary = { generatedAt: new Date().toISOString(), expectedCulprit: expected, configPath, allPassed: true, runs };
await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(`\nFive-run reliability gate passed. Evidence: ${summaryPath}`);
