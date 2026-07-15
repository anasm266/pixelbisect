import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PixelBisectError } from './errors.js';

const active = new Set<ChildProcess>();

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

function track(child: ChildProcess): ChildProcess {
  active.add(child);
  child.once('exit', () => active.delete(child));
  child.once('error', () => active.delete(child));
  return child;
}

export async function terminateProcessTree(child: ChildProcess, force = true): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', () => resolve());
      killer.once('exit', () => resolve());
    });
  } else {
    try {
      process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch { /* already gone */ }
    }
  }
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    setTimeout(resolve, 2_000).unref();
  });
}

export async function terminateAllProcesses(): Promise<void> {
  await Promise.all([...active].map((child) => terminateProcessTree(child)));
}

export async function terminateProcessesOnPort(port: number): Promise<void> {
  if (process.platform !== 'win32') return;
  const listing = await runExecutable('netstat', ['-ano', '-p', 'tcp'], { cwd: process.cwd(), allowFailure: true });
  if (listing.code !== 0) return;
  const pids = new Set<number>();
  for (const line of listing.stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP') continue;
    const local = columns[1];
    const state = columns[3]?.toUpperCase();
    const pid = Number.parseInt(columns.at(-1) ?? '', 10);
    if (state === 'LISTENING' && local.endsWith(`:${port}`) && Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  await Promise.all([...pids].map((pid) => new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('error', () => resolve());
    killer.once('exit', () => resolve());
  })));
}

export async function runExecutable(
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; stream?: boolean; env?: NodeJS.ProcessEnv; allowFailure?: boolean; shell?: boolean },
): Promise<CommandResult> {
  const child = track(spawn(executable, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    detached: process.platform !== 'win32',
    shell: options.shell ?? false,
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    const text = String(chunk);
    stdout += text;
    if (options.stream) process.stdout.write(text);
  });
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk);
    stderr += text;
    if (options.stream) process.stderr.write(text);
  });

  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const result = await new Promise<CommandResult>((resolve, reject) => {
    child.once('error', (error) => { if (!timedOut) reject(error); });
    child.once('exit', (code, signal) => {
      if (!timedOut) resolve({ stdout, stderr, code: code ?? (signal ? 128 : 1) });
    });
    if (options.timeoutMs) {
      timer = setTimeout(async () => {
        timedOut = true;
        await terminateProcessTree(child);
        reject(new PixelBisectError(`${executable} timed out after ${options.timeoutMs} ms.`));
      }, options.timeoutMs);
    }
  }).finally(() => timer && clearTimeout(timer));

  if (result.code !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout).trim();
    throw new PixelBisectError(`Command failed (${executable} ${args.join(' ')}):${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

export async function runShellCommand(
  command: string,
  options: { cwd: string; timeoutMs?: number; label: string; logPath?: string },
): Promise<CommandResult> {
  const result = await runExecutable(command, [], { cwd: options.cwd, timeoutMs: options.timeoutMs, allowFailure: true, shell: true });
  if (options.logPath) {
    await mkdir(path.dirname(options.logPath), { recursive: true });
    await writeFile(options.logPath, `${result.stdout}${result.stderr}`, 'utf8');
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().slice(-4000);
    throw new PixelBisectError(`${options.label} failed with exit code ${result.code}.${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

export async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

export async function waitForPortRelease(port: number, timeoutMs = 5_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new PixelBisectError(`Port ${port} remained occupied after the server was stopped.`);
}

export interface RunningServer {
  child: ChildProcess;
  stop(): Promise<void>;
  logPath: string;
}

export async function startServer(options: {
  command: string;
  cwd: string;
  port: number;
  readinessUrl: string;
  timeoutMs: number;
  logPath: string;
}): Promise<RunningServer> {
  if (await isPortOpen(options.port)) {
    throw new PixelBisectError(`Port ${options.port} is already occupied. Stop the existing process or choose another port.`);
  }
  await mkdir(path.dirname(options.logPath), { recursive: true });
  await writeFile(options.logPath, '', 'utf8');
  const child = track(spawn(options.command, [], {
    cwd: options.cwd,
    env: { ...process.env, BROWSER: 'none', CI: '1' },
    windowsHide: true,
    detached: process.platform !== 'win32',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  let tail = '';
  const log = (chunk: unknown) => {
    const text = String(chunk);
    tail = (tail + text).slice(-4000);
    void appendFile(options.logPath, text, 'utf8').catch(() => undefined);
  };
  child.stdout?.on('data', log);
  child.stderr?.on('data', log);

  const stop = async () => {
    await terminateProcessTree(child);
    if (await isPortOpen(options.port)) await terminateProcessesOnPort(options.port);
    await waitForPortRelease(options.port);
  };

  const deadline = Date.now() + options.timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new PixelBisectError(`Server exited before becoming ready (code ${child.exitCode}).${tail.trim() ? `\n${tail.trim()}` : ''}`);
      }
      try {
        const response = await fetch(options.readinessUrl, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) return { child, stop, logPath: options.logPath };
      } catch { /* keep polling */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new PixelBisectError(`Server readiness timed out after ${options.timeoutMs} ms at ${options.readinessUrl}.${tail.trim() ? `\n${tail.trim()}` : ''}`);
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}
