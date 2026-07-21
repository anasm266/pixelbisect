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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas Dispatch</title></head>
<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>
</html>
`;

const mainJs = `import './style.css';

document.querySelector('#app').innerHTML = \`
  <main id="fleet-board" aria-label="Atlas fleet operations dashboard">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span><span>atlas</span></div>
      <nav aria-label="Primary navigation">
        <a class="active" href="#"><span class="nav-icon grid-icon"></span>Overview</a>
        <a href="#"><span class="nav-icon route-icon"></span>Routes</a>
        <a href="#"><span class="nav-icon driver-icon"></span>Drivers</a>
        <a href="#"><span class="nav-icon box-icon"></span>Orders</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="system-status"><span></span><div><strong>All systems normal</strong><small>Last sync 2 min ago</small></div></div>
        <div class="operator"><span class="avatar">AM</span><div><strong>Alex Morgan</strong><small>Dispatch lead</small></div><b>•••</b></div>
      </div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div><p class="eyebrow">Live operations</p><h1>Fleet overview</h1></div>
        <div class="top-actions"><button>Today · Jul 21</button><button class="dispatch-button"><span>+</span> New dispatch</button></div>
      </header>
      <section class="metrics" aria-label="Fleet metrics">
        <article><span class="metric-icon green">↗</span><div><small>Active drivers</small><strong>18</strong><em>+3 this hour</em></div></article>
        <article><span class="metric-icon yellow">◇</span><div><small>Deliveries today</small><strong>142</strong><em>86% complete</em></div></article>
        <article><span class="metric-icon violet">◷</span><div><small>Average ETA</small><strong>18m</strong><em>2m faster</em></div></article>
        <article><span class="metric-icon coral">!</span><div><small>Needs attention</small><strong>3</strong><em>Review queue</em></div></article>
      </section>
      <section class="content-grid">
        <article class="map-card">
          <header class="card-head"><div><p class="eyebrow">Live coverage</p><h2>Phoenix central</h2></div><span class="live-pill"><i></i>18 drivers online</span></header>
          <div class="map-canvas" aria-label="Map showing active delivery drivers">
            <div class="road horizontal r1"></div><div class="road horizontal r2"></div><div class="road horizontal r3"></div>
            <div class="road vertical r4"></div><div class="road vertical r5"></div><div class="road diagonal r6"></div>
            <div class="park park-one"><span>ENCANTO PARK</span></div><div class="park park-two"><span>HERITAGE SQ</span></div>
            <svg class="route-network" viewBox="0 0 700 330" preserveAspectRatio="none" aria-hidden="true"><path d="M28 255 C120 230 125 104 226 122 S370 278 452 222 S545 70 666 96"/><path d="M112 42 C196 76 248 38 322 82 S452 156 596 146"/></svg>
            <div class="service-zone zone-west"><span>WEST ZONE</span></div><div class="service-zone zone-east"><span>EAST ZONE</span></div>
            <div class="map-label downtown">DOWNTOWN</div><div class="map-label roosevelt">ROOSEVELT</div><div class="map-label midtown">MIDTOWN</div>
            <div class="driver-marker" style="--x:10%;--y:18%"><i>JC</i><span>Jordan C.</span></div>
            <div class="driver-marker" style="--x:21%;--y:28%"><i>ML</i><span>Maya L.</span></div>
            <div class="driver-marker priority" style="--x:33%;--y:16%"><i>RK</i><span>Ravi K.</span></div>
            <div class="driver-marker" style="--x:41%;--y:35%"><i>NT</i><span>Noah T.</span></div>
            <div class="driver-marker" style="--x:61%;--y:20%"><i>AO</i><span>Ava O.</span></div>
            <div class="driver-marker" style="--x:75%;--y:17%"><i>SW</i><span>Sam W.</span></div>
            <div class="driver-marker" style="--x:87%;--y:28%"><i>LP</i><span>Leo P.</span></div>
            <div class="driver-marker" style="--x:15%;--y:53%"><i>IH</i><span>Iris H.</span></div>
            <div class="driver-marker priority" style="--x:28%;--y:61%"><i>DV</i><span>Diego V.</span></div>
            <div class="driver-marker" style="--x:43%;--y:57%"><i>EZ</i><span>Emma Z.</span></div>
            <div class="driver-marker" style="--x:56%;--y:49%"><i>TB</i><span>Theo B.</span></div>
            <div class="driver-marker" style="--x:68%;--y:58%"><i>CN</i><span>Chloe N.</span></div>
            <div class="driver-marker" style="--x:82%;--y:52%"><i>GM</i><span>Grace M.</span></div>
            <div class="driver-marker" style="--x:8%;--y:81%"><i>KS</i><span>Kai S.</span></div>
            <div class="driver-marker" style="--x:24%;--y:79%"><i>FB</i><span>Finn B.</span></div>
            <div class="driver-marker priority" style="--x:48%;--y:82%"><i>YU</i><span>Yara U.</span></div>
            <div class="driver-marker" style="--x:71%;--y:78%"><i>OH</i><span>Owen H.</span></div>
            <div class="driver-marker" style="--x:91%;--y:78%"><i>ZA</i><span>Zoe A.</span></div>
            <div class="map-controls"><button>+</button><button>−</button></div>
          </div>
          <footer class="map-legend"><span><i class="legend-dot active"></i>Available</span><span><i class="legend-dot priority"></i>Priority route</span><span class="updated">Updated just now</span></footer>
        </article>
        <aside class="queue-card">
          <header class="card-head"><div><p class="eyebrow">Dispatch queue</p><h2>Next up</h2></div><button class="more">•••</button></header>
          <div class="exception"><span>!</span><div><strong>3 routes need attention</strong><small>Two delays, one address issue</small></div></div>
          <div class="job"><span class="job-time">8m</span><div><strong>#AT-2048 · Roosevelt</strong><small>4 stops · Maya L.</small></div><em>Priority</em></div>
          <div class="job"><span class="job-time">12m</span><div><strong>#AT-2051 · Midtown</strong><small>6 stops · Noah T.</small></div><em class="standard">Ready</em></div>
          <div class="job"><span class="job-time">19m</span><div><strong>#AT-2054 · Encanto</strong><small>3 stops · Jordan C.</small></div><em class="standard">Ready</em></div>
          <button class="view-queue">View dispatch queue <span>→</span></button>
        </aside>
      </section>
    </section>
  </main>
\`;
`;

function styleCss(markerLayer: number): string {
  return `:root {
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #202925;
  background: #e8ece9;
  --layer-map-marker: ${markerLayer};
  --ink: #202925;
  --muted: #77817c;
  --line: #dfe5e1;
  --green: #1f8a70;
  --green-soft: #e8f4ef;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { min-height: 100vh; display: grid; place-items: center; background: #e8ece9; }
button { color: inherit; font: inherit; }
#fleet-board { width: 1180px; height: 660px; display: grid; grid-template-columns: 188px 1fr; overflow: hidden; border: 1px solid #d5ddd8; border-radius: 20px; background: #f7f8f7; box-shadow: 0 26px 70px rgba(31,49,40,.14); }
.sidebar { display: flex; flex-direction: column; padding: 24px 15px 17px; color: #cdd7d1; background: #1f2925; }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 9px 27px; color: #fff; font-size: 19px; font-weight: 760; letter-spacing: -.04em; }
.brand-mark { position: relative; width: 25px; height: 25px; display: block; border-radius: 7px; background: #d9f36a; }
.brand-mark i { position: absolute; width: 6px; height: 6px; border-radius: 2px; background: #1f2925; }.brand-mark i:nth-child(1){left:5px;top:5px}.brand-mark i:nth-child(2){right:5px;top:5px}.brand-mark i:nth-child(3){left:5px;bottom:5px;width:15px}
nav { display: grid; gap: 5px; } nav a { display: flex; align-items: center; gap: 11px; padding: 10px 11px; border-radius: 8px; color: #9faca5; font-size: 12px; font-weight: 650; text-decoration: none; } nav a.active { color: #fff; background: #31413a; }
.nav-icon { width: 15px; height: 15px; position: relative; opacity: .9 }.grid-icon{border:1.5px solid currentColor;border-radius:3px}.grid-icon:after{content:"";position:absolute;inset:6px 0 auto;border-top:1px solid}.route-icon:before{content:"";position:absolute;inset:2px;border:1.5px dashed currentColor;border-radius:50%}.driver-icon{border:1.5px solid currentColor;border-radius:50%}.driver-icon:after{content:"";position:absolute;width:8px;height:4px;left:2px;bottom:-3px;border:1.5px solid currentColor;border-radius:6px 6px 2px 2px}.box-icon{border:1.5px solid currentColor;border-radius:2px;transform:rotate(45deg) scale(.75)}
.sidebar-bottom { margin-top: auto; }.system-status { display:flex; gap:8px; align-items:flex-start; padding:11px 8px 16px; border-bottom:1px solid #35423c }.system-status>span{width:7px;height:7px;margin-top:4px;border-radius:50%;background:#7bdcb5;box-shadow:0 0 0 3px #2d4a3e}.system-status strong,.system-status small,.operator strong,.operator small{display:block}.system-status strong{color:#dbe4df;font-size:9px}.system-status small,.operator small{color:#79877f;font-size:8px;margin-top:1px}.operator{display:flex;align-items:center;gap:8px;padding:14px 7px 0}.operator .avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;color:#203128;background:#d9f36a;font-size:9px;font-weight:800}.operator strong{color:#e7eee9;font-size:9px}.operator b{margin-left:auto;color:#6e7e75;font-size:9px}
.workspace { min-width:0; padding:23px 26px 25px; }.topbar{display:flex;align-items:center;justify-content:space-between}.eyebrow{margin:0 0 2px;color:#8a948e;font-size:8px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.topbar h1{margin:0;color:var(--ink);font-size:24px;line-height:1.1;letter-spacing:-.045em}.top-actions{display:flex;gap:8px}.top-actions button{height:33px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:9px;font-weight:700}.top-actions .dispatch-button{border-color:#26332d;color:#fff;background:#26332d}.dispatch-button span{font-size:15px;line-height:0;margin-right:5px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:18px}.metrics article{display:flex;align-items:center;gap:10px;height:69px;padding:12px;border:1px solid var(--line);border-radius:11px;background:#fff}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;font-size:13px;font-weight:800}.metric-icon.green{color:#20775f;background:#e4f2ec}.metric-icon.yellow{color:#9a741d;background:#f8f0d5}.metric-icon.violet{color:#6d5d9c;background:#eeeafa}.metric-icon.coral{color:#a5504a;background:#f8e9e5}.metrics small,.metrics strong,.metrics em{display:block}.metrics small{color:#87908b;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.metrics strong{font-size:17px;line-height:1.2;letter-spacing:-.03em}.metrics em{color:#7b8580;font-size:7px;font-style:normal}
.content-grid{display:grid;grid-template-columns:minmax(0,1fr) 242px;gap:10px;margin-top:10px}.map-card,.queue-card{overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#fff}.card-head{height:57px;display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e7ebe8}.card-head h2{margin:0;color:#26302b;font-size:14px;letter-spacing:-.025em}.live-pill{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:20px;color:#37745f;background:#edf6f2;font-size:8px;font-weight:750}.live-pill i{width:6px;height:6px;border-radius:50%;background:#33a47c;box-shadow:0 0 0 3px #d8eee5}
.map-canvas{position:relative;height:338px;overflow:hidden;background-color:#f0f3f1;background-image:linear-gradient(#e5eae7 1px,transparent 1px),linear-gradient(90deg,#e5eae7 1px,transparent 1px);background-size:34px 34px}.map-canvas:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(116deg,transparent 0 46%,#dce4df 46% 48%,transparent 48% 100%),linear-gradient(22deg,transparent 0 57%,#e0e6e2 57% 60%,transparent 60%)}
.road{position:absolute;z-index:2;background:#fff;box-shadow:0 0 0 1px #e2e7e4}.road.horizontal{left:-5%;width:110%;height:9px}.r1{top:22%;transform:rotate(-3deg)}.r2{top:49%;transform:rotate(2deg)}.r3{top:76%;transform:rotate(-1deg)}.road.vertical{top:-5%;height:110%;width:8px}.r4{left:31%;transform:rotate(4deg)}.r5{left:70%;transform:rotate(-5deg)}.road.diagonal{top:50%;left:-10%;width:120%;height:7px;transform:rotate(-27deg)}
.park{position:absolute;z-index:2;display:grid;place-items:center;border:1px solid #d2e4d6;background:#dfede2;color:#83a28b;font-size:6px;font-weight:800;letter-spacing:.12em}.park-one{left:3%;bottom:4%;width:19%;height:19%;border-radius:40% 60% 48% 52%}.park-two{right:4%;top:5%;width:14%;height:16%;border-radius:48% 52% 45% 55%}.route-network{position:absolute;inset:0;z-index:4;width:100%;height:100%;fill:none;stroke:#b4c8bf;stroke-width:3;stroke-dasharray:5 5;opacity:.8}
.service-zone{position:absolute;z-index:5;display:flex;align-items:flex-end;padding:8px;border:1px solid #c7d9d1;color:#8ba198;background:#e7eeea;font-size:6px;font-weight:800;letter-spacing:.12em;box-shadow:inset 0 0 0 1px #f4f7f5}.zone-west{left:7%;top:9%;width:38%;height:49%;clip-path:polygon(8% 0,100% 8%,91% 100%,0 83%)}.zone-east{left:52%;top:28%;width:39%;height:45%;clip-path:polygon(5% 10%,88% 0,100% 88%,12% 100%)}
.map-label{position:absolute;z-index:7;color:#a9b2ad;font-size:6px;font-weight:800;letter-spacing:.16em}.downtown{left:44%;top:45%}.roosevelt{left:67%;top:14%}.midtown{left:20%;bottom:13%}
.driver-marker{position:absolute;left:var(--x);top:var(--y);z-index:var(--layer-map-marker);display:flex;align-items:center;filter:drop-shadow(0 3px 5px rgba(31,61,48,.17));transform:translate(-50%,-50%)}.driver-marker i{position:relative;display:grid;place-items:center;width:23px;height:23px;border:2px solid #fff;border-radius:50%;color:#fff;background:#23886d;font-size:6px;font-style:normal;font-weight:850}.driver-marker span{margin-left:4px;padding:3px 5px;border:1px solid #dde5e1;border-radius:4px;color:#52605a;background:#fff;font-size:6px;font-weight:750;white-space:nowrap}.driver-marker.priority i{background:#dc8a46}.driver-marker.priority span{color:#9b5a2c;background:#fff8f0}
.map-controls{position:absolute;right:9px;bottom:9px;z-index:40;display:grid;overflow:hidden;border:1px solid #d6ded9;border-radius:7px;background:#fff;box-shadow:0 4px 12px #273b3020}.map-controls button{width:25px;height:23px;border:0;background:#fff;font-size:12px}.map-controls button+button{border-top:1px solid #e4e8e5}
.map-legend{height:34px;display:flex;align-items:center;gap:14px;padding:0 14px;color:#77817c;font-size:7px}.legend-dot{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%}.legend-dot.active{background:#23886d}.legend-dot.priority{background:#dc8a46}.map-legend .updated{margin-left:auto;color:#a0aaa4}
.queue-card .card-head{padding-inline:12px}.queue-card .more{border:0;color:#96a09a;background:transparent;font-size:8px}.exception{display:flex;gap:8px;margin:10px;padding:9px;border:1px solid #f0d9ce;border-radius:8px;background:#fff6f1}.exception>span{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;color:#a95e43;background:#f4ded4;font-size:9px;font-weight:900}.exception strong,.exception small{display:block}.exception strong{color:#7b4937;font-size:8px}.exception small{color:#aa7c69;font-size:7px;margin-top:1px}.job{display:grid;grid-template-columns:27px 1fr auto;align-items:center;gap:7px;padding:10px 11px;border-top:1px solid #edf0ee}.job-time{color:#39453f;font-size:8px;font-weight:800}.job strong,.job small{display:block}.job strong{font-size:7.5px}.job small{margin-top:2px;color:#909a94;font-size:7px}.job em{padding:3px 5px;border-radius:4px;color:#9b5a2c;background:#fff0df;font-size:6px;font-style:normal;font-weight:800}.job em.standard{color:#38745f;background:#e9f4ef}.view-queue{width:calc(100% - 20px);height:28px;margin:8px 10px 0;border:1px solid #dfe5e1;border-radius:7px;color:#43514a;background:#f8faf9;font-size:7px;font-weight:750}.view-queue span{margin-left:4px}
`;
}

const messages = [
  'feat: establish deterministic dispatch fixture',
  'docs: record fleet board ownership', 'docs: capture map accessibility review scope', 'docs: note supported browser baseline',
  'docs: clarify courier status copy', 'docs: describe dispatch queue contract', 'docs: add operations release checklist',
  'docs: record keyboard review outcome', 'docs: add selector stability policy', 'docs: document system font decision',
  'docs: capture map layout measurements', 'docs: add local development hints', 'docs: record marker contrast baseline',
  'docs: describe deterministic fleet data', 'docs: add delayed-route state notes', 'docs: record focus order expectations',
  'docs: add dashboard layout constraints', 'docs: document marker sizing rationale', 'docs: record operations content approval',
  'docs: add release verification steps', 'docs: clarify dispatch route behavior', 'docs: record dependency policy',
  'docs: add visual QA checklist', 'docs: document offline fixture requirement', 'docs: record heading hierarchy',
  'docs: add browser capture notes', 'docs: clarify stable viewport contract', 'docs: record overlay token choices',
  'docs: add screenshot review rubric', 'docs: document regression escalation', 'docs: record live marker semantics',
  'docs: add map layer maintenance notes',
  'refactor(theme): normalize map overlay layers',
  'docs: record post-layer review', 'docs: add fleet telemetry proposal', 'docs: clarify test driver policy',
  'docs: capture zone-label localization notes', 'docs: add routing provider boundary', 'docs: record loading-state guidance',
  'docs: clarify empty-queue behavior', 'docs: add dispatch support playbook', 'docs: document visual evidence format',
  'docs: record selector ownership', 'docs: add dependency update checklist', 'docs: clarify browser support matrix',
  'docs: capture privacy review notes', 'docs: add map performance budget', 'docs: record server readiness contract',
  'docs: clarify static asset policy', 'docs: add incident reproduction steps', 'docs: document dispatch route coverage',
  'docs: record address validation guidance', 'docs: add fleet smoke-test steps', 'docs: clarify deployment preview use',
  'docs: record marker label decision', 'docs: add visual baseline ownership', 'docs: document build reproducibility',
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
  await writeFile(path.join(repoPath, 'src', 'style.css'), styleCss(30), 'utf8');
  await writeFile(path.join(repoPath, 'docs', 'project-notes.md'), '# Atlas dispatch project notes\n\nDeterministic fleet fixture initialized.\n', 'utf8');

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
      await writeFile(path.join(repoPath, 'src', 'style.css'), styleCss(3), 'utf8');
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
    readinessUrl: 'http://127.0.0.1:4173/', targetUrl: 'http://127.0.0.1:4173/dispatch', selector: '#fleet-board',
    viewport: { width: 1280, height: 720 }, startupTimeoutMs: 15_000, captureTimeoutMs: 30_000,
    pixelColorThreshold: 0.1, maxChangedPixelPercent: 0.1,
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
