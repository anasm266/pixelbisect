import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PixelBisectError } from '../errors.js';
import { runExecutable } from '../processes.js';

const markerName = '.pixelbisect-demo-fixture';
const regressionIndex = 32;
const commitCount = 64;

const packageJson = `{
  "name": "pixelbisect-demo-fixture",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite" },
  "devDependencies": { "vite": "6.1.0" }
}
`;

// Vite 6.1.0 lockfile, embedded so fixture history is reproducible without consulting
// the live npm registry during generation.
const packageLockGzipBase64 = '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';

const indexHtml = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar Checkout</title></head>
<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>
</html>
`;

const mainJs = `import './style.css';

document.querySelector('#app').innerHTML = \`
  <main class="checkout-shell">
    <div class="brand">NORTHSTAR</div>
    <section class="checkout-card" aria-labelledby="checkout-title">
      <p class="eyebrow">Secure checkout</p>
      <h1 id="checkout-title">Complete your order</h1>
      <div class="order-row"><span>Developer Toolkit</span><strong>$49.00</strong></div>
      <button id="checkout-button" type="button">Complete purchase</button>
      <p class="fine-print">Encrypted payment · Instant access</p>
    </section>
  </main>
\`;
`;

function styleCss(buttonColor: string): string {
  return `:root {
  font-family: Arial, Helvetica, sans-serif;
  color: #172033;
  background: #eef2f7;
  --button-primary: ${buttonColor};
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { min-height: 100vh; }
button { font: inherit; }
.checkout-shell { min-height: 100vh; display: grid; place-items: center; padding: 32px; }
.brand { position: fixed; top: 28px; left: 34px; color: #334155; font-size: 13px; font-weight: 800; letter-spacing: 0.18em; }
.checkout-card { width: 420px; padding: 34px; border: 1px solid #d8e0eb; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 50px rgba(51,65,85,.12); }
.eyebrow { margin: 0 0 7px; color: #64748b; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
h1 { margin: 0 0 28px; color: #0f172a; font-size: 28px; line-height: 1.15; }
.order-row { display: flex; justify-content: space-between; padding: 18px 0; border-block: 1px solid #e2e8f0; color: #334155; }
#checkout-button { display: block; width: 352px; height: 56px; margin-top: 24px; border: 0; border-radius: 10px; background: var(--button-primary); color: #ffffff; font-weight: 800; text-align: center; }
.fine-print { margin: 13px 0 0; color: #64748b; font-size: 12px; text-align: center; }
`;
}

const messages = [
  'feat: establish deterministic checkout fixture',
  'docs: record checkout page ownership', 'docs: capture accessibility review scope', 'docs: note supported browser baseline',
  'docs: clarify payment copy guidelines', 'docs: describe order summary contract', 'docs: add checkout release checklist',
  'docs: record keyboard review outcome', 'docs: add selector stability policy', 'docs: document system font decision',
  'docs: capture layout measurement notes', 'docs: add local development hints', 'docs: record color contrast baseline',
  'docs: describe deterministic test data', 'docs: add error-state design notes', 'docs: record focus order expectations',
  'docs: add responsive layout constraints', 'docs: document button sizing rationale', 'docs: record content review approval',
  'docs: add release verification steps', 'docs: clarify checkout route behavior', 'docs: record dependency policy',
  'docs: add visual QA checklist', 'docs: document offline fixture requirement', 'docs: record heading hierarchy',
  'docs: add browser capture notes', 'docs: clarify stable viewport contract', 'docs: record spacing token choices',
  'docs: add screenshot review rubric', 'docs: document regression escalation', 'docs: record primary action semantics',
  'docs: add theme maintenance notes',
  'fix(theme): align primary action with neutral palette',
  'docs: record post-theme review', 'docs: add checkout telemetry proposal', 'docs: clarify test account policy',
  'docs: capture copy localization notes', 'docs: add payment provider boundary', 'docs: record loading-state guidance',
  'docs: clarify empty-cart redirect', 'docs: add checkout support playbook', 'docs: document visual evidence format',
  'docs: record selector ownership', 'docs: add dependency update checklist', 'docs: clarify browser support matrix',
  'docs: capture privacy review notes', 'docs: add page performance budget', 'docs: record server readiness contract',
  'docs: clarify static asset policy', 'docs: add incident reproduction steps', 'docs: document route test coverage',
  'docs: record form validation guidance', 'docs: add checkout smoke-test steps', 'docs: clarify deployment preview use',
  'docs: record button label decision', 'docs: add visual baseline ownership', 'docs: document build reproducibility',
  'docs: record final accessibility pass', 'docs: add demo rehearsal checklist', 'docs: clarify report sharing policy',
  'docs: record fixture maintenance owner', 'docs: add release sign-off template', 'docs: document regression drill',
  'docs: finalize deterministic demo notes',
];

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function git(directory: string, args: string[], index = 0): Promise<string> {
  const date = new Date(Date.UTC(2025, 0, 1, 12, index, 0)).toISOString();
  const result = await runExecutable('git', args, {
    cwd: directory,
    env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return result.stdout.trim();
}

export interface FixtureResult {
  repoPath: string;
  configPath: string;
  goodHash: string;
  badHash: string;
  culpritHash: string;
  culpritIndex: number;
  commitCount: number;
}

export async function generateDemoFixture(output: string, options: { force?: boolean } = {}): Promise<FixtureResult> {
  const repoPath = path.resolve(output);
  const marker = path.join(repoPath, markerName);
  if (await exists(repoPath)) {
    if (!options.force) throw new PixelBisectError(`Fixture directory already exists: ${repoPath}. Pass --force to recreate a PixelBisect fixture.`);
    if (!(await exists(marker))) throw new PixelBisectError(`Refusing to remove ${repoPath}: it is not marked as a PixelBisect demo fixture.`);
    await rm(repoPath, { recursive: true, force: true });
  }
  await mkdir(path.join(repoPath, 'src'), { recursive: true });
  await mkdir(path.join(repoPath, 'docs'), { recursive: true });
  await writeFile(path.join(repoPath, markerName), 'PixelBisect deterministic demo fixture\n', 'utf8');
  await writeFile(path.join(repoPath, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');
  await writeFile(path.join(repoPath, 'package.json'), packageJson, 'utf8');
  await writeFile(path.join(repoPath, 'index.html'), indexHtml, 'utf8');
  await writeFile(path.join(repoPath, 'src', 'main.js'), mainJs, 'utf8');
  await writeFile(path.join(repoPath, 'src', 'style.css'), styleCss('#2563eb'), 'utf8');
  await writeFile(path.join(repoPath, 'docs', 'project-notes.md'), '# Checkout project notes\n\nDeterministic fixture initialized.\n', 'utf8');

  await writeFile(
    path.join(repoPath, 'package-lock.json'),
    gunzipSync(Buffer.from(packageLockGzipBase64, 'base64')),
  );
  await runExecutable('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await runExecutable('git', ['config', 'user.name', 'PixelBisect Demo'], { cwd: repoPath });
  await runExecutable('git', ['config', 'user.email', 'demo@pixelbisect.local'], { cwd: repoPath });
  await runExecutable('git', ['config', 'core.autocrlf', 'false'], { cwd: repoPath });
  await git(repoPath, ['add', '.'], 0);
  await git(repoPath, ['commit', '-m', messages[0]], 0);
  const goodHash = await git(repoPath, ['rev-parse', 'HEAD']);
  await git(repoPath, ['tag', 'visual-good', goodHash]);
  let culpritHash = '';

  for (let index = 1; index < commitCount; index += 1) {
    if (index === regressionIndex) {
      await writeFile(path.join(repoPath, 'src', 'style.css'), styleCss('#e5e7eb'), 'utf8');
    } else {
      const notes = await readFile(path.join(repoPath, 'docs', 'project-notes.md'), 'utf8');
      await writeFile(path.join(repoPath, 'docs', 'project-notes.md'), `${notes}- Review ${String(index).padStart(2, '0')}: ${messages[index]}\n`, 'utf8');
    }
    await git(repoPath, ['add', '.'], index);
    await git(repoPath, ['commit', '-m', messages[index]], index);
    if (index === regressionIndex) culpritHash = await git(repoPath, ['rev-parse', 'HEAD']);
  }
  const badHash = await git(repoPath, ['rev-parse', 'HEAD']);
  await git(repoPath, ['tag', 'visual-bad', badHash]);
  const config = {
    repoPath: '.', goodCommit: 'visual-good', badCommit: 'visual-bad', installCommand: 'npm ci', buildCommand: null,
    startCommand: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', port: 4173,
    readinessUrl: 'http://127.0.0.1:4173/', targetUrl: 'http://127.0.0.1:4173/checkout', selector: '#checkout-button',
    viewport: { width: 1280, height: 720 }, startupTimeoutMs: 15_000, captureTimeoutMs: 10_000,
    pixelColorThreshold: 0.1, maxChangedPixelPercent: 0.5,
  };
  const configPath = path.join(repoPath, 'pixelbisect.config.json');
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await runExecutable('git', ['add', 'pixelbisect.config.json'], { cwd: repoPath });
  await runExecutable('git', ['commit', '--amend', '--no-edit'], {
    cwd: repoPath,
    env: {
      GIT_AUTHOR_DATE: new Date(Date.UTC(2025, 0, 1, 12, 63, 0)).toISOString(),
      GIT_COMMITTER_DATE: new Date(Date.UTC(2025, 0, 1, 12, 63, 0)).toISOString(),
    },
  });
  const amendedBadHash = await git(repoPath, ['rev-parse', 'HEAD']);
  await git(repoPath, ['tag', '--force', 'visual-bad', amendedBadHash]);
  const count = Number.parseInt(await git(repoPath, ['rev-list', '--first-parent', '--count', 'visual-good..visual-bad']), 10) + 1;
  if (count !== commitCount) throw new PixelBisectError(`Fixture generation produced ${count} commits instead of ${commitCount}.`);
  const status = (await runExecutable('git', ['status', '--porcelain=v1'], { cwd: repoPath })).stdout;
  if (status !== '') throw new PixelBisectError(`Fixture repository is not clean after generation:\n${status}`);
  return { repoPath, configPath, goodHash, badHash: amendedBadHash, culpritHash, culpritIndex: regressionIndex, commitCount };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run fixture:generate -- [output-directory] [--force]');
    return;
  }
  const force = args.includes('--force');
  const positional = args.filter((arg) => arg !== '--force');
  if (positional.length > 1) throw new PixelBisectError('Usage: npm run fixture:generate -- [output-directory] [--force]');
  const output = positional[0] ?? path.resolve('demo-fixture');
  const result = await generateDemoFixture(output, { force });
  console.log(`Created ${result.commitCount}-commit fixture: ${result.repoPath}`);
  console.log(`Known good: visual-good (${result.goodHash.slice(0, 12)})`);
  console.log(`Known bad:  visual-bad (${result.badHash.slice(0, 12)})`);
  console.log(`Planted culprit: ${result.culpritHash.slice(0, 12)} (commit ${result.culpritIndex + 1} of ${result.commitCount})`);
  console.log(`Config: ${result.configPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
