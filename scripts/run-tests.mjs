import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const suite = process.argv[2];
const root = resolve(".test-dist", "test", ...(suite ? [suite] : []));

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTests(path)));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(path);
    }
  }

  return files;
}

const tests = (await collectTests(root)).sort();
if (tests.length === 0) {
  throw new Error(`No compiled tests found in ${root}`);
}

const child = spawn(
  process.execPath,
  ["--test", "--test-concurrency=1", ...tests],
  { stdio: "inherit" },
);

child.once("error", (error) => {
  throw error;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
