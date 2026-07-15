import assert from 'node:assert/strict';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checkout, createDetachedWorktree, removeWorktree } from '../../src/git.js';
import { commitFile, initRepository, temporaryDirectory } from '../helpers.js';
import { runExecutable } from '../../src/processes.js';

test('detached worktree preserves the active branch and uncommitted files', async () => {
  const repo = await temporaryDirectory('pixelbisect-active-');
  const parent = await temporaryDirectory('pixelbisect-worktree-test-');
  const worktree = path.join(parent, 'repo');
  try {
    await initRepository(repo);
    const first = await commitFile(repo, 'app.txt', 'one', 'first');
    const second = await commitFile(repo, 'app.txt', 'two', 'second');
    await writeFile(path.join(repo, 'uncommitted.txt'), 'keep me', 'utf8');
    const branchBefore = (await runExecutable('git', ['branch', '--show-current'], { cwd: repo })).stdout.trim();
    const statusBefore = (await runExecutable('git', ['status', '--porcelain=v1'], { cwd: repo })).stdout;
    await createDetachedWorktree(repo, worktree, second);
    await mkdir(path.join(worktree, 'dist'), { recursive: true });
    await mkdir(path.join(worktree, 'node_modules'), { recursive: true });
    await writeFile(path.join(worktree, 'dist', 'stale.js'), 'stale', 'utf8');
    await writeFile(path.join(worktree, 'node_modules', 'cache.txt'), 'keep cache', 'utf8');
    await checkout(worktree, first);
    assert.equal((await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim(), first);
    await assert.rejects(access(path.join(worktree, 'dist', 'stale.js')), /ENOENT/);
    await access(path.join(worktree, 'node_modules', 'cache.txt'));
    await removeWorktree(repo, worktree);
    assert.equal((await runExecutable('git', ['branch', '--show-current'], { cwd: repo })).stdout.trim(), branchBefore);
    assert.equal((await runExecutable('git', ['status', '--porcelain=v1'], { cwd: repo })).stdout, statusBefore);
    await access(path.join(repo, 'uncommitted.txt'));
    await assert.rejects(access(worktree));
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});
