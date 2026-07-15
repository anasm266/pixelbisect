import { chromium, type Browser } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PixelBisectError, errorMessage } from './errors.js';
import type { PixelBisectConfig } from './types.js';

const captureCss = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
  html { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
`;

const activeBrowsers = new Set<Browser>();

export async function closeActiveBrowsers(): Promise<void> {
  await Promise.all([...activeBrowsers].map(async (browser) => {
    try { await browser.close(); } catch { /* already closed */ }
  }));
}

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PixelBisectError(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function captureElement(
  config: PixelBisectConfig,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  activeBrowsers.add(browser);
  try {
    const context = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(config.captureTimeoutMs);
    try {
      const response = await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: config.captureTimeoutMs });
      if (response && !response.ok()) throw new PixelBisectError(`Target URL returned HTTP ${response.status()}.`);
      await page.addStyleTag({ content: captureCss });
      const locator = page.locator(config.selector).first();
      await locator.waitFor({ state: 'visible', timeout: config.captureTimeoutMs });
      await locator.scrollIntoViewIfNeeded({ timeout: config.captureTimeoutMs });
      await withinTimeout(page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }), config.captureTimeoutMs, 'Font/render settling');
      await locator.screenshot({
        path: outputPath,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        timeout: config.captureTimeoutMs,
      });
    } catch (error) {
      throw new PixelBisectError(`Capture failed for selector "${config.selector}" at ${config.targetUrl}: ${errorMessage(error)}`);
    } finally {
      await context.close();
    }
  } finally {
    activeBrowsers.delete(browser);
    if (browser.isConnected()) await browser.close();
  }
}
