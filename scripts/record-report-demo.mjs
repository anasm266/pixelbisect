import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/record-report-demo.mjs <report.html> [output-directory]');

const reportPath = path.resolve(input);
const outputDirectory = path.resolve(process.argv[3] ?? path.join('visual-qa', 'demo-recording'));
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
  recordVideo: { dir: outputDirectory, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

const pause = (milliseconds) => page.waitForTimeout(milliseconds);
const animate = (callback, duration) => page.evaluate(
  ({ source, durationMs }) => new Promise((resolve) => {
    const fn = globalThis.eval(`(${source})`);
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      fn(eased);
      if (progress < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  }),
  { source: callback.toString(), durationMs: duration },
);

try {
  await page.goto(pathToFileURL(reportPath).href, { waitUntil: 'load' });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.transformOrigin = '50% 0';
    window.scrollTo(0, 0);
  });
  await pause(900);

  await animate((progress) => {
    document.body.style.transform = `scale(${1 + progress * 0.035})`;
  }, 900);
  await pause(450);

  await animate((progress) => {
    const slider = document.querySelector('#slider');
    slider.value = String(28 + Math.round(progress * 52));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, 1700);
  await pause(700);

  const stylesTop = await page.getByRole('heading', { name: 'Rendered style changes' }).evaluate((element) => element.closest('section').offsetTop);
  await animate((progress) => {
    const target = Number(document.documentElement.dataset.scrollTarget);
    const start = Number(document.documentElement.dataset.scrollStart);
    window.scrollTo(0, start + (target - start) * progress);
  }, await page.evaluate(({ start, target }) => {
    document.documentElement.dataset.scrollStart = String(start);
    document.documentElement.dataset.scrollTarget = String(target);
    return 1300;
  }, { start: 0, target: Math.max(0, stylesTop - 100) }));
  await pause(1100);

  const diffTop = await page.getByRole('heading', { name: 'Git diff' }).evaluate((element) => element.closest('section').offsetTop);
  const currentScroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(({ start, target }) => {
    document.documentElement.dataset.scrollStart = String(start);
    document.documentElement.dataset.scrollTarget = String(target);
  }, { start: currentScroll, target: Math.max(0, diffTop - 100) });
  await animate((progress) => {
    const target = Number(document.documentElement.dataset.scrollTarget);
    const start = Number(document.documentElement.dataset.scrollStart);
    window.scrollTo(0, start + (target - start) * progress);
  }, 1300);
  await pause(1300);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

console.log(`Recorded report demo to ${outputDirectory}`);
