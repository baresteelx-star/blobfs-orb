// Regenerates the committed demo.orb fixture with the PAGE's own writer (headless Chromium via Playwright).
// usage: node tests/make_demo_orb.js      (writes ../demo.orb)
// Scenario: the sample disk, plus real files added with "Add files" (one duplicate, one real zip) and one dropped
// onto the stage; unpack of the sample zorb and the real zip; a file+file merge; one refused and one open
// cross-kind suggestion; a dir+dir merge as the last undoable action. Then "Save Orb".
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blobfs-demo-'));
  const w = (n, b) => { const p = path.join(tmp, n); fs.writeFileSync(p, b); return p; };
  const notes = Buffer.from('# Liner notes\n\nRecorded in one take, Helsinki.\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const pcm = Buffer.alloc(8000); for (let i = 0; i < pcm.length; i++) pcm[i] = 128 + Math.round(60 * Math.sin(i / 6));
  const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(8000, 24);
  hdr.writeUInt32LE(8000, 28); hdr.writeUInt16LE(1, 32); hdr.writeUInt16LE(8, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  const files = [w('liner-notes.md', notes), w('liner-notes-copy.md', notes), w('cover-real.png', png), w('take-real.wav', Buffer.concat([hdr, pcm]))];
  const zipPath = path.join(tmp, 'bundle.zip');
  execFileSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_STORED) as z:\n z.writestr("readme.txt","bundle readme\\n")\n z.writestr("art/cover.png",open(sys.argv[2],"rb").read())', zipPath, files[2]]);
  files.push(zipPath);
  const dropped = w('dropped-memo.txt', Buffer.from('a memo dropped onto the stage\n'));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const msgs = []; page.on('console', m => msgs.push(m.text())); page.on('pageerror', e => msgs.push(String(e)));
  await page.goto('file://' + path.join(ROOT, 'blobfs-2d.html')); await page.waitForTimeout(500);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnAddFiles')]);
  await fc.setFiles(files); await page.waitForTimeout(500);
  const b64 = fs.readFileSync(dropped).toString('base64');
  await page.evaluate(({ b64 }) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'dropped-memo.txt'));
    document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { b64 });
  await page.waitForTimeout(200);
  const cmds = ['unpack stems', 'unpack bundle', 'merge photo1 and photo2', 'tag song1 with live', 'tag notes with live',
                'merge song1 into notes', 'tag stems.zip with work', 'merge stems.zip into notes', 'refuse stems.zip',
                'merge Masters into Sessions'];
  for (const c of cmds) { await page.fill('#cmd', c); await page.press('#cmd', 'Enter'); await page.waitForTimeout(150); console.log(c, '->', await page.textContent('#reply')); }
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  await dl.saveAs(path.join(ROOT, 'demo.orb')); await page.waitForTimeout(200);
  console.log(await page.textContent('#reply'));
  if (msgs.length) { console.error('console messages:', msgs); process.exit(1); }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
