import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const port = 31000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('../', import.meta.url).pathname,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});
const sockets = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const ws = new WebSocket('ws://127.0.0.1:' + port);
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      sockets.push(ws);
      return ws;
    } catch { await sleep(100); }
  }
  throw new Error('Server did not start');
}
function waitFor(ws, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.off('message', onMessage); reject(new Error('Timeout waiting for ' + type)); }, 3000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type === type) { clearTimeout(timeout); ws.off('message', onMessage); resolve(message); }
    }
    ws.on('message', onMessage);
  });
}
test('matches users by language and relays a message', async () => {
  const first = await connect();
  const second = await connect();
  const waiting = waitFor(first, 'waiting');
  first.send(JSON.stringify({ type: 'join', lang: 'pt' }));
  await waiting;
  const matched1 = waitFor(first, 'matched');
  const matched2 = waitFor(second, 'matched');
  second.send(JSON.stringify({ type: 'join', lang: 'pt' }));
  await Promise.all([matched1, matched2]);
  const incoming = waitFor(second, 'message');
  first.send(JSON.stringify({ type: 'message', text: 'Olá!' }));
  assert.equal((await incoming).text, 'Olá!');
  const left = waitFor(second, 'left');
  first.send(JSON.stringify({ type: 'next' }));
  await left;
});
test.after(() => { for (const s of sockets) s.close(); server.kill(); });
