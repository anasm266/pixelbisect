import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runExecutable } from '../../src/processes.js';
import { runInvestigation } from '../../src/runner.js';
import { commitFile, freePort, initRepository, temporaryDirectory } from '../helpers.js';

const server = `
const http=require('node:http'),fs=require('node:fs');
const port=Number(process.argv[2]);
http.createServer((_q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(fs.readFileSync('page.html'))}).listen(port,'127.0.0.1');
`;

test('native git bisect aborts on midpoint infrastructure failure and cleans up', { timeout: 30_000 }, async () => {
  const root = await temporaryDirectory('pixelbisect-bisect-abort-');
  const repo = path.join(root, 'repo');
  const artifacts = path.join(root, 'artifacts');
  try {
    await mkdir(repo);
    await mkdir(artifacts);
    await initRepository(repo);
    await Promise.all([
      writeFile(path.join(repo, 'package.json'), '{"name":"abort-fixture","version":"1.0.0"}', 'utf8'),
      writeFile(path.join(repo, 'install.cjs'), "require('node:fs').mkdirSync('node_modules',{recursive:true})", 'utf8'),
      writeFile(path.join(repo, 'server.cjs'), server, 'utf8'),
      writeFile(path.join(repo, 'page.html'), '<style>#target{width:100px;height:50px;background:#2563eb}</style><div id="target"></div>', 'utf8'),
    ]);
    await runExecutable('git', ['add', '.'], { cwd: repo });
    await runExecutable('git', ['commit', '-m', 'good endpoint'], { cwd: repo });
    const good = (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
    await commitFile(repo, 'notes.txt', 'one', 'good midpoint');
    await writeFile(path.join(repo, 'page.html'), '<style>#target{width:100px;height:50px;background:#e5e7eb}</style><div id="target"></div>', 'utf8');
    await runExecutable('git', ['add', 'page.html'], { cwd: repo });
    await runExecutable('git', ['commit', '-m', 'visual regression'], { cwd: repo });
    await commitFile(repo, 'notes.txt', 'two', 'bad endpoint');
    const bad = (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
    const failScript = path.join(root, 'fail-midpoints.cjs');
    await writeFile(failScript, `const e=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(e!==process.argv[2]&&e!==process.argv[3]){process.stderr.write('midpoint infrastructure failure\\n');process.exit(23)}`, 'utf8');
    const port = await freePort();
    const configPath = path.join(root, 'config.json');
    await writeFile(configPath, JSON.stringify({
      repoPath: repo, goodCommit: good, badCommit: bad, installCommand: 'node install.cjs',
      buildCommand: `node "${failScript}" ${good} ${bad}`, startCommand: `node server.cjs ${port}`, port,
      readinessUrl: `http://127.0.0.1:${port}`, targetUrl: `http://127.0.0.1:${port}`, selector: '#target',
      viewport: { width: 320, height: 240 }, startupTimeoutMs: 3000, captureTimeoutMs: 3000,
      pixelColorThreshold: 0.1, maxChangedPixelPercent: 0,
    }), 'utf8');
    await assert.rejects(runInvestigation(configPath, { artifactRoot: artifacts }), /Native Git bisect aborted/);
    const run = (await readdir(artifacts, { withFileTypes: true })).find((entry) => entry.isDirectory());
    assert.ok(run);
    const bisectLog = await readFile(path.join(artifacts, run.name, 'git-bisect.log'), 'utf8');
    assert.match(bisectLog, /infrastructure error[\s\S]*Build failed with exit code 23/i);
    const cleanup = JSON.parse(await readFile(path.join(artifacts, run.name, 'cleanup.json'), 'utf8')) as { worktreeRemoved: boolean; portReleased: boolean; error: string | null };
    assert.deepEqual(cleanup, { ...cleanup, worktreeRemoved: true, portReleased: true, error: null });
    assert.doesNotMatch((await runExecutable('git', ['worktree', 'list', '--porcelain'], { cwd: repo })).stdout, /pixelbisect-worktree-/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
