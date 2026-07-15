import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runEvaluator } from '../../src/evaluate.js';
import { temporaryDirectory } from '../helpers.js';

test('visual evaluator reserves 255 for infrastructure/state failure', async () => {
  const dir = await temporaryDirectory('pixelbisect-evaluator-');
  const state = path.join(dir, 'bad-state.json');
  await writeFile(state, '{bad', 'utf8');
  const original = console.error;
  const messages: string[] = [];
  console.error = (...values: unknown[]) => { messages.push(values.join(' ')); };
  try {
    assert.equal(await runEvaluator(state), 255);
  } finally { console.error = original; }
  assert.match(messages.join('\n'), /infrastructure error/i);
});
