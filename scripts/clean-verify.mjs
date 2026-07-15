import { spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputDir = path.join(root, 'test-output');
const logPath = path.join(outputDir, 'clean-checkout-test.log');
const evidencePath = path.join(outputDir, 'clean-checkout-verification.json');
await mkdir(outputDir, { recursive: true });
await writeFile(logPath, '', 'utf8');
const tempParent = await mkdtemp(path.join(os.tmpdir(), 'pixelbisect-clean-checkout-'));
const checkout = path.join(tempParent, 'repo');
const commands = [];

async function run(label, executable, args, cwd, shell = false) {
  const started = Date.now();
  await appendFile(logPath, `\n===== ${label} =====\n`, 'utf8');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const receive = (stream, chunk) => {
      const text = String(chunk);
      if (stream === 'stdout') { stdout += text; process.stdout.write(text); } else { stderr += text; process.stderr.write(text); }
      void appendFile(logPath, text, 'utf8');
    };
    child.stdout.on('data', (chunk) => receive('stdout', chunk));
    child.stderr.on('data', (chunk) => receive('stderr', chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
  const record = { label, command: [executable, ...args].join(' '), code: result.code, durationMs: Date.now() - started };
  commands.push(record);
  if (result.code !== 0) throw new Error(`${label} failed with exit code ${result.code}.`);
  return result;
}

let success = false;
try {
  const sourceStatus = await run('source status', 'git', ['status', '--porcelain=v1', '--untracked-files=no'], root);
  if (sourceStatus.stdout !== '') throw new Error('Source checkout has tracked changes; commit them before clean verification.');
  await run('clean clone', 'git', ['clone', '--no-local', root, checkout], root);
  await run('clean npm ci', 'npm ci', [], checkout, true);
  await run('Playwright Chromium availability', 'npx playwright install chromium', [], checkout, true);
  await run('complete test suite', 'npm test', [], checkout, true);
  const finalStatus = await run('clean checkout final status', 'git', ['status', '--porcelain=v1', '--untracked-files=no'], checkout);
  if (finalStatus.stdout !== '') throw new Error('Clean checkout gained tracked changes during build/tests.');
  const commit = (await run('verified commit', 'git', ['rev-parse', 'HEAD'], checkout)).stdout.trim();
  success = true;
  await writeFile(evidencePath, JSON.stringify({ verifiedAt: new Date().toISOString(), success, sourceRoot: root, commit, commands, logPath }, null, 2), 'utf8');
  console.log(`Clean-checkout verification passed. Evidence: ${evidencePath}`);
} catch (error) {
  await writeFile(evidencePath, JSON.stringify({ verifiedAt: new Date().toISOString(), success, error: error instanceof Error ? error.message : String(error), commands, logPath, retainedCheckout: checkout }, null, 2), 'utf8');
  throw error;
} finally {
  if (success) await rm(tempParent, { recursive: true, force: true });
}
