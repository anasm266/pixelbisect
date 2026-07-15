import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { runExecutable } from '../src/processes.js';

export async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function initRepository(directory: string): Promise<void> {
  await runExecutable('git', ['init', '--initial-branch=main'], { cwd: directory });
  await runExecutable('git', ['config', 'user.name', 'PixelBisect Test'], { cwd: directory });
  await runExecutable('git', ['config', 'user.email', 'pixelbisect@example.test'], { cwd: directory });
}

export async function commitFile(directory: string, name: string, content: string, message: string): Promise<string> {
  await writeFile(path.join(directory, name), content, 'utf8');
  await runExecutable('git', ['add', name], { cwd: directory });
  await runExecutable('git', ['commit', '-m', message], { cwd: directory });
  return (await runExecutable('git', ['rev-parse', 'HEAD'], { cwd: directory })).stdout.trim();
}

export async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
