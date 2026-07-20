import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const reportPath = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/visual-qa.mjs <report.html> [screenshot.png]');
const screenshotPath = path.resolve(process.argv[3] ?? path.join('visual-qa', 'pixelbisect-report.png'));
await mkdir(path.dirname(screenshotPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
const pageErrors = [];
let checks;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(reportPath).href, { waitUntil: 'load' });
  const slider = page.locator('#slider');
  const beforeBox = await page.locator('#comparison > img').boundingBox();
  const afterBox = await page.locator('#comparison .after-clip img').boundingBox();
  await slider.evaluate((element) => { element.value = '67'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const positionAfterMouseEquivalent = await page.locator('#comparison').evaluate((element) => element.style.getPropertyValue('--position'));
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  const keyboardValue = await slider.inputValue();
  const copyButton = page.locator('#copy-hash');
  await copyButton.click();
  checks = {
    titleVisible: await page.locator('h1').isVisible(),
    allImagesLoaded: await page.locator('img').evaluateAll((images) => images.length === 3 && images.every((image) => image.complete && image.naturalWidth > 0)),
    screenshotsAligned: Boolean(beforeBox && afterBox && beforeBox.x === afterBox.x && beforeBox.y === afterBox.y && beforeBox.width === afterBox.width && beforeBox.height === afterBox.height),
    sliderInputUpdates: positionAfterMouseEquivalent === '67%',
    sliderKeyboardUpdates: keyboardValue === '68',
    copyButtonWorks: await copyButton.textContent() === 'Copied',
    reportActionsVisible: await page.locator('.hero-actions').isVisible(),
    styleChangesVisible: await page.getByRole('heading', { name: 'Rendered style changes' }).isVisible(),
    styleRowsRendered: await page.locator('.style-table tbody tr').count() > 0,
    diffReadable: await page.locator('pre').isVisible(),
    noViewportOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    noConsoleErrors: consoleErrors.length === 0,
    noPageErrors: pageErrors.length === 0,
  };
  await slider.evaluate((element) => element.blur());
  await page.screenshot({ path: screenshotPath, fullPage: true });
} finally { await browser.close(); }
const evidencePath = screenshotPath.replace(/\.png$/i, '.json');
await writeFile(evidencePath, JSON.stringify({ reportPath, screenshotPath, viewport: { width: 1440, height: 1100 }, checks, consoleErrors, pageErrors }, null, 2), 'utf8');
if (Object.values(checks).some((value) => !value)) throw new Error(`Visual QA checks failed: ${JSON.stringify(checks)}`);
console.log(`Visual QA passed. Screenshot: ${screenshotPath}`);
console.log(`Checks: ${evidencePath}`);
