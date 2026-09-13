#!/usr/bin/env node
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tmp-test');
const OUT_DIR = path.join(ROOT, 'tests', 'received');
const MOCK = path.join(ROOT, 'tests', 'mock-executor.mjs');
const PORT = 32123;
const EXPECTED = 'print("integration test ok")';

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mock;

function latestReceived() {
  try {
    const files = readdirSync(OUT_DIR)
      .map((name) => ({ name, file: path.join(OUT_DIR, name) }))
      .filter((f) => statSync(f.file).isFile())
      .sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
    return files.length > 0 ? readFileSync(files[0].file, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

async function cleanup(code) {
  if (mock && !mock.killed) mock.kill('SIGTERM');
  executeServer.dispose();
  rmSync(TMP, { recursive: true, force: true });
  process.exit(code);
}

console.log('[test] bundling src/wsServer.ts...');
const wsBundle = path.join(TMP, 'wsServer.cjs');
await build({
  entryPoints: [path.join(ROOT, 'src', 'wsServer.ts')],
  bundle: true,
  outfile: wsBundle,
  platform: 'node',
  format: 'cjs',
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'silent',
});

const { executeServer } = await import(pathToFileURL(wsBundle).href);

let isConnected = false;
let executorIdentity;
executeServer.onStatusChange = (status) => {
  isConnected = status.connected;
  executorIdentity = status.executorName;
};

console.log(`[test] starting WS server on port ${PORT}...`);
executeServer.start(PORT);

mock = spawn(process.execPath, [MOCK, String(PORT), 'Integration Test Executor'], {
  stdio: 'inherit',
});

console.log('[test] waiting for mock executor to connect and identify itself...');
const deadline = Date.now() + 15000;
while (Date.now() < deadline && !(isConnected && executorIdentity)) {
  await sleep(200);
}

if (!isConnected || !executorIdentity) {
  console.error('\nFAIL: mock executor connected but the server never captured its hello/name.');
  await cleanup(1);
}

console.log(`\n[test] connected (bound port: ${executeServer.port})`);
console.log(`[test] executor identity: ${executorIdentity}`);
if (String(executorIdentity).includes('Integration Test Executor') === false) {
  console.error('FAIL: executor name was not captured from the hello message.');
  await cleanup(1);
}

console.log(`[test] sending "${EXPECTED}" to executor...`);
executeServer.send(EXPECTED);

console.log('[test] waiting for the mock to receive & save the script...');
let got = '';
const receiveDeadline = Date.now() + 10000;
while (Date.now() < receiveDeadline) {
  const latest = latestReceived();
  if (latest && latest.includes('integration test ok')) {
    got = latest;
    break;
  }
  await sleep(200);
}

if (got.includes('integration test ok')) {
  console.log(`\nPASS: executor received the script (${got.length} bytes) and saved it to tests/received/.`);
  await cleanup(0);
} else {
  console.error('\nFAIL: mock executor did not receive the sent script.');
  await cleanup(1);
}