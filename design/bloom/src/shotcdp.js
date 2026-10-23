// Real-time headless screenshot at any width (phones included; no window opens).
// usage: node shotcdp.js <html-file> "<query>" <out.png> [width=390] [height=844] [wait-ms=1500] [full=0]
const CDP = require('/opt/homebrew/lib/node_modules/chrome-remote-interface');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const [file, query, out, W = 390, H = 844, wait = 1500, full = '0'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 600), dir = path.join(__dirname, '.chrome-' + port);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let c;
  for (let i = 0; i < 50 && !c; i++) { try { c = await CDP({ port }); } catch (e) { await sleep(100); } }
  const { Page, Runtime, Emulation } = c;
  Runtime.exceptionThrown(e => console.log('EXCEPTION:', e.exceptionDetails.exception ? e.exceptionDetails.exception.description : e.exceptionDetails.text));
  await Page.enable(); await Runtime.enable();
  await Emulation.setDeviceMetricsOverride({ width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 700 });
  await Page.navigate({ url: 'file://' + path.resolve(file) + (query ? '?' + query : '') });
  await Page.loadEventFired(); await sleep(+wait);
  const sw = (await Runtime.evaluate({ expression: 'document.documentElement.scrollWidth + "x" + document.documentElement.scrollHeight', returnByValue: true })).result.value;
  const shot = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: full === '1' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`${out} viewport ${W}x${H} scroll ${sw}${+sw.split('x')[0] > +W ? '  <-- HORIZONTAL OVERFLOW' : ''}`);
  await c.close(); chrome.kill();
  setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 300);
})();
