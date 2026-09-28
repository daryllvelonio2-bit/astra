const http = require('http');
const WebSocket = require('ws');

const PAGE_ID = process.argv[2];
const EXPR = process.argv[3];

async function main() {
  const ws = new WebSocket(`ws://localhost:9223/devtools/page/${PAGE_ID}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: EXPR, returnByValue: true },
  }));
  const msg = await new Promise((resolve) => ws.on('message', resolve));
  console.log(JSON.stringify(JSON.parse(msg).result?.result, null, 2));
  ws.close();
}

main().catch((e) => console.error(e.message));
