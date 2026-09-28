const http = require('http');
const WebSocket = require('ws');

async function main() {
  const list = await new Promise((resolve) => {
    http.get('http://localhost:9223/json/list', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });

  for (let i = 0; i < list.length; i++) {
    const page = list[i];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    let msgId = 1;
    function evalExpr(expr) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (data) => {
          const msg = JSON.parse(data);
          if (msg.id === id) {
            ws.off('message', handler);
            resolve(msg.result?.result?.value);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression: expr, returnByValue: true }
        }));
      });
    }

    const res = await evalExpr(`(() => {
      const el = document.querySelector('.xterm');
      const vp = document.querySelector('.xterm-viewport');
      return {
        hasMouseClass: el?.classList?.contains('enable-mouse-events'),
        viewport: {
          scrollTop: vp?.scrollTop,
          scrollHeight: vp?.scrollHeight,
          clientHeight: vp?.clientHeight,
        },
        hasTerm: typeof term !== 'undefined',
      };
    })()`);

    console.log('Page', i, 'id:', page.id, JSON.stringify(res, null, 2));
    ws.close();
  }
}

main().catch(console.error);
