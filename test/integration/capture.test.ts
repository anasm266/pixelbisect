import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { captureElement } from '../../src/capture.js';
import { comparePngFiles } from '../../src/compare.js';
import { startServer } from '../../src/processes.js';
import type { PixelBisectConfig } from '../../src/types.js';
import { freePort, temporaryDirectory } from '../helpers.js';

const source = `
const http = require('node:http');
const port = Number(process.argv[2]);
const page = \`<!doctype html><style>
html,body{margin:0;width:100%;height:100%;overflow:scroll}
#target{--target-color:#2563eb;width:200px;height:80px;overflow:scroll;background:var(--target-color);color:white;animation:pulse 120ms infinite alternate;transition:all 2s}
@keyframes pulse{from{background:#2563eb}to{background:#ef4444}}
</style><div id="target" contenteditable="true">Deterministic capture content that overflows the fixed box.</div>\`;
http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(page)}).listen(port,'127.0.0.1');
`;

test('capture freezes motion and caret, hides scrollbars, and honors viewport/device scale deterministically', async () => {
  const dir = await temporaryDirectory('pixelbisect-capture-');
  const port = await freePort();
  try {
    await writeFile(path.join(dir, 'server.cjs'), source, 'utf8');
    const server = await startServer({ command: `node server.cjs ${port}`, cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 5000, logPath: path.join(dir, 'server.log') });
    try {
      const config: PixelBisectConfig = {
        repoPath: dir, goodCommit: 'good', badCommit: 'bad', installCommand: 'npm ci', buildCommand: null,
        startCommand: '', port, readinessUrl: `http://127.0.0.1:${port}`, targetUrl: `http://127.0.0.1:${port}`,
        selector: '#target', viewport: { width: 640, height: 480 }, startupTimeoutMs: 5000, captureTimeoutMs: 5000,
        pixelColorThreshold: 0.1, maxChangedPixelPercent: 0,
      };
      const first = path.join(dir, 'first.png');
      const second = path.join(dir, 'second.png');
      const captured = await captureElement(config, first, { includeComputedStyle: true });
      await captureElement(config, second);
      assert.equal(captured.computedStyle?.width, '200px');
      assert.equal(captured.computedStyle?.['--target-color'], '#2563eb');
      const decoded = PNG.sync.read(await readFile(first));
      assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 200, height: 80 });
      const comparison = await comparePngFiles({ baselinePath: first, candidatePath: second, diffPath: path.join(dir, 'diff.png'), pixelColorThreshold: 0, maxChangedPixelPercent: 0 });
      assert.equal(comparison.changedPixels, 0);
      assert.equal(comparison.verdict, 'GOOD');
    } finally { await server.stop(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('font/render settling cannot exceed captureTimeoutMs', async () => {
  const dir = await temporaryDirectory('pixelbisect-capture-timeout-');
  const port = await freePort();
  const hangingFontServer = `const http=require('node:http');const p=Number(process.argv[2]);http.createServer((q,r)=>{if(q.url==='/hang.woff2')return;r.writeHead(200,{'content-type':'text/html'});r.end('<style>@font-face{font-family:Hang;src:url(/hang.woff2)}#target{font-family:Hang;width:100px;height:40px}</style><div id="target">waiting</div>')}).listen(p,'127.0.0.1')`;
  try {
    await writeFile(path.join(dir, 'server.cjs'), hangingFontServer, 'utf8');
    const running = await startServer({ command: `node server.cjs ${port}`, cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 5000, logPath: path.join(dir, 'server.log') });
    try {
      const config: PixelBisectConfig = {
        repoPath: dir, goodCommit: 'good', badCommit: 'bad', installCommand: 'npm ci', buildCommand: null, startCommand: '', port,
        readinessUrl: `http://127.0.0.1:${port}`, targetUrl: `http://127.0.0.1:${port}`, selector: '#target', viewport: { width: 320, height: 240 },
        startupTimeoutMs: 1000, captureTimeoutMs: 2000, pixelColorThreshold: 0.1, maxChangedPixelPercent: 0,
      };
      const started = Date.now();
      await assert.rejects(captureElement(config, path.join(dir, 'never.png')), /Font\/render settling timed out after 2000 ms/);
      assert.ok(Date.now() - started < 5_000, 'capture timeout should be bounded');
    } finally { await running.stop(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
