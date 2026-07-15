#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvaluator } from './evaluate.js';
import { PixelBisectError, errorMessage } from './errors.js';
import { runInvestigation } from './runner.js';

async function version(): Promise<string> {
  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
  try { return (JSON.parse(await readFile(packagePath, 'utf8')) as { version: string }).version; } catch { return '0.1.0'; }
}

function help(): void {
  console.log(`PixelBisect — find the commit that introduced a visual regression

Usage:
  pixelbisect run <config.json>
  pixelbisect --help
  pixelbisect --version

PixelBisect executes configured commands from historical commits. Use trusted repositories only.`);
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === '__evaluate') {
    if (!argv[1]) return 255;
    return runEvaluator(argv[1]);
  }
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    help();
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(await version());
    return 0;
  }
  if (argv[0] !== 'run') throw new PixelBisectError(`Unknown command: ${argv[0]}. Run "pixelbisect --help" for usage.`);
  if (!argv[1]) throw new PixelBisectError('Missing configuration path. Usage: pixelbisect run <config.json>');
  if (argv.length > 2) throw new PixelBisectError(`Unexpected argument: ${argv[2]}`);
  await runInvestigation(path.resolve(argv[1]));
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`PixelBisect error: ${errorMessage(error)}`);
  process.exitCode = error instanceof PixelBisectError ? error.exitCode : 2;
}
