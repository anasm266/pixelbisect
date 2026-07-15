import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { escapeHtml } from './html.js';
import { formatDuration } from './time.js';
import type { CommitInfo, ComparisonResult, EvaluationRecord, ResolvedConfig } from './types.js';

export interface GenerateReportInput {
  outputPath: string;
  config: ResolvedConfig;
  culprit: CommitInfo;
  lastGood: CommitInfo;
  comparison: ComparisonResult;
  records: EvaluationRecord[];
  durationMs: number;
  diffText: string;
  beforeScreenshotPath: string;
  afterScreenshotPath: string;
  diffImagePath: string;
  generatedAt?: Date;
}

async function pngDataUrl(filePath: string): Promise<string> {
  return `data:image/png;base64,${(await readFile(filePath)).toString('base64')}`;
}

function configRows(config: ResolvedConfig): string {
  const values: Array<[string, unknown]> = [
    ['Repository', config.repoPath], ['Good ref', config.goodCommit], ['Bad ref', config.badCommit],
    ['Install command', config.installCommand], ['Build command', config.buildCommand ?? 'Not configured'], ['Start command', config.startCommand],
    ['Port', config.port], ['Readiness URL', config.readinessUrl], ['Target URL', config.targetUrl], ['Selector', config.selector],
    ['Viewport', `${config.viewport.width} × ${config.viewport.height} @ 1x`],
    ['Startup timeout', `${config.startupTimeoutMs} ms`], ['Capture timeout', `${config.captureTimeoutMs} ms`],
    ['Per-pixel tolerance', config.pixelColorThreshold],
    ['Maximum changed area', `${config.maxChangedPixelPercent}%`],
    ['First-parent range', `${config.commitCount} commits`],
  ];
  return values.map(([key, value]) => `<div class="fact"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function recordRows(records: EvaluationRecord[]): string {
  if (records.length === 0) return '<tr><td colspan="6" class="empty">No midpoint comparisons were required.</td></tr>';
  return records.map((record, index) => `<tr>
    <td>${index + 1}</td>
    <td><code>${escapeHtml(record.shortHash)}</code></td>
    <td class="message">${escapeHtml(record.subject)}</td>
    <td><span class="verdict ${record.verdict.toLowerCase()}">${record.verdict}</span></td>
    <td class="numeric">${record.changedPercent.toFixed(3)}%</td>
    <td class="numeric">${escapeHtml(formatDuration(record.durationMs))}</td>
  </tr>`).join('');
}

export async function generateReport(input: GenerateReportInput): Promise<string> {
  const outputPath = path.resolve(input.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const [before, after, diff] = await Promise.all([
    pngDataUrl(input.beforeScreenshotPath),
    pngDataUrl(input.afterScreenshotPath),
    pngDataUrl(input.diffImagePath),
  ]);
  const generated = input.generatedAt ?? new Date();
  const c = input.culprit;
  const g = input.lastGood;
  const percentage = input.comparison.changedPercent.toFixed(3);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PixelBisect — ${escapeHtml(c.shortHash)} ${escapeHtml(c.subject)}</title>
<style>
:root{color-scheme:light;--bg:#f2f2f0;--surface:#fff;--surface-alt:#e8e8e5;--surface-soft:#f8f8f6;--line:#d9dadd;--ink:#323437;--muted:#686b70;--subtle:#73767c;--accent:#e2b714;--accent-ink:#806700;--accent-soft:#fff5c2;--good:#2f6f4d;--good-soft:#e7f3ec;--bad:#a93645;--bad-soft:#fbeaec;--warning:#8a6c00;--position:50%}
*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}body{margin:0;color:var(--ink);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;background:var(--bg);border-top:4px solid var(--accent)}
::selection{color:var(--ink);background:var(--accent)}
.shell{width:min(1160px,calc(100% - 40px));margin:auto;padding:26px 0 72px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 2px 24px;border-bottom:1px solid var(--line);color:var(--muted);font-size:12px}.brand{display:flex;align-items:center;gap:8px}.brand strong{color:var(--ink);font-size:15px;letter-spacing:-.03em}.brand-mark{width:11px;height:11px;border-radius:3px;background:var(--accent);box-shadow:inset 0 0 0 1px #0000000d}.generated-at{overflow-wrap:anywhere;text-align:right}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:48px;align-items:end;padding:54px 2px 34px}.hero-copy{min-width:0}.eyebrow{display:flex;align-items:center;gap:9px;color:var(--accent-ink);font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent)}.hero h1{font-size:clamp(32px,5vw,54px);line-height:1.08;letter-spacing:-.055em;margin:12px 0 0;font-weight:650;max-width:820px}.hero h1 code{color:var(--accent-ink);font:inherit}.hero p{color:var(--muted);margin:13px 0 0;font-size:15px;overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:repeat(3,minmax(92px,1fr));gap:26px;margin:0}.summary div{min-width:0}.summary dt{color:var(--subtle);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.summary dd{margin:2px 0 0;color:var(--ink);font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin-top:16px;overflow:hidden;box-shadow:0 1px 2px #20212408}.card-head{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:56px;padding:16px 19px;border-bottom:1px solid var(--line)}.card-head h2{margin:0;font-size:14px;letter-spacing:-.02em}.card-head span{color:var(--muted);font-size:11px}.card-body{padding:18px}
.compare{position:relative;isolation:isolate;width:100%;aspect-ratio:${input.comparison.width}/${input.comparison.height};max-height:580px;overflow:hidden;border-radius:8px;background:#fff;border:1px solid var(--line);--position:50%}.compare img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;image-rendering:auto;user-select:none}.after-clip{position:absolute;inset:0;overflow:hidden;clip-path:inset(0 0 0 var(--position))}.divider{position:absolute;z-index:3;top:0;bottom:0;left:var(--position);width:2px;background:var(--accent);transform:translateX(-50%);box-shadow:0 0 0 1px #ffffffaa;pointer-events:none}.divider:after{content:"↔";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--accent);border-radius:50%;background:var(--surface);color:var(--accent-ink);font-weight:800;box-shadow:0 2px 8px #32343722}.slider{position:absolute;z-index:4;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize}.slider:focus-visible{opacity:1;appearance:none;background:transparent;outline:3px solid var(--accent);outline-offset:-3px}.labels{position:absolute;z-index:2;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;pointer-events:none}.label{padding:4px 8px;border:1px solid #d4d5d8;border-radius:5px;background:#ffffffeb;color:var(--ink);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 1px 3px #32343718}
.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}.grid>.card{display:flex;flex-direction:column}.grid>.card .card-body{flex:1}.grid>.card:first-child .card-body{display:grid;place-items:center;background:var(--surface-soft)}.diff-image{display:block;max-width:100%;max-height:520px;margin:auto;border:1px solid var(--line);border-radius:8px;background:#fff}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--line)}.fact{padding:13px 14px;min-width:0;background:var(--surface)}.fact dt{color:var(--subtle);font-size:10px;text-transform:uppercase;letter-spacing:.07em}.fact dd{margin:3px 0 0;color:var(--ink);font-size:12px;overflow-wrap:anywhere}.commit{display:flex;gap:12px;align-items:flex-start;padding:13px;border:1px solid var(--line);border-radius:8px;background:var(--surface-soft)}.commit>div{min-width:0}.commit+.commit{margin-top:9px}.dot{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:none;background:var(--bad)}.commit.good .dot{background:var(--good)}.commit code,.hash{color:var(--accent-ink);font-family:inherit}.commit strong{display:block;font-size:12px;line-height:1.45}.commit small{display:block;color:var(--muted);margin-top:3px;font-size:10px}.commit strong,.commit small,.meta{overflow-wrap:anywhere}.meta{margin:13px 0 0;color:var(--muted);font-size:11px}.warning{border:1px solid #e7d999;padding:11px 13px;background:var(--accent-soft);color:var(--warning);border-radius:7px;font-size:11px}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left}tbody tr:last-child td{border-bottom:0}th{background:var(--surface-soft);color:var(--subtle);font-size:10px;text-transform:uppercase;letter-spacing:.07em}td{font-size:12px}.numeric{text-align:right;font-variant-numeric:tabular-nums}.message{max-width:390px;overflow-wrap:anywhere}.verdict{font-size:9px;font-weight:800;letter-spacing:.07em;padding:3px 6px;border-radius:4px}.verdict.good{color:var(--good);background:var(--good-soft)}.verdict.bad{color:var(--bad);background:var(--bad-soft)}.empty{text-align:center;color:var(--muted)}
pre{margin:0;max-height:660px;overflow:auto;padding:20px;background:var(--surface-soft);color:#414348;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;white-space:pre;tab-size:2}.diff-title{color:var(--muted);overflow-wrap:anywhere}.share-warning{margin-top:16px}.footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px;padding:0 2px;color:var(--muted);font-size:10px}.footer strong{color:var(--ink)}
@media(max-width:900px){.hero{grid-template-columns:1fr;gap:28px}.summary{width:min(100%,520px)}.grid{grid-template-columns:1fr}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.shell{width:min(100% - 20px,1160px);padding-top:18px}.topbar{align-items:flex-start}.generated-at{max-width:52%}.hero{padding-top:38px}.hero h1{font-size:34px}.summary{grid-template-columns:repeat(3,1fr);gap:12px}.summary dd{font-size:16px}.card-head{align-items:flex-start;flex-direction:column;gap:3px;padding:14px}.card-body{padding:12px}.facts{grid-template-columns:1fr}.footer{align-items:flex-start;flex-direction:column;gap:6px}}
@media print{body{background:#fff;border:0}.shell{width:100%;padding:0}.card{box-shadow:none;break-inside:avoid}.slider,.divider{display:none}.after-clip{clip-path:none}.hero h1 code{color:#6d5800}.topbar{padding-top:0}}
</style>
</head>
<body>
<main class="shell">
  <div class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><strong>pixelbisect</strong><span>/ report</span></div>
    <span class="generated-at">generated <time datetime="${escapeHtml(generated.toISOString())}">${escapeHtml(generated.toISOString())}</time></span>
  </div>
  <header class="hero">
    <div class="hero-copy">
      <div class="eyebrow">Regression isolated</div>
      <h1>First bad commit <code>${escapeHtml(c.shortHash)}</code></h1>
      <p>${escapeHtml(c.subject)}</p>
    </div>
    <dl class="summary">
      <div><dt>changed</dt><dd>${percentage}%</dd></div>
      <div><dt>comparisons</dt><dd>${input.records.length}</dd></div>
      <div><dt>runtime</dt><dd>${escapeHtml(formatDuration(input.durationMs))}</dd></div>
    </dl>
  </header>

  <section class="card" aria-labelledby="comparison-title">
    <div class="card-head"><h2 id="comparison-title">Before / after</h2><span>Drag, click, or focus and use arrow keys</span></div>
    <div class="card-body">
      <div class="compare" id="comparison">
        <img src="${before}" alt="Last-good screenshot">
        <div class="after-clip"><img src="${after}" alt="First-bad screenshot"></div>
        <div class="labels"><span class="label">Last good</span><span class="label">First bad</span></div>
        <div class="divider" aria-hidden="true"></div>
        <input class="slider" id="slider" type="range" min="0" max="100" value="50" step="1" aria-label="Reveal before and after screenshot">
      </div>
    </div>
  </section>

  <div class="grid">
    <section class="card"><div class="card-head"><h2>Highlighted pixel difference</h2><span>${input.comparison.changedPixels.toLocaleString()} of ${input.comparison.totalPixels.toLocaleString()} pixels</span></div><div class="card-body"><img class="diff-image" src="${diff}" alt="Highlighted pixel difference"></div></section>
    <section class="card"><div class="card-head"><h2>Boundary commits</h2></div><div class="card-body">
      <div class="commit good"><span class="dot"></span><div><code>${escapeHtml(g.shortHash)}</code><strong>${escapeHtml(g.subject)}</strong><small>Last good · ${escapeHtml(g.author)} · ${escapeHtml(g.date)}</small><small class="hash">${escapeHtml(g.hash)}</small></div></div>
      <div class="commit"><span class="dot"></span><div><code>${escapeHtml(c.shortHash)}</code><strong>${escapeHtml(c.subject)}</strong><small>First bad · ${escapeHtml(c.author)} · ${escapeHtml(c.date)}</small><small class="hash">${escapeHtml(c.hash)}</small></div></div>
      ${c.body ? `<p class="meta">${escapeHtml(c.body).replaceAll('\n', '<br>')}</p>` : ''}
      <p class="warning">Result assumes one monotonic good-to-bad transition along first-parent history.</p>
    </div></section>
  </div>

  <section class="card"><div class="card-head"><h2>Investigation</h2><span>${escapeHtml(formatDuration(input.durationMs))} total</span></div><div class="card-body"><dl class="facts">${configRows(input.config)}</dl></div></section>
  <section class="card"><div class="card-head"><h2>Tested commits</h2><span>${input.records.length} midpoint comparison${input.records.length === 1 ? '' : 's'}</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Commit</th><th>Message</th><th>Verdict</th><th class="numeric">Changed</th><th class="numeric">Duration</th></tr></thead><tbody>${recordRows(input.records)}</tbody></table></div></section>
  <section class="card"><div class="card-head"><h2>Culprit Git diff</h2><span class="diff-title">${escapeHtml(g.shortHash)} → ${escapeHtml(c.shortHash)}</span></div><pre aria-label="Git diff">${escapeHtml(input.diffText)}</pre></section>

  <p class="warning share-warning">Screenshots may contain application data. Review this report before sharing it.</p>
  <footer class="footer"><strong>pixelbisect</strong><span>Visual testing catches tomorrow's regressions. PixelBisect finds yesterday's.</span></footer>
</main>
<script>
(() => {
  const comparison = document.getElementById('comparison');
  const slider = document.getElementById('slider');
  const update = () => comparison.style.setProperty('--position', slider.value + '%');
  slider.addEventListener('input', update);
  slider.addEventListener('change', update);
  update();
})();
</script>
</body>
</html>`;
  await writeFile(outputPath, html, 'utf8');
  return outputPath;
}
