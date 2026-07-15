import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { PixelBisectError } from './errors.js';
import { runExecutable } from './processes.js';
import type { CommitInfo } from './types.js';

export async function git(cwd: string, args: string[], allowFailure = false) {
  return runExecutable('git', args, { cwd, allowFailure });
}

export async function verifyRepository(repoPath: string): Promise<void> {
  try { await access(repoPath); } catch { throw new PixelBisectError(`Repository path does not exist: ${repoPath}`); }
  if (!(await stat(repoPath)).isDirectory()) throw new PixelBisectError(`Repository path is not a directory: ${repoPath}`);
  const result = await git(repoPath, ['rev-parse', '--is-inside-work-tree'], true);
  if (result.code !== 0 || result.stdout.trim() !== 'true') throw new PixelBisectError(`Not a Git working tree: ${repoPath}`);
}

export async function resolveCommit(repoPath: string, ref: string, label: string): Promise<string> {
  const result = await git(repoPath, ['rev-parse', '--verify', `${ref}^{commit}`], true);
  if (result.code !== 0) throw new PixelBisectError(`Invalid ${label} Git reference: ${ref}`);
  return result.stdout.trim();
}

export async function isAncestor(repoPath: string, good: string, bad: string): Promise<boolean> {
  const result = await git(repoPath, ['merge-base', '--is-ancestor', good, bad], true);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new PixelBisectError(`Could not verify ancestry between ${good} and ${bad}.`);
}

export async function isFirstParentAncestor(repoPath: string, good: string, bad: string): Promise<boolean> {
  const history = (await git(repoPath, ['rev-list', '--first-parent', bad])).stdout.trim().split(/\r?\n/);
  return history.includes(good);
}

export async function firstParentCommitCount(repoPath: string, good: string, bad: string): Promise<number> {
  const result = await git(repoPath, ['rev-list', '--first-parent', '--count', `${good}..${bad}`]);
  return Number.parseInt(result.stdout.trim(), 10) + 1;
}

export async function createDetachedWorktree(repoPath: string, worktreePath: string, commit: string): Promise<void> {
  await git(repoPath, ['worktree', 'add', '--detach', worktreePath, commit]);
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const normalized = path.resolve(worktreePath);
  const removal = await git(repoPath, ['worktree', 'remove', '--force', normalized], true);
  if (removal.code !== 0) {
    const detail = (removal.stderr || removal.stdout).trim();
    throw new PixelBisectError(`Could not remove temporary Git worktree ${normalized}.${detail ? `\n${detail}` : ''}`);
  }
}

export async function checkout(worktreePath: string, commit: string): Promise<void> {
  await git(worktreePath, ['clean', '-fdx', '-e', 'node_modules/']);
  await git(worktreePath, ['checkout', '--detach', '--force', commit]);
}

export async function currentCommit(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim();
}

export async function commitInfo(cwd: string, commit: string): Promise<CommitInfo> {
  const separator = '%x1f';
  const out = (await git(cwd, ['show', '-s', `--format=%H${separator}%h${separator}%an <%ae>${separator}%aI${separator}%s${separator}%b`, commit])).stdout;
  const [hash, shortHash, author, date, subject, body = ''] = out.trimEnd().split('\x1f');
  return { hash, shortHash, author, date, subject, body };
}

export async function firstParent(cwd: string, commit: string): Promise<string> {
  const result = await git(cwd, ['rev-parse', `${commit}^1`], true);
  if (result.code !== 0) throw new PixelBisectError(`Culprit ${commit} has no first-parent predecessor.`);
  return result.stdout.trim();
}

export async function gitDiff(cwd: string, good: string, bad: string): Promise<string> {
  return (await git(cwd, ['diff', '--no-color', '--unified=3', good, bad])).stdout;
}
