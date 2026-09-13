#!/usr/bin/env node
import WebSocketClient from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const port = Number(process.argv[2] || 29999);
const url = `ws://127.0.0.1:${port}`;
const NAME = process.argv[3] || 'Mock Executor';
const CONTROL_LOG = process.argv[4];

const CONTROL_PREFIX = '!VSCE:';
const outDir = path.resolve(dirname(fileURLToPath(import.meta.url)), 'received');
mkdirSync(outDir, { recursive: true });

let connecting = false;

function connect() {
  if (connecting) return;
  connecting = true;

  const ws = new WebSocketClient(url);

  ws.on('open', () => {
    console.log(`[mock] connected to ${url}`);
    ws.send(`[VSC Execute] Hello from ${NAME}\n[VSCE-PROTO] 2`);
  });

  ws.on('message', (data) => {
    const text = data.toString();

    if (text.startsWith(CONTROL_PREFIX)) {
      const payload = text.slice(CONTROL_PREFIX.length);
      console.log(`[mock] control frame -> ${payload}`);
      if (CONTROL_LOG) writeFileSync(CONTROL_LOG, payload);
      return;
    }

    const fileName = `received-${Date.now()}.lua`;
    writeFileSync(path.join(outDir, fileName), text);
    const preview = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    console.log(`[mock] received ${text.length} bytes -> ${fileName}`);
    console.log(`[mock] preview: ${preview.replaceAll('\n', ' | ')}`);
  });

  ws.on('close', () => {
    connecting = false;
    console.log('[mock] disconnected - reconnecting in 1.5s');
    setTimeout(connect, 1500);
  });

  ws.on('error', () => {
    connecting = false;
    console.log(`[mock] connection failed - retrying ${url} in 1.5s`);
    setTimeout(connect, 1500);
  });
}

connect();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));