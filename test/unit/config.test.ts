import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { loadConfig, validateConfig } from '../../src/config.js';
import { PixelBisectError } from '../../src/errors.js';
import { temporaryDirectory } from '../helpers.js';

const valid = {
  repoPath: './repo', goodCommit: 'good', installCommand: 'npm ci', startCommand: 'npm start', port: 4173,
  readinessUrl: 'http://127.0.0.1:4173', targetUrl: 'http://127.0.0.1:4173/checkout', selector: '#button',
};

test('validates configuration, resolves repo path, and applies defaults', () => {
  const parsed = validateConfig(valid, path.resolve('configs/pixelbisect.json'));
  assert.equal(parsed.badCommit, 'HEAD');
  assert.equal(parsed.buildCommand, null);
  assert.deepEqual(parsed.viewport, { width: 1280, height: 720 });
  assert.equal(parsed.pixelColorThreshold, 0.1);
  assert.equal(parsed.maxChangedPixelPercent, 0.5);
  assert.equal(parsed.repoPath, path.resolve('configs/repo'));
});

test('rejects malformed and invalid configuration with readable field names', () => {
  assert.throws(() => validateConfig({ ...valid, selector: '' }, 'config.json'), /selector/);
  assert.throws(() => validateConfig({ ...valid, port: 70000 }, 'config.json'), /port/);
  assert.throws(() => validateConfig({ ...valid, readinessUrl: 'file:\/\/bad' }, 'config.json'), /readinessUrl/);
  assert.throws(() => validateConfig({ ...valid, pixelColorThreshold: 2 }, 'config.json'), /pixelColorThreshold/);
});

test('reports missing files and invalid JSON as PixelBisect errors', async () => {
  const dir = await temporaryDirectory('pixelbisect-config-');
  await assert.rejects(loadConfig(path.join(dir, 'missing.json')), PixelBisectError);
  const invalid = path.join(dir, 'invalid.json');
  await writeFile(invalid, '{oops', 'utf8');
  await assert.rejects(loadConfig(invalid), /Invalid JSON/);
});
