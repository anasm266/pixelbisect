import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runExecutable } from '../../src/processes.js';
import { temporaryDirectory } from '../helpers.js';

const cliPath = fileURLToPath(new URL('../../src/cli.js', import.meta.url));

test('compiled CLI exposes help/version and one readable nonzero error for invalid input', async () => {
  const help = await runExecutable(process.execPath, [cliPath, '--help'], { cwd: process.cwd() });
  assert.match(help.stdout, /pixelbisect run <config\.json>/);
  const version = await runExecutable(process.execPath, [cliPath, '--version'], { cwd: process.cwd() });
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);
  const dir = await temporaryDirectory('pixelbisect-cli-');
  const badConfig = path.join(dir, 'bad.json');
  await writeFile(badConfig, '{invalid', 'utf8');
  const failure = await runExecutable(process.execPath, [cliPath, 'run', badConfig], { cwd: process.cwd(), allowFailure: true });
  assert.notEqual(failure.code, 0);
  assert.match(failure.stderr, /^PixelBisect error: Invalid JSON in configuration file:/);
  assert.equal(failure.stderr.trim().split(/\r?\n/).length, 1);
  assert.doesNotMatch(failure.stderr, /\n\s+at /);
});
