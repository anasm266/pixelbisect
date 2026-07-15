import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { isPortOpen, runExecutable } from '../../src/processes.js';
import { runInvestigation } from '../../src/runner.js';
import { freePort, initRepository, temporaryDirectory } from '../helpers.js';

interface Fixture {
  repo: string;
  good: string;
  bad: string;
}

interface CleanupRecord {
  worktreeRemoved: boolean;
  portReleased: boolean;
  bisectStateRemoved: boolean;
  error: string | null;
}

const page = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; }
      #target { width: 120px; height: 60px; background: rgb(24, 92, 160); }
    </style>
  </head>
  <body><div id="target"></div></body>
</html>`;

const serverSource = `
const http = require('node:http');
const fs = require('node:fs');
const port = Number(process.argv[2]);
const html = fs.readFileSync('page.html', 'utf8');
http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1');
`;

async function commitAll(repo: string, message: string): Promise<string> {
  await runExecutable('git', ['add', '.'], { cwd: repo });
  await runExecutable('git', ['commit', '-m', message], { cwd: repo });
  return (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
}

async function createFixture(root: string): Promise<Fixture> {
  const repo = path.join(root, 'repo');
  await mkdir(repo, { recursive: true });
  await initRepository(repo);
  await Promise.all([
    writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'pixelbisect-failure-fixture', version: '1.0.0', private: true }), 'utf8'),
    writeFile(path.join(repo, 'install.cjs'), "require('node:fs').mkdirSync('node_modules', { recursive: true });\n", 'utf8'),
    writeFile(path.join(repo, 'fail-install.cjs'), "process.stderr.write('intentional install failure\\n'); process.exit(7);\n", 'utf8'),
    writeFile(path.join(repo, 'fail-build.cjs'), "process.stderr.write('intentional build failure\\n'); process.exit(9);\n", 'utf8'),
    writeFile(path.join(repo, 'idle.cjs'), 'setInterval(() => {}, 1000);\n', 'utf8'),
    writeFile(path.join(repo, 'server.cjs'), serverSource, 'utf8'),
    writeFile(path.join(repo, 'page.html'), page, 'utf8'),
    writeFile(path.join(repo, 'marker.txt'), 'good\n', 'utf8'),
  ]);
  const good = await commitAll(repo, 'known good');
  await writeFile(path.join(repo, 'marker.txt'), 'bad but visually unchanged\n', 'utf8');
  const bad = await commitAll(repo, 'known bad');
  return { repo, good, bad };
}

function validConfig(fixture: Fixture, port: number): Record<string, unknown> {
  return {
    repoPath: fixture.repo,
    goodCommit: fixture.good,
    badCommit: fixture.bad,
    installCommand: 'node install.cjs',
    buildCommand: null,
    startCommand: `node server.cjs ${port}`,
    port,
    readinessUrl: `http://127.0.0.1:${port}/ready`,
    targetUrl: `http://127.0.0.1:${port}/target`,
    selector: '#target',
    viewport: { width: 320, height: 240 },
    startupTimeoutMs: 1_000,
    captureTimeoutMs: 1_000,
    pixelColorThreshold: 0.1,
    maxChangedPixelPercent: 0,
  };
}

async function writeConfig(root: string, config: unknown, name = 'pixelbisect.config.json'): Promise<string> {
  const configPath = path.join(root, name);
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

async function cleanupRecord(artifactRoot: string): Promise<CleanupRecord> {
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  const runs = entries.filter((entry) => entry.isDirectory());
  assert.equal(runs.length, 1, 'a failed runtime investigation should create exactly one artifact directory');
  return JSON.parse(await readFile(path.join(artifactRoot, runs[0].name, 'cleanup.json'), 'utf8')) as CleanupRecord;
}

async function assertRuntimeCleanup(
  fixture: Fixture,
  artifactRoot: string,
  port: number,
  options: { externallyOccupied?: boolean } = {},
): Promise<void> {
  const cleanup = await cleanupRecord(artifactRoot);
  assert.equal(cleanup.worktreeRemoved, true);
  assert.equal(cleanup.bisectStateRemoved, true);
  assert.equal(cleanup.error, null);
  assert.equal(cleanup.portReleased, !options.externallyOccupied);
  assert.equal(await isPortOpen(port), options.externallyOccupied === true);

  const worktrees = await runExecutable('git', ['worktree', 'list', '--porcelain'], { cwd: fixture.repo });
  assert.doesNotMatch(worktrees.stdout, /pixelbisect-worktree-/i);
}

test('rejects a nonexistent repository path before creating runtime artifacts', async () => {
  const root = await temporaryDirectory('pixelbisect-invalid-repo-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = { repo: path.join(root, 'does-not-exist'), good: 'good', bad: 'bad' };
    const configPath = await writeConfig(root, validConfig(fixture, await freePort()));
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Repository path does not exist/);
    assert.deepEqual(await readdir(artifactRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid configuration before touching a repository', async () => {
  const root = await temporaryDirectory('pixelbisect-invalid-config-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const configPath = await writeConfig(root, { repoPath: '.', port: 70_000 });
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Configuration field "port"/);
    assert.deepEqual(await readdir(artifactRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid good and bad Git references with the field name', async () => {
  const root = await temporaryDirectory('pixelbisect-invalid-refs-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const base = validConfig(fixture, port);
    const badGoodRef = await writeConfig(root, { ...base, goodCommit: 'definitely-not-a-good-ref' }, 'bad-good-ref.json');
    await assert.rejects(runInvestigation(badGoodRef, { artifactRoot }), /Invalid goodCommit Git reference: definitely-not-a-good-ref/);
    const badBadRef = await writeConfig(root, { ...base, badCommit: 'definitely-not-a-bad-ref' }, 'bad-bad-ref.json');
    await assert.rejects(runInvestigation(badBadRef, { artifactRoot }), /Invalid badCommit Git reference: definitely-not-a-bad-ref/);
    assert.deepEqual(await readdir(artifactRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a good commit that is not an ancestor of bad', async () => {
  const root = await temporaryDirectory('pixelbisect-non-ancestor-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const base = fixture.good;
    await runExecutable('git', ['checkout', '-b', 'unrelated-good', base], { cwd: fixture.repo });
    await writeFile(path.join(fixture.repo, 'branch.txt'), 'good branch\n', 'utf8');
    const unrelatedGood = await commitAll(fixture.repo, 'unrelated good branch');
    await runExecutable('git', ['checkout', '--detach', fixture.bad], { cwd: fixture.repo });
    const config = validConfig({ ...fixture, good: unrelatedGood }, await freePort());
    const configPath = await writeConfig(root, config);
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /good commit .* is not an ancestor of the bad commit/i);
    assert.deepEqual(await readdir(artifactRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a good commit reachable only through a merge second parent', async () => {
  const root = await temporaryDirectory('pixelbisect-not-first-parent-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    await runExecutable('git', ['checkout', '-b', 'side-history', fixture.good], { cwd: fixture.repo });
    await writeFile(path.join(fixture.repo, 'side.txt'), 'side parent\n', 'utf8');
    const sideGood = await commitAll(fixture.repo, 'side-parent good');
    await runExecutable('git', ['checkout', 'main'], { cwd: fixture.repo });
    await runExecutable('git', ['merge', '--no-ff', 'side-history', '-m', 'merge side history'], { cwd: fixture.repo });
    const mergeBad = (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: fixture.repo })).stdout.trim();
    const configPath = await writeConfig(root, validConfig({ repo: fixture.repo, good: sideGood, bad: mergeBad }, await freePort()));
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /not on the bad commit's first-parent history/);
    assert.deepEqual(await readdir(artifactRoot), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects visually identical good and bad endpoints and cleans the worktree', async () => {
  const root = await temporaryDirectory('pixelbisect-identical-endpoints-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const configPath = await writeConfig(root, validConfig(fixture, port));
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /endpoints are visually identical/i);
    await assertRuntimeCleanup(fixture, artifactRoot, port);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a missing selector and cleans up the server and worktree', async () => {
  const root = await temporaryDirectory('pixelbisect-missing-selector-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const config = { ...validConfig(fixture, port), selector: '#does-not-exist', captureTimeoutMs: 300 };
    const configPath = await writeConfig(root, config);
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Capture failed for selector "#does-not-exist"/);
    await assertRuntimeCleanup(fixture, artifactRoot, port);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('surfaces dependency installation failure and removes the worktree', async () => {
  const root = await temporaryDirectory('pixelbisect-install-failure-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const config = { ...validConfig(fixture, port), installCommand: 'node fail-install.cjs' };
    const configPath = await writeConfig(root, config);
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Dependency installation failed with exit code 7/);
    await assertRuntimeCleanup(fixture, artifactRoot, port);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('surfaces build failure and removes the worktree', async () => {
  const root = await temporaryDirectory('pixelbisect-build-failure-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const config = { ...validConfig(fixture, port), buildCommand: 'node fail-build.cjs' };
    const configPath = await writeConfig(root, config);
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Build failed with exit code 9/);
    await assertRuntimeCleanup(fixture, artifactRoot, port);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('surfaces readiness timeout, terminates the process, and releases the port', async () => {
  const root = await temporaryDirectory('pixelbisect-readiness-timeout-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    const config = {
      ...validConfig(fixture, port),
      startCommand: 'node idle.cjs',
      startupTimeoutMs: 300,
    };
    const configPath = await writeConfig(root, config);
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Server readiness timed out after 300 ms/);
    await assertRuntimeCleanup(fixture, artifactRoot, port);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects an occupied port without terminating the external listener', async () => {
  const root = await temporaryDirectory('pixelbisect-occupied-port-');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(artifactRoot);
  const blocker = net.createServer();
  try {
    const fixture = await createFixture(root);
    const port = await freePort();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(port, '127.0.0.1', resolve);
    });
    const configPath = await writeConfig(root, validConfig(fixture, port));
    await assert.rejects(runInvestigation(configPath, { artifactRoot }), /Port .* is already occupied/);
    await assertRuntimeCleanup(fixture, artifactRoot, port, { externallyOccupied: true });
  } finally {
    if (blocker.listening) await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
