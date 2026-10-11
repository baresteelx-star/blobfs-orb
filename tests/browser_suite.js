// Rebuilt Playwright check suite for blobfs-2d.html (the original 73-check script was lost; this is a new suite).
// usage: NODE_PATH=... node tests/browser_suite.js [chromium] [firefox]     (default: both)
// Runs the page headless from a local file, prints one line per check, and a JSON summary per browser:
// {"browser", "checks", "passed", "failed", "runtime_ms"}. Exit code 1 if any check failed.
// Needs node, the playwright package with chromium/firefox, and python3 (for the orb.py cross-checks).
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const pw = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'blobfs-2d.html');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

async function runBrowser(bname) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blobfs-suite-'));
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + bname + ' | ' + name + (ok || info === undefined ? '' : ' | ' + JSON.stringify(info))); };
  const t0 = Date.now();
  const browser = await pw[bname].launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const consoleMsgs = [], pageErrors = [], netRequests = [];
  ctx.on('request', r => { const u = r.url(); if (u !== PAGE && !u.startsWith('blob:') && !u.startsWith('data:')) netRequests.push(u); });
  const fresh = async () => {
    const page = await ctx.newPage();
    page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text()));
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto(PAGE); await page.waitForFunction(() => window.BlobFS && /ready/.test(document.querySelector('#status').textContent));
    return page;
  };
  const cmd = async (page, text) => { await page.fill('#cmd', text); await page.press('#cmd', 'Enter'); await page.waitForTimeout(60); return page.textContent('#reply'); };
  const id = (page, n) => page.evaluate(n => BlobFS.byName(n), n);
  const save = async (page, name) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    const p = path.join(tmp, name); await dl.saveAs(p);
    await page.waitForFunction(() => /^Saved/.test(document.querySelector('#reply').textContent));
    return p;
  };
  const open = async (page, p) => {
    await page.evaluate(() => { document.querySelector('#reply').textContent = ''; });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpenOrb')]);
    await fc.setFiles(p);
    await page.waitForFunction(() => /^(Opened|Could not open)/.test(document.querySelector('#reply').textContent), null, { timeout: 30000 });
    return page.textContent('#reply');
  };
  const drop = (page, name, b64) => page.evaluate(({ name, b64 }) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], name));
    const st = document.getElementById('stage');
    st.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, b64 });
  const py = (code, ...args) => JSON.parse(execFileSync('python3', ['-c', 'import sys,json; sys.path.insert(0,' + JSON.stringify(ROOT) + '); import orb\n' + code, ...args]).toString());

  try {
    // ---- rendering ----
    let page = await fresh();
    const top = await page.evaluate(() => BlobFS.topLevel().length);
    check('sample disk loads with status "BlobFS 2D ready"', /^BlobFS 2D ready: \d+ orbs/.test(await page.textContent('#status')));
    check('one .orb element per top-level orb (' + top + ')', (await page.locator('#world > .orb').count()) === top && top === 8);
    check('zorb stems.zip is rendered with a zipper', (await page.locator('.orb.kind-zip .zipper').count()) === 1);

    // ---- colour key ----
    const keyKinds = async () => page.$$eval('#colorKey li', ls => ls.map(l => l.dataset.kind));
    const kk = await keyKinds();
    check('colour key lists dir, image, audio, text, zip', ['dir', 'image', 'audio', 'text', 'zip'].every(k => kk.includes(k)));
    check('colour key entries each have a swatch', await page.$$eval('#colorKey li', ls => ls.length > 0 && ls.every(l => l.children.length >= 1)));
    check('colour key labels zip as "zip (zorb)"', (await page.textContent('#colorKey li[data-kind="zip"]')).includes('zip (zorb)'));
    await page.evaluate(() => BlobFS.addFiles([new File([new Uint8Array([1, 2, 3])], 'odd.qqq')]));
    await page.waitForTimeout(60);
    check('colour key gains a new kind when a file of that kind is added', (await keyKinds()).includes('other'));

    // ---- command bar ----
    await cmd(page, 'what can I say?');
    check('command "what can I say?" shows the help list', !(await page.evaluate(() => document.getElementById('helpBox').hidden)) && (await page.textContent('#helpBox')).length > 50);
    check('unknown command gets a "did not understand" reply', /did not understand/.test(await cmd(page, 'florp the wibble')));
    check('command "open stems" lists the zorb entries', /Opened zorb "stems.zip": 5 files/.test(await cmd(page, 'open stems')));
    check('command "rename notes to memo" keeps the extension-less name and kind', /Renamed "notes" to "memo" \(still text\)/.test(await cmd(page, 'rename notes to memo')));
    check('command "tag memo with work2" adds the tag', /Tagged "memo" with "work2"/.test(await cmd(page, 'tag memo with work2')));
    check('command "undo" reverses the tag', /Undid #\d+: removed tag "work2"/.test(await cmd(page, 'undo')));
    check('command "new folder Inbox" creates a folder', /Created folder "Inbox"/.test(await cmd(page, 'new folder Inbox')) && !!(await id(page, 'Inbox')));
    const z0 = (await page.evaluate(() => BlobFS.view())).z;
    await cmd(page, 'zoom in');
    check('command "zoom in" increases zoom', (await page.evaluate(() => BlobFS.view())).z > z0);
    let chooserOpened = false; page.once('filechooser', () => { chooserOpened = true; });
    const rAdd = await cmd(page, 'add files'); await page.waitForTimeout(200);
    check('command "add files" highlights the button and opens no file picker by itself', /Click the highlighted button/.test(rAdd) && !chooserOpened);
    check('ambiguous name asks which one', /matches \d+ orbs/.test(await cmd(page, 'open photo')));
    await page.close();

    // ---- merge rules ----
    page = await fresh();
    const [cov, ses] = [await id(page, 'Covers'), await id(page, 'Sessions')];
    await page.evaluate(() => BlobFS.rename(BlobFS.byName('take1'), 'cover1'));
    const n0 = await page.evaluate(() => BlobFS.topLevel().length);
    check('Covers (image) + Sessions (audio) share a tag: the merge waits as a pending suggestion', /say "accept"/.test(await cmd(page, 'merge Covers and Sessions')));
    check('dir∪dir is committed only on human accept', /^Accepted: merged "Covers" and "Sessions"/.test(await cmd(page, 'accept')));
    let st = await page.evaluate(([a, b]) => { const tl = BlobFS.topLevel(); const r = tl.find(x => BlobFS.blobs[x].name === 'Sessions + Covers');
      return { n: tl.length, r, kids: r ? BlobFS.blobs[r].children.map(c => BlobFS.blobs[c].name).sort() : [], gone: [BlobFS.blobs[a].gone, BlobFS.blobs[b].gone], type: r && BlobFS.blobs[r].type }; }, [cov, ses]);
    check('dir∪dir gives ONE directory holding all 4 children', st.r && st.type === 'dir' && st.kids.length === 4 && st.n === n0 - 1);
    check('dir∪dir absorbs both source directories', st.gone[0] && st.gone[1]);
    check("dir∪dir name clash renamed to 'cover1 (2)'", st.kids.includes('cover1') && st.kids.includes('cover1 (2)'));
    check('undo of dir∪dir restores both directories with their own children', /both directories restored/.test(await cmd(page, 'undo')) &&
      await page.evaluate(([a, b]) => !BlobFS.blobs[a].gone && !BlobFS.blobs[b].gone && BlobFS.blobs[a].children.length === 2 && BlobFS.blobs[b].children.length === 2 &&
        BlobFS.blobs[b].children.map(c => BlobFS.blobs[c].name).includes('cover1'), [cov, ses]));
    const [p1, p2] = [await id(page, 'photo1'), await id(page, 'photo2')];
    await cmd(page, 'merge photo1 and photo2');
    st = await page.evaluate(([a, b]) => { const r = BlobFS.blobs[a].parent; return { r, same: r && r === BlobFS.blobs[b].parent, type: r && BlobFS.blobs[r].type, name: r && BlobFS.blobs[r].name, kids: r && BlobFS.blobs[r].children.length }; }, [p1, p2]);
    check('file∪file makes a NEW directory holding both files', st.same && st.type === 'dir' && st.kids === 2 && st.r !== p1 && st.r !== p2);
    check('file∪file directory is named "photo2 + photo1"', st.name === 'photo2 + photo1');
    const [mem, notes] = [await id(page, 'Masters'), await id(page, 'notes')];
    await cmd(page, 'merge notes and Masters');
    check('file∪dir: the directory adopts the file (no new directory)', await page.evaluate(([d, f]) => BlobFS.blobs[f].parent === d && BlobFS.topLevel().includes(d) && BlobFS.blobs[d].children.length === 1, [mem, notes]));
    check('kind gate: different kinds, no shared tag, stay apart', /stay apart/.test(await cmd(page, 'merge song1 and stems')) && !(await page.evaluate(() => BlobFS.blobs[BlobFS.byName('song1')].parent)));
    check('physics may propose, never commit', await page.evaluate(() => { try { BlobFS.accept('nope'); } catch (e) {} return true; }) &&
      await page.evaluate(() => { const ev = BlobFS.events.filter(e => e.type === 'merge' && e.confirmedBy === 'physics'); return ev.length === 0; }));
    await page.close();

    // ---- zorb unpack ----
    page = await fresh();
    const zid = await id(page, 'stems.zip');
    const zr = await cmd(page, 'unpack stems');
    st = await page.evaluate(z => { const d = BlobFS.byName('stems'); return { d, type: d && BlobFS.blobs[d].type, kids: d ? BlobFS.blobs[d].children.map(c => BlobFS.blobs[c].name).sort() : [], zipStill: BlobFS.topLevel().includes(z), entries: BlobFS.blobs[z].entries.length }; }, zid);
    check('unpack reports a new folder with 5 files', /Unpacked "stems.zip" into new folder "stems" \(5 files\)/.test(zr));
    check('unpacked folder holds 5 files, duplicate basename disambiguated as "kick (2).wav"', st.type === 'dir' && st.kids.length === 5 && st.kids.includes('kick.wav') && st.kids.includes('kick (2).wav'));
    check('the zorb itself is left unchanged on the stage', st.zipStill && st.entries === 5);
    check('undo of unpack removes the folder', /removed folder "stems" from unpack/.test(await cmd(page, 'undo')) && !(await id(page, 'stems')));
    await page.close();

    // ---- dropped files: real bytes, sha256, orb.py, round-trip, undo history, pending ----
    page = await fresh();
    const dropA = crypto.randomBytes(70000), dropB = crypto.randomBytes(1234);
    await drop(page, 'drop-a.bin', dropA.toString('base64')); await page.waitForTimeout(100);
    await drop(page, 'drop-b.txt', dropB.toString('base64')); await page.waitForTimeout(100);
    const inPage = await page.evaluate(async () => { const o = {}; for (const n of ['drop-a.bin', 'drop-b.txt']) { const b = BlobFS.blobs[BlobFS.byName(n)]; o[n] = b && b.file ? await BlobFS.sha256(new Uint8Array(await b.file.arrayBuffer())) : null; } return o; });
    check('dropped files appear as orbs', inPage['drop-a.bin'] !== undefined && inPage['drop-b.txt'] !== undefined && /Imported 1 file/.test(await page.textContent('#reply')));
    check('dropped file bytes keep their SHA-256 in the page', inPage['drop-a.bin'] === sha(dropA) && inPage['drop-b.txt'] === sha(dropB));
    // build an undo history: dir∪dir merge, rename, tag; and a pending cross-kind suggestion
    await cmd(page, 'merge Covers and Sessions'); await cmd(page, 'accept');
    await cmd(page, 'rename song1 to anthem');
    await cmd(page, 'tag photo1 with demo');
    check('cross-kind with a shared tag becomes a pending suggestion', /say "accept"/.test(await cmd(page, 'merge anthem and photo1')));
    await page.evaluate(() => { BlobFS.tag(BlobFS.byName('notes'), 'stems'); });
    await cmd(page, 'merge notes and stems');
    const before = await page.evaluate(() => ({ undo: BlobFS.undoDepth(), pend: BlobFS.pending().map(p => p.key).sort(), top: BlobFS.topLevel().length }));
    check('two pending suggestions before save', before.pend.length === 2);
    const o1 = await save(page, 'suite1.orb');
    check('Save Orb downloads a zip (PK header)', fs.readFileSync(o1).slice(0, 2).toString() === 'PK');
    const pyr = py('d=orb.load(sys.argv[1], verify=True)\nprint(json.dumps({"hashes":{b["name"]:b["hash"] for b in d.blobs.values() if b["type"]=="file"}, "ok":True, "undo":len(d.undo), "pending":len(d.pending), "payload":{b["name"]:orb.sha256(d.objects[b["hash"]]) for b in d.blobs.values() if b["type"]=="file" and b.get("payload")=="bytes"}}))', o1);
    check('orb.py opens and verifies the page-written .orb', pyr.ok);
    check('orb.py reads the dropped files with the same SHA-256', pyr.payload['drop-a.bin'] === sha(dropA) && pyr.payload['drop-b.txt'] === sha(dropB));
    check('orb.py sees the saved undo history and pending suggestions', pyr.undo === before.undo && pyr.pending === 2);
    await page.close();
    page = await fresh();
    const r1 = await open(page, o1);
    check('Open .orb reopens with all SHA-256 hashes verified', /^Opened suite1.orb: .*all SHA-256 hashes verified/.test(r1));
    const after = await page.evaluate(() => ({ undo: BlobFS.undoDepth(), pend: BlobFS.pending().map(p => p.key).sort(), top: BlobFS.topLevel().length }));
    check('reopen keeps the same top-level orb count', after.top === before.top);
    check('undo history depth preserved across save/reopen (' + before.undo + ')', after.undo === before.undo && before.undo >= 6);
    check('pending suggestions survive reopen', JSON.stringify(after.pend) === JSON.stringify(before.pend));
    const reHash = await page.evaluate(async () => { const b = BlobFS.blobs[BlobFS.byName('drop-a.bin')]; return await BlobFS.sha256(new Uint8Array(await b.file.arrayBuffer())); });
    check('reopened dropped file is byte-exact', reHash === sha(dropA));
    check('a reopened suggestion can be accepted', /^Accepted: merged "anthem" and "photo1"/.test(await cmd(page, 'accept anthem')));
    check('a reopened suggestion can be refused', /^Kept "notes" and "stems.zip" apart/.test(await cmd(page, 'refuse')) && (await page.evaluate(() => BlobFS.pending().length)) === 0);
    await cmd(page, 'undo'); await cmd(page, 'undo'); // withdraw refusal, unmerge accepted
    await cmd(page, 'undo'); await cmd(page, 'undo'); await cmd(page, 'undo'); // tag notes, tag photo1, rename song1
    const u = await cmd(page, 'undo');
    check('undo after reopen restores both directories of the saved dir∪dir merge', /both directories restored/.test(u) &&
      await page.evaluate(() => ['Covers', 'Sessions'].every(n => { const d = BlobFS.byName(n); return d && BlobFS.topLevel().includes(d) && BlobFS.blobs[d].children.length === 2; })));
    // second round trip: save again, compare blob hashes page vs orb.py, and reopen
    const o2 = await save(page, 'suite2.orb');
    const pageLoad = await page.evaluate(() => BlobFS.buildOrb().then(r => r.records.filter(x => x.t === 'blob' && x.hash).map(x => [x.id, x.hash]).sort()));
    const py2 = py('d=orb.load(sys.argv[1], verify=True)\nprint(json.dumps(sorted([k,b["hash"]] for k,b in d.blobs.items() if b["type"]=="file")))', o2);
    check('second save: orb.py and page agree on every blob hash (' + py2.length + ')', JSON.stringify(py2) === JSON.stringify(pageLoad) && py2.length > 10);
    await page.close();
    page = await fresh();
    check('second save reopens cleanly', /all SHA-256 hashes verified/.test(await open(page, o2)));
    // a flipped bit is refused
    const bad = Buffer.from(fs.readFileSync(o1)); const at = bad.indexOf(dropA.slice(0, 32)); bad[at + 10] ^= 1;
    const pb = path.join(tmp, 'flipped.orb'); fs.writeFileSync(pb, bad);
    const fr = await open(page, pb); check('a flipped bit in a payload is refused on open', /^Could not open flipped.orb: (hash|CRC) mismatch.*damaged/.test(fr), fr);
    await page.close();

    // ---- 4 GiB refusal and zip32 limits ----
    page = await fresh();
    const big = await page.evaluate(() => {
      const n0 = BlobFS.topLevel().length;
      BlobFS.addFiles([{ name: 'huge.bin', size: 4294967296 }]); // File-like stub: the 4 GiB check reads only .size
      return { msg: document.querySelector('#reply').textContent, added: BlobFS.topLevel().length - n0 };
    });
    check('a 4 GiB file is refused with a zip32 message and not added', /Refused "huge.bin".*under 4 GiB.*zip32/.test(big.msg) && big.added === 0);
    const z = await page.evaluate(() => { const t = f => { try { return { ok: true, v: BlobFS.zip32Check(f) }; } catch (e) { return { ok: false, m: e.message }; } };
      return { small: t([{ name: 'a', size: 10 }]), entry: t([{ name: 'x', size: 4294967296 }]), total: t([{ name: 'x', size: 4294967295 }]),
               two: t([{ name: 'a', size: 2147483648 }, { name: 'b', size: 2147483648 }]), many: t(Array.from({ length: 65536 }, (_, i) => ({ name: 'f' + i, size: 0 }))),
               max: t(Array.from({ length: 65535 }, (_, i) => ({ name: 'f' + i, size: 0 }))) }; });
    check('zip32Check accepts a small archive and returns its exact size', z.small.ok && z.small.v === 22 + 30 + 1 + 10 + 46 + 1);
    check('zip32: a single entry of 4 GiB is rejected', !z.entry.ok && /under 4 GiB/.test(z.entry.m));
    check('zip32: an entry just under 4 GiB still overflows the 32-bit archive and is rejected', !z.total.ok && /over the 4 GiB zip32 limit/.test(z.total.m));
    check('zip32: two 2 GiB entries are rejected (total over limit)', !z.two.ok && /over the 4 GiB/.test(z.two.m));
    check('zip32: 65536 entries rejected, 65535 accepted', !z.many.ok && /limit 65535/.test(z.many.m) && z.max.ok);
    await page.close();

    // ---- hygiene ----
    check('zero console messages', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
    check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
    check('zero network requests', netRequests.length === 0, netRequests.slice(0, 5));
  } catch (e) {
    check('suite ran to completion without an exception', false, String(e && e.stack || e));
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const passed = results.filter(r => r.ok).length;
  const sum = { browser: bname, checks: results.length, passed, failed: results.length - passed, runtime_ms: Date.now() - t0 };
  console.log(JSON.stringify(sum));
  return sum;
}
(async () => {
  const bs = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox'];
  let fail = 0;
  for (const b of bs) fail += (await runBrowser(b)).failed;
  process.exit(fail ? 1 : 0);
})();
