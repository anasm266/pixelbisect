import assert from 'node:assert/strict';
import test from 'node:test';
import { runExecutable, runShellCommand } from '../../src/processes.js';

test('captures command output and reports command failures', async () => {
  const success = await runExecutable(process.execPath, ['-e', 'process.stdout.write("ok")'], { cwd: process.cwd() });
  assert.equal(success.stdout, 'ok');
  const failingCommand = `"${process.execPath}" -e "process.stderr.write('expected_failure');process.exit(7)"`;
  await assert.rejects(
    runShellCommand(failingCommand, { cwd: process.cwd(), label: 'Test command' }),
    /Test command failed with exit code 7[\s\S]*expected_failure/,
  );
});

test('times out and terminates a hanging command with the timeout error', async () => {
  await assert.rejects(
    runExecutable(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), timeoutMs: 200 }),
    /timed out after 200 ms/,
  );
});
