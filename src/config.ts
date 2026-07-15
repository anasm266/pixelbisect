import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PixelBisectError } from './errors.js';
import type { PixelBisectConfig } from './types.js';

const defaults = {
  badCommit: 'HEAD',
  buildCommand: null,
  viewport: { width: 1280, height: 720 },
  startupTimeoutMs: 15_000,
  captureTimeoutMs: 10_000,
  pixelColorThreshold: 0.1,
  maxChangedPixelPercent: 0.5,
} as const;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PixelBisectError(`Configuration field "${name}" must be a non-empty string.`);
  }
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, name);
}

function finiteNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new PixelBisectError(`Configuration field "${name}" must be a number from ${min} to ${max}.`);
  }
  return value;
}

function validUrl(value: unknown, name: string): string {
  const text = requiredString(value, name);
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    throw new PixelBisectError(`Configuration field "${name}" must be an http(s) URL.`);
  }
  return text;
}

export function validateConfig(raw: unknown, configPath: string): PixelBisectConfig {
  if (!object(raw)) throw new PixelBisectError('Configuration must be a JSON object.');
  const viewport = raw.viewport === undefined ? defaults.viewport : raw.viewport;
  if (!object(viewport)) throw new PixelBisectError('Configuration field "viewport" must be an object.');

  const port = finiteNumber(raw.port, 'port', 1, 65_535);
  if (!Number.isInteger(port)) throw new PixelBisectError('Configuration field "port" must be an integer.');

  return {
    repoPath: path.resolve(path.dirname(configPath), requiredString(raw.repoPath, 'repoPath')),
    goodCommit: requiredString(raw.goodCommit, 'goodCommit'),
    badCommit: raw.badCommit === undefined ? defaults.badCommit : requiredString(raw.badCommit, 'badCommit'),
    installCommand: requiredString(raw.installCommand, 'installCommand'),
    buildCommand: nullableString(raw.buildCommand, 'buildCommand'),
    startCommand: requiredString(raw.startCommand, 'startCommand'),
    port,
    readinessUrl: validUrl(raw.readinessUrl, 'readinessUrl'),
    targetUrl: validUrl(raw.targetUrl, 'targetUrl'),
    selector: requiredString(raw.selector, 'selector'),
    viewport: {
      width: Math.floor(finiteNumber(viewport.width, 'viewport.width', 1, 7680)),
      height: Math.floor(finiteNumber(viewport.height, 'viewport.height', 1, 4320)),
    },
    startupTimeoutMs: Math.floor(finiteNumber(raw.startupTimeoutMs ?? defaults.startupTimeoutMs, 'startupTimeoutMs', 100, 600_000)),
    captureTimeoutMs: Math.floor(finiteNumber(raw.captureTimeoutMs ?? defaults.captureTimeoutMs, 'captureTimeoutMs', 100, 600_000)),
    pixelColorThreshold: finiteNumber(raw.pixelColorThreshold ?? defaults.pixelColorThreshold, 'pixelColorThreshold', 0, 1),
    maxChangedPixelPercent: finiteNumber(raw.maxChangedPixelPercent ?? defaults.maxChangedPixelPercent, 'maxChangedPixelPercent', 0, 100),
  };
}

export async function loadConfig(inputPath: string): Promise<PixelBisectConfig & { configPath: string }> {
  const configPath = path.resolve(inputPath);
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new PixelBisectError(`Cannot read configuration file: ${configPath}`, 2, { cause: error });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new PixelBisectError(`Invalid JSON in configuration file: ${configPath}`, 2, { cause: error });
  }
  return { ...validateConfig(raw, configPath), configPath };
}
