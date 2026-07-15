import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import { isAncestor, isFirstParentAncestor, resolveCommit, verifyRepository } from '../../src/git.js';
import { runExecutable } from '../../src/processes.js';
import { commitFile, initRepository, temporaryDirectory } from '../helpers.js';

test('resolves hashes, tags, and branches and validates ancestry', async () => {
  const dir = await temporaryDirectory('pixelbisect-git-');
  try {
    await initRepository(dir);
    const first = await commitFile(dir, 'one.txt', 'one', 'first');
    await runExecutable('git', ['tag', 'known-good', first], { cwd: dir });
    const second = await commitFile(dir, 'two.txt', 'two', 'second');
    await verifyRepository(dir);
    assert.equal(await resolveCommit(dir, 'HEAD', 'badCommit'), second);
    assert.equal(await resolveCommit(dir, second, 'badCommit'), second);
    assert.equal(await resolveCommit(dir, 'known-good', 'goodCommit'), first);
    assert.equal(await resolveCommit(dir, 'main', 'badCommit'), second);
    assert.equal(await isAncestor(dir, first, second), true);
    assert.equal(await isFirstParentAncestor(dir, first, second), true);
    assert.equal(await isAncestor(dir, second, first), false);
    await assert.rejects(resolveCommit(dir, 'not-a-ref', 'goodCommit'), /Invalid goodCommit/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
