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
:root{color-scheme:dark;--bg:#090d18;--panel:#111827;--panel2:#172033;--line:#29354d;--ink:#f8fafc;--muted:#94a3b8;--cyan:#22d3ee;--blue:#60a5fa;--red:#fb7185;--green:#34d399;--position:50%}
*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}body{margin:0;color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(1000px 500px at 80% -10%,#172554 0,transparent 62%),var(--bg)}
.shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:44px 0 80px}.eyebrow{color:var(--cyan);font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.hero{display:grid;grid-template-columns:1fr auto;gap:28px;align-items:end;margin:8px 0 30px}.hero>div:first-child{min-width:0}.hero h1{font-size:clamp(32px,6vw,66px);line-height:.98;letter-spacing:-.055em;margin:0;max-width:860px}.hero h1 code{color:var(--cyan);font:inherit}.hero p{color:var(--muted);margin:15px 0 0;font-size:17px;overflow-wrap:anywhere}.score{text-align:right;background:linear-gradient(145deg,#172033,#111827);border:1px solid var(--line);border-radius:18px;padding:18px 22px;box-shadow:0 18px 50px #0005}.score strong{display:block;font-size:28px;letter-spacing:-.03em}.score span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.card{background:linear-gradient(145deg,#111827,#0d1424);border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 80px #0004;margin-top:18px;overflow:hidden}.card-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:19px 22px;border-bottom:1px solid var(--line)}.card-head h2{margin:0;font-size:17px;letter-spacing:-.01em}.card-head span{color:var(--muted);font-size:13px}.card-body{padding:22px}
.compare{position:relative;isolation:isolate;width:100%;aspect-ratio:${input.comparison.width}/${input.comparison.height};max-height:580px;overflow:hidden;border-radius:13px;background:#fff;border:1px solid #ffffff22;--position:50%}.compare img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;image-rendering:auto;user-select:none}.after-clip{position:absolute;inset:0;overflow:hidden;clip-path:inset(0 0 0 var(--position))}.divider{position:absolute;z-index:3;top:0;bottom:0;left:var(--position);width:3px;background:#fff;transform:translateX(-50%);box-shadow:0 0 0 1px #0005,0 0 20px #0008;pointer-events:none}.divider:after{content:"↔";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#fff;color:#0f172a;font-weight:900;box-shadow:0 5px 20px #0008}.slider{position:absolute;z-index:4;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize}.slider:focus-visible{opacity:1;appearance:none;background:transparent;outline:3px solid var(--cyan);outline-offset:-3px}.labels{position:absolute;z-index:2;top:13px;left:13px;right:13px;display:flex;justify-content:space-between;pointer-events:none}.label{padding:5px 9px;border-radius:7px;background:#020617cc;color:white;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 3px 10px #0006}
.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.grid>.card{display:flex;flex-direction:column}.grid>.card .card-body{flex:1}.grid>.card:first-child .card-body{display:grid;place-items:center}.diff-image{display:block;max-width:100%;max-height:520px;margin:auto;border-radius:12px;background:#fff}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}.fact{background:var(--panel);padding:13px 15px;min-width:0}.fact dt{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.fact dd{margin:3px 0 0;overflow-wrap:anywhere}.commit{display:flex;gap:13px;align-items:flex-start;padding:15px;border:1px solid var(--line);border-radius:12px;background:#0b1220}.commit>div{min-width:0}.commit+.commit{margin-top:10px}.dot{width:10px;height:10px;border-radius:50%;margin-top:7px;flex:none;background:var(--red);box-shadow:0 0 18px currentColor}.commit.good .dot{background:var(--green)}.commit code,.hash{color:var(--cyan);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.commit strong{display:block}.commit small{display:block;color:var(--muted);margin-top:3px}.commit strong,.commit small,.meta{overflow-wrap:anywhere}.meta{margin-top:14px;color:var(--muted);font-size:13px}.warning{border-left:3px solid #f59e0b;padding:12px 15px;background:#f59e0b10;color:#fcd34d;border-radius:0 9px 9px 0}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em}.numeric{text-align:right;font-variant-numeric:tabular-nums}.message{max-width:390px;overflow-wrap:anywhere}.verdict{font-size:11px;font-weight:900;letter-spacing:.07em;padding:4px 7px;border-radius:6px}.verdict.good{color:var(--green);background:#34d39918}.verdict.bad{color:var(--red);background:#fb718518}.empty{text-align:center;color:var(--muted)}
pre{margin:0;max-height:660px;overflow:auto;padding:20px;background:#050812;color:#dbeafe;font:12.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;tab-size:2}.diff-title{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}.footer{margin-top:28px;color:var(--muted);text-align:center;font-size:13px}.footer strong{color:var(--ink)}
@media(max-width:780px){.shell{width:min(100% - 20px,1180px);padding-top:25px}.hero{grid-template-columns:1fr}.score{text-align:left}.grid{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.card-body{padding:14px}.hero h1{font-size:38px}.card-head{align-items:flex-start;flex-direction:column;gap:4px}}
@media print{body{background:#fff;color:#111}.shell{width:100%;padding:0}.card,.score{box-shadow:none;break-inside:avoid}.slider,.divider{display:none}.after-clip{clip-path:none}.hero h1 code{color:#0369a1}}
</style>
</head>
<body>
<main class="shell">
  <div class="eyebrow">Visual regression located</div>
  <header class="hero">
    <div><h1>First bad commit: <code>${escapeHtml(c.shortHash)}</code></h1><p>${escapeHtml(c.subject)}</p></div>
    <div class="score"><strong>${percentage}%</strong><span>pixels changed</span></div>
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

  <p class="warning">Screenshots may contain application data. Review this report before sharing it.</p>
  <footer class="footer"><strong>PixelBisect</strong> · Generated ${escapeHtml(generated.toISOString())} · Visual testing catches tomorrow's regressions. PixelBisect finds yesterday's.</footer>
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
