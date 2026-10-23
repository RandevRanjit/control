// Real-time headless probe (no window): load a page, wait, run JS steps, print console output, exceptions and results.
// usage: node probe.js <html-file> "<query>" <wait-ms> "<js expression>" ["<js after 2nd wait>" <wait2-ms>]
//   e.g. node probe.js preview/_test.html "" 2500 "Bloom.t()"
const CDP = require('/opt/homebrew/lib/node_modules/chrome-remote-interface');
const { spawn } = require('child_process');
const path = require('path');
const [file, query, wait, expr, expr2, wait2] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 600);
const dir = path.join(__dirname, '.chrome-' + port);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1440,1600', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let client;
  for (let i = 0; i < 50 && !client; i++) { try { client = await CDP({ port }); } catch (e) { await sleep(100); } }
  if (!client) { console.log('could not connect'); chrome.kill(); process.exit(1); }
  const { Page, Runtime } = client;
  Runtime.consoleAPICalled(e => console.log('console.' + e.type + ':', e.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')));
  Runtime.exceptionThrown(e => console.log('EXCEPTION:', e.exceptionDetails.exception ? e.exceptionDetails.exception.description : e.exceptionDetails.text));
  await Page.enable(); await Runtime.enable();
  await Page.navigate({ url: 'file://' + path.resolve(file) + (query ? '?' + query : '') });
  await Page.loadEventFired();
  await sleep(+wait || 2000);
  const run = async x => { const r = await Runtime.evaluate({ expression: x, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? 'EXCEPTION ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description) : JSON.stringify(r.result.value); };
  if (expr) console.log('result:', await run(expr));
  if (expr2) { await sleep(+wait2 || 1000); console.log('result2:', await run(expr2)); }
  await client.close(); chrome.kill();
  setTimeout(() => require('fs').rmSync(dir, { recursive: true, force: true }), 300);
})();
