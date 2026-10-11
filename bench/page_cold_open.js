// Cold-cache variant of page_open.js. Each run: fresh page load of blobfs-2d.html, THEN sync + drop the
// page cache (bench/drop_cache.sh), then time from setFiles() on the "Open .orb" chooser until #reply
// starts with "Opened". The browser process and page are already up, so only the .orb file read is cold
// (browser binaries mapped in memory may stay resident).
// usage: node bench/page_cold_open.js <chromium|firefox> <file.orb> <runs>
const path = require('path'); const pw = require('playwright'); const { execFileSync } = require('child_process');
const [bname, orbFile, runsArg] = process.argv.slice(2);
const PAGE = 'file://' + path.resolve(__dirname, '..', 'blobfs-2d.html');
const resident = f => { try { return +execFileSync('python3', [path.join(__dirname, 'resident.py'), f]).toString(); } catch (e) { return null; } };
(async () => {
  const browser = await pw[bname].launch();
  const runs = [], errs = [], res = []; let reply = '';
  for (let i = 0; i < +(runsArg || 5); i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(PAGE); await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpenOrb')]);
    execFileSync(path.join(__dirname, 'drop_cache.sh'));
    res.push(resident(path.resolve(orbFile)));
    const t0 = Date.now();
    await fc.setFiles(path.resolve(orbFile));
    await page.waitForFunction(() => /^(Opened|Could not open)/.test(document.querySelector('#reply').textContent), null, { timeout: 600000, polling: 5 });
    runs.push(Date.now() - t0);
    reply = await page.textContent('#reply');
    await page.close();
  }
  console.log(JSON.stringify({ mode: 'cold', browser: bname, file: path.basename(orbFile), runs_ms: runs, reply, pageErrors: errs, resident_bytes_before_each_run: res }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
