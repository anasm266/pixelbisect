import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { isPortOpen, startServer } from '../../src/processes.js';
import { freePort, temporaryDirectory } from '../helpers.js';

const serverSource = `
const http = require('node:http');
const fs = require('node:fs');
const port = Number(process.argv[2]);
if (process.argv[3]) {
  const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  fs.writeFileSync(process.argv[3], String(child.pid));
}
http.createServer((req,res) => { res.writeHead(200, {'content-type':'text/html'}); res.end('<button id="target">Ready</button>'); }).listen(port, '127.0.0.1', () => console.log('server ready'));
`;

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test('starts, detects readiness, terminates the process tree, and releases the port', async () => {
  const dir = await temporaryDirectory('pixelbisect-server-');
  const port = await freePort();
  try {
    await writeFile(path.join(dir, 'server.cjs'), serverSource, 'utf8');
    const childPidPath = path.join(dir, 'child.pid');
    const logPath = path.join(dir, 'server.log');
    const server = await startServer({ command: `node server.cjs ${port} child.pid`, cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 5000, logPath });
    assert.equal(await isPortOpen(port), true);
    const descendantPid = Number.parseInt(await readFile(childPidPath, 'utf8'), 10);
    assert.equal(processAlive(descendantPid), true);
    await server.stop();
    assert.equal(await isPortOpen(port), false);
    const deadline = Date.now() + 2_000;
    while (processAlive(descendantPid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(processAlive(descendantPid), false, 'grandchild process should be terminated with the server tree');
    assert.match(await readFile(logPath, 'utf8'), /server ready/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects occupied ports and readiness timeouts clearly', async () => {
  const dir = await temporaryDirectory('pixelbisect-server-failure-');
  const port = await freePort();
  try {
    await writeFile(path.join(dir, 'server.cjs'), serverSource, 'utf8');
    await writeFile(path.join(dir, 'idle.cjs'), 'setInterval(() => {}, 1000);\n', 'utf8');
    const first = await startServer({ command: `node server.cjs ${port}`, cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 5000, logPath: path.join(dir, 'one.log') });
    await assert.rejects(startServer({ command: `node server.cjs ${port}`, cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 500, logPath: path.join(dir, 'two.log') }), /already occupied/);
    await first.stop();
    await assert.rejects(startServer({ command: 'node idle.cjs', cwd: dir, port, readinessUrl: `http://127.0.0.1:${port}`, timeoutMs: 300, logPath: path.join(dir, 'timeout.log') }), /readiness timed out/);
    assert.equal(await isPortOpen(port), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
