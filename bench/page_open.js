// Time how long blobfs-2d.html takes to open an .orb with its own "Open .orb" button and loader.
// usage: node bench/page_open.js <chromium|firefox> <file.orb> <runs>
// Each run: fresh page load, then time from setFiles() on the file chooser until #reply starts with "Opened".
// Prints JSON {browser, file, runs_ms, reply}. Needs the playwright package (set NODE_PATH).
const path = require('path'); const pw = require('playwright');
const [bname, orbFile, runsArg] = process.argv.slice(2);
const PAGE = 'file://' + path.resolve(__dirname, '..', 'blobfs-2d.html');
(async () => {
  const browser = await pw[bname].launch();
  const runs = [], errs = []; let reply = '';
  for (let i = 0; i < +(runsArg || 5); i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(PAGE); await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpenOrb')]);
    const t0 = Date.now();
    await fc.setFiles(path.resolve(orbFile));
    await page.waitForFunction(() => /^(Opened|Could not open)/.test(document.querySelector('#reply').textContent), null, { timeout: 600000, polling: 5 });
    runs.push(Date.now() - t0);
    reply = await page.textContent('#reply');
    await page.close();
  }
  console.log(JSON.stringify({ browser: bname, file: path.basename(orbFile), runs_ms: runs, reply, pageErrors: errs }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
