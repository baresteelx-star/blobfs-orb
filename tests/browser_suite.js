// Playwright checks for blobfs-2d.html.
// The original 73-check script (2026-10-03) was not kept. This suite covers the behaviors that script
// was described as testing, plus the format rules in the paper: split math, dedup, name collisions,
// nesting, recorded refusal, undo-as-event, the local use log, hash/CRC/DEFLATE integrity,
// a real >= 4 GiB sparse file refused by the file input, and spoken commands from a fake Web Speech API.
// usage: node tests/browser_suite.js [chromium] [firefox]     (default: both)
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
    // Real file, not a stub. Sparse is enough: admit() refuses on File.size before any byte is read.
    const hugePath = path.join(tmp, 'huge-4gib.bin');
    execFileSync('truncate', ['-s', '4294967296', hugePath]);
    const hugeBefore = fs.statSync(hugePath);
    const orbsBeforeHuge = await page.evaluate(() => BlobFS.topLevel().length);
    const hugeT0 = Date.now();
    await page.locator('#inFiles').setInputFiles(hugePath);
    await page.waitForFunction(() => /Refused "huge-4gib\.bin"/.test(document.querySelector('#reply').textContent), null, { timeout: 20000 });
    const hugeMs = Date.now() - hugeT0;
    const hugeAfter = fs.statSync(hugePath);
    const hugeMsg = await page.textContent('#reply');
    const orbsAfterHuge = await page.evaluate(() => BlobFS.topLevel().length);
    const hugePresent = await page.evaluate(() => !!BlobFS.byName('huge-4gib.bin'));
    check('a real sparse file of 4 GiB is refused by the file input and not added',
      hugeBefore.size === 4294967296 && hugeBefore.blocks === 0 && hugeAfter.size === hugeBefore.size && hugeAfter.blocks === 0 &&
      orbsAfterHuge === orbsBeforeHuge && !hugePresent &&
      /Refused "huge-4gib\.bin" \(4294\.97 MB\): a file must be under 4 GiB.*zip32/.test(hugeMsg),
      { size: hugeBefore.size, blocksBefore: hugeBefore.blocks, blocksAfter: hugeAfter.blocks, hugeMs, orbsBeforeHuge, orbsAfterHuge, hugeMsg });
    const z = await page.evaluate(() => { const t = f => { try { return { ok: true, v: BlobFS.zip32Check(f) }; } catch (e) { return { ok: false, m: e.message }; } };
      return { small: t([{ name: 'a', size: 10 }]), entry: t([{ name: 'x', size: 4294967296 }]), total: t([{ name: 'x', size: 4294967295 }]),
               two: t([{ name: 'a', size: 2147483648 }, { name: 'b', size: 2147483648 }]), many: t(Array.from({ length: 65536 }, (_, i) => ({ name: 'f' + i, size: 0 }))),
               max: t(Array.from({ length: 65535 }, (_, i) => ({ name: 'f' + i, size: 0 }))) }; });
    check('zip32Check accepts a small archive and returns its exact size', z.small.ok && z.small.v === 22 + 30 + 1 + 10 + 46 + 1);
    check('zip32: a single entry of 4 GiB is rejected', !z.entry.ok && /under 4 GiB/.test(z.entry.m));
    check('zip32: an entry just under 4 GiB still overflows the 32-bit archive and is rejected', !z.total.ok && /over the 4 GiB zip32 limit/.test(z.total.m));
    check('zip32: two 2 GiB entries are rejected (total over limit)', !z.two.ok && /over the 4 GiB/.test(z.two.m));
    check('zip32: 65536 entries rejected, 65535 accepted', !z.many.ok && /limit 65535/.test(z.many.m) && z.max.ok);
    const digest = await page.evaluate(async () => {
      BlobFS.useJsSha(true);
      const h = await BlobFS.sha256(new TextEncoder().encode('abc'));
      BlobFS.useJsSha(false);
      return h;
    });
    check('inline SHA-256 matches the known digest of "abc"', digest === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', digest);
    await page.close();

    // ---- commands the 60-check rebuild did not exercise, plus mass and radius ----
    page = await fresh();
    check('undo on a fresh disk says there is nothing to undo', /Nothing to undo/.test(await cmd(page, 'undo')));
    check('an empty command asks for a command', /what can I say/.test(await cmd(page, '   ')));
    check('merging an orb with itself is refused', /same orb twice/.test(await cmd(page, 'merge notes and notes')));
    let folderChooser = false; page.once('filechooser', () => { folderChooser = true; });
    const importReply = await cmd(page, 'import folder'); await page.waitForTimeout(150);
    check('command "import folder" highlights the button and opens no file picker', /Click the highlighted button/.test(importReply) && !folderChooser &&
      await page.evaluate(() => document.getElementById('btnImportFolder').classList.contains('pulse')));
    const nestedReply = await cmd(page, 'merge take1 and photo1');
    check('merging a nested orb is refused and tells you to split it out', /is inside/.test(nestedReply) && /split it out first/.test(nestedReply) &&
      await page.evaluate(() => BlobFS.blobs[BlobFS.byName('take1')].parent === BlobFS.byName('Sessions')));
    check('rename keeps a zip extension and its kind', /Renamed "stems.zip" to "drums.zip" \(still zip\)/.test(await cmd(page, 'rename stems to drums')) &&
      await page.evaluate(() => { const id = BlobFS.byName('drums.zip'); return !!id && BlobFS.kindOf(id) === 'zip'; }));
    const zStart = (await page.evaluate(() => BlobFS.view())).z;
    await cmd(page, 'zoom out');
    const zOut = (await page.evaluate(() => BlobFS.view())).z;
    await cmd(page, 'zoom reset');
    const zReset = (await page.evaluate(() => BlobFS.view())).z;
    check('zoom out decreases zoom and zoom reset returns to 100%', zOut < zStart && Math.abs(zReset - 1) < 0.001, { zStart, zOut, zReset });
    check('zoom to a named orb raises the zoom', /Zoomed to "notes"/.test(await cmd(page, 'zoom notes')) && (await page.evaluate(() => BlobFS.view())).z >= 1.8);
    await cmd(page, 'what can I say?');
    await cmd(page, 'open notes');
    const closed = await cmd(page, 'close');
    check('close hides the help list and clears the selection', /^Closed\./.test(closed) &&
      await page.evaluate(() => document.getElementById('helpBox').hidden && /Click an orb/.test(document.getElementById('inspector').textContent)));
    const mic = await page.evaluate(() => {
      const btn = document.getElementById('btnMic');
      const has = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      return { disabled: btn.disabled, has, title: btn.title || '' };
    });
    check('the microphone button is enabled only where the Web Speech API exists', mic.disabled === !mic.has && (mic.has || /typing works/i.test(mic.title)), mic);
    await cmd(page, 'new folder EmptyBox');
    const rad = await page.evaluate(() => {
      const e = BlobFS.byName('EmptyBox'), h = BlobFS.byName('photo1');
      const me = BlobFS.massOf(e), mh = BlobFS.massOf(h), re = BlobFS.radiusOf(e), rh = BlobFS.radiusOf(h);
      return { me, mh, re, rh, err: Math.abs(rh - re * Math.cbrt(mh / me)) };
    });
    check('an empty folder has mass 1 MiB and radius follows the cube root of mass', rad.me === 1048576 && rad.mh > rad.me && rad.err < 0.02, rad);
    await cmd(page, 'tag song1 with link');
    await cmd(page, 'tag photo1 with link');
    await cmd(page, 'merge song1 and photo1');
    await cmd(page, 'tag notes with link');
    await cmd(page, 'tag photo2 with link');
    await cmd(page, 'merge notes and photo2');
    const amb = await cmd(page, 'accept');
    check('accept with more than one suggestion asks which one and commits nothing', /suggestions are pending/.test(amb) && /Say "accept/.test(amb) &&
      await page.evaluate(() => ['song1', 'photo1', 'notes', 'photo2'].every(n => BlobFS.blobs[BlobFS.byName(n)].parent === null)), amb);
    await page.close();

    // ---- split math, history of the move, unmerge leaves the merge in the log ----
    page = await fresh();
    await cmd(page, 'tag song1 with pair');
    await cmd(page, 'tag photo1 with pair');
    check('the 0.8 MB song and the 2.7 MB photo wait for a human', /say "accept"/.test(await cmd(page, 'merge song1 and photo1')));
    check('accepting them builds one directory and does not paste the bytes together', /^Accepted: merged "song1" and "photo1"/.test(await cmd(page, 'accept song1')) &&
      await page.evaluate(() => {
        const song = BlobFS.byName('song1'), photo = BlobFS.byName('photo1');
        const p = BlobFS.blobs[song].parent;
        return p && p === BlobFS.blobs[photo].parent && BlobFS.blobs[p].type === 'dir' &&
          BlobFS.blobs[song].size === 800000 && BlobFS.blobs[photo].size === 2700000 && BlobFS.blobs[p].children.length === 2;
      }));
    const rings = await page.evaluate(() => {
      const id = BlobFS.blobs[BlobFS.byName('song1')].parent;
      const el = document.querySelector('.orb[data-id="' + id + '"] .label');
      return { rings: BlobFS.blobs[id].rings, label: el ? el.textContent : '' };
    });
    check('the merged directory draws one ring', rings.rings === 1 && /1 ring/.test(rings.label), rings);
    const splitReply = await cmd(page, 'split song1');
    const splitMass = await page.evaluate(() => {
      const song = BlobFS.byName('song1'), photo = BlobFS.byName('photo1');
      const parent = BlobFS.blobs[photo].parent;
      const ev = BlobFS.events.filter(e => e.type === 'split').pop();
      return { child: BlobFS.massOf(song), parentMass: BlobFS.massOf(parent), before: ev && ev.parentMassBefore,
               songSize: BlobFS.blobs[song].size, photoSize: BlobFS.blobs[photo].size,
               songFree: BlobFS.blobs[song].parent === null, parentName: BlobFS.blobs[parent].name };
    });
    const halfPayloads = (2700000 + 800000) / 2;
    check('splitting them moves exactly the child mass (800000 + 1 MiB), not half the payloads (1750000)',
      /Split "song1" out of/.test(splitReply) && splitMass.songFree && splitMass.songSize === 800000 && splitMass.photoSize === 2700000 &&
      splitMass.child === 800000 + 1048576 && splitMass.before === splitMass.parentMass + splitMass.child &&
      splitMass.child !== halfPayloads && halfPayloads === 1750000, splitMass);
    // parent + child == merged mass: recompute from the event the split recorded
    const splitEv = await page.evaluate(() => {
      const ev = BlobFS.events.filter(e => e.type === 'split').pop();
      const merge = BlobFS.events.filter(e => e.type === 'merge');
      const dom = document.getElementById('history').textContent;
      return { before: ev && ev.parentMassBefore, after: ev && ev.parentMassAfter, child: ev && ev.childMass,
               merges: merge.length, domHasMerge: /merged/.test(dom), domHasSplit: /split/.test(dom) };
    });
    check('the parent lost exactly the child mass and the merge stays visible in the history',
      splitEv.before - splitEv.after === splitEv.child && splitEv.child === 800000 + 1048576 &&
      splitEv.before === splitEv.after + splitEv.child && splitEv.merges === 1 && splitEv.domHasMerge && splitEv.domHasSplit, splitEv);
    const undoSplit = await cmd(page, 'undo');
    check('undo of the split puts the file back and keeps the split event', /put "song1" back into/.test(undoSplit) &&
      await page.evaluate(() => {
        const song = BlobFS.byName('song1');
        return BlobFS.blobs[song].parent !== null && BlobFS.events.some(e => e.type === 'split') && BlobFS.events.some(e => e.type === 'undo');
      }));
    const unmerge = await cmd(page, 'undo');
    const freed = await page.evaluate(() => {
      const song = BlobFS.byName('song1'), photo = BlobFS.byName('photo1');
      return { songParent: BlobFS.blobs[song].parent, photoParent: BlobFS.blobs[photo].parent,
               songSize: BlobFS.blobs[song].size, photoSize: BlobFS.blobs[photo].size,
               merges: BlobFS.events.filter(e => e.type === 'merge').length,
               undos: BlobFS.events.filter(e => e.type === 'undo').length,
               dom: document.getElementById('history').textContent };
    });
    check('unmerge frees both files and leaves the merge event in the log', /unmerged "song1" and "photo1"/.test(unmerge) &&
      freed.songParent === null && freed.photoParent === null && freed.songSize === 800000 && freed.photoSize === 2700000 &&
      freed.merges === 1 && freed.undos >= 2 && /merged/.test(freed.dom) && /unmerged/.test(freed.dom), freed);
    await page.close();

    // ---- local use log: opens, plays, exports ----
    page = await fresh();
    const notesId = await id(page, 'notes');
    const undo0 = await page.evaluate(() => BlobFS.undoDepth());
    await page.locator('.orb[data-id="' + notesId + '"]').click();
    await page.waitForTimeout(40);
    const opened = await page.evaluate((id) => {
      const ev = BlobFS.events.filter(e => e.type === 'open');
      return { n: ev.length, local: !!(ev[0] && ev[0].local), via: ev[0] && ev[0].via, id: ev[0] && ev[0].id,
               text: ev[0] && ev[0].text, undo: BlobFS.undoDepth(),
               inspector: document.getElementById('inspector').textContent };
    }, notesId);
    check('clicking an orb logs one local open and selects it', opened.n === 1 && opened.local && opened.via === 'click' && opened.id === notesId &&
      /open "notes"/.test(opened.text) && opened.undo === undo0 && /notes/.test(opened.inspector), opened);
    await page.locator('.orb[data-id="' + notesId + '"]').click();
    await page.waitForTimeout(40);
    check('opening the same orb again does not log a second open', await page.evaluate(() => BlobFS.events.filter(e => e.type === 'open').length === 1));
    await cmd(page, 'open song1');
    await cmd(page, 'open song1');
    const opens = await page.evaluate(() => BlobFS.events.filter(e => e.type === 'open').map(e => e.text));
    check('a typed open is logged once and repeating it is not', opens.length === 2 && opens.some(t => /open "song1" \(typed\)/.test(t)), opens);
    const playsBefore = await page.evaluate(() => BlobFS.events.filter(e => e.type === 'play').length);
    const zipPlay = await cmd(page, 'play stems');
    const textPlay = await cmd(page, 'play notes');
    const playsMid = await page.evaluate(() => BlobFS.events.filter(e => e.type === 'play').length);
    check('playing a zip or a text file is refused and is not logged', /is a zip/.test(zipPlay) && /no audio/.test(textPlay) && playsMid === playsBefore, { zipPlay, textPlay });
    const songPlay = await cmd(page, 'play song1');
    const playEv = await page.evaluate(() => BlobFS.events.filter(e => e.type === 'play').map(e => ({ local: !!e.local, text: e.text })));
    check('playing sample audio logs a local play event', playEv.length === 1 && playEv[0].local && /play "song1"/.test(playEv[0].text) &&
      (/short generated tone/.test(songPlay) || /no WebAudio/.test(songPlay)), { songPlay, playEv });
    const undoBeforeExport = await page.evaluate(() => BlobFS.undoDepth());
    const dlPromise = page.waitForEvent('download');
    const expReply = await cmd(page, 'export history');
    const expDl = await dlPromise;
    const histPath = path.join(tmp, 'history-' + bname + '.txt');
    await expDl.saveAs(histPath);
    const histText = fs.readFileSync(histPath, 'utf8');
    const undoAfterExport = await page.evaluate(() => BlobFS.undoDepth());
    check('export history contains the use-log events and does not push an undo',
      expDl.suggestedFilename() === 'blobfs-history.txt' && /local use log/.test(histText) && /open "notes"/.test(histText) &&
      /play "song1"/.test(histText) && /local use-log events/.test(expReply) && undoAfterExport === undoBeforeExport, expReply);
    await page.close();

    // ---- dedup and the notes.txt collision, on an empty disk ----
    const fixDir = path.join(tmp, 'fix'); fs.mkdirSync(fixDir);
    fs.writeFileSync(path.join(fixDir, 'build.py'), [
      'import os, sys, zipfile',
      'sys.path.insert(0, sys.argv[1])',
      'import orb',
      'base = sys.argv[2]',
      'orb.save(orb.Disk(), os.path.join(base, "empty.orb"))',
      'd = orb.Disk()',
      'outer = d.add_dir("Outer")',
      'inner = d.add_dir("Inner", parent=outer)',
      'd.add_file("deep.txt", b"deep-bytes-xyz", parent=inner)',
      'side = d.add_dir("Shelf")',
      'd.add_file("item.txt", b"side-bytes", parent=side)',
      'orb.save(d, os.path.join(base, "nested.orb"))',
      's = orb.Disk()',
      's.add_file("hello.bin", b"hello-blobfs")',
      'small = os.path.join(base, "small.orb")',
      'orb.save(s, small)',
      'flipped = {"done": False}',
      'def mut(name, data):',
      '    if name.startswith("objects/") and not flipped["done"] and data:',
      '        flipped["done"] = True',
      '        return bytes([data[0] ^ 1]) + data[1:]',
      '    return data',
      'with zipfile.ZipFile(small) as z, zipfile.ZipFile(os.path.join(base, "hashbad.orb"), "w") as w:',
      '    for n in z.namelist():',
      '        w.writestr(n, mut(n, z.read(n)))',
      'raw = bytearray(open(small, "rb").read())',
      'with zipfile.ZipFile(small) as z:',
      '    oname = next(n for n in z.namelist() if n.startswith("objects/"))',
      '    local = z.getinfo(oname).header_offset + 14',
      'name_b = oname.encode()',
      'start, central = 0, None',
      'while True:',
      '    i = raw.find(b"PK\\x01\\x02", start)',
      '    if i < 0: break',
      '    nl = int.from_bytes(raw[i+28:i+30], "little")',
      '    if bytes(raw[i+46:i+46+nl]) == name_b:',
      '        central = i + 16',
      '        break',
      '    start = i + 4',
      'if central is None: raise SystemExit("no central crc")',
      'raw[local] ^= 0xFF',
      'raw[central] ^= 0xFF',
      'open(os.path.join(base, "crcbad.orb"), "wb").write(raw)',
      'p = orb.Disk()',
      'p.add_file("deflated.bin", b"deflate-payload-xyz")',
      'stored = os.path.join(base, "defstored.orb")',
      'orb.save(p, stored)',
      'with zipfile.ZipFile(stored) as z, zipfile.ZipFile(os.path.join(base, "deflate.orb"), "w", compression=zipfile.ZIP_DEFLATED) as w:',
      '    for n in z.namelist():',
      '        w.writestr(n, z.read(n))',
      'print("fixtures-ok")',
    ].join('\n'));
    execFileSync('python3', [path.join(fixDir, 'build.py'), ROOT, fixDir], { encoding: 'utf8' });
    page = await fresh();
    check('an empty .orb opens and verifies', /^Opened empty\.orb: 0 orbs, 0 blobs, 0 payloads \(all SHA-256 hashes verified\)/.test(await open(page, path.join(fixDir, 'empty.orb'))));
    const same = crypto.randomBytes(64), other = crypto.randomBytes(64);
    await drop(page, 'dup-a.bin', same.toString('base64')); await page.waitForTimeout(80);
    await drop(page, 'dup-b.bin', same.toString('base64')); await page.waitForTimeout(80);
    await drop(page, 'uniq.bin', other.toString('base64')); await page.waitForTimeout(80);
    const dedupPath = await save(page, 'dedup.orb');
    const dedup = py('d=orb.load(sys.argv[1])\nfiles={b["name"]:b["hash"] for b in d.blobs.values() if b["type"]=="file"}\nprint(json.dumps({"objects":len(d.objects),"files":files,"payload":{b["name"]:b.get("payload") for b in d.blobs.values() if b["type"]=="file"}}))', dedupPath);
    check('three files with one duplicate are stored as two payloads', dedup.objects === 2 && dedup.files['dup-a.bin'] === dedup.files['dup-b.bin'] &&
      dedup.files['dup-a.bin'] !== dedup.files['uniq.bin'] && dedup.payload['dup-a.bin'] === 'bytes' && dedup.files['dup-a.bin'] === sha(same), dedup);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([1, 2, 3, 4])], 'notes.txt'));
      dt.items.add(new File([new Uint8Array([5, 6, 7, 8])], 'notes.txt'));
      const st = document.getElementById('stage');
      st.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(120);
    const clash = await page.evaluate(async () => {
      const ids = Object.keys(BlobFS.blobs).filter(id => BlobFS.blobs[id].name === 'notes.txt' && BlobFS.blobs[id].parent === null && !BlobFS.blobs[id].gone);
      if (ids.length !== 2) return { ids: ids.length };
      BlobFS.resolveDrop(ids[0], ids[1]);
      const parent = BlobFS.blobs[ids[0]].parent;
      const out = { type: BlobFS.blobs[parent].type, names: BlobFS.blobs[parent].children.map(c => BlobFS.blobs[c].name).sort(), hashes: {} };
      for (const c of BlobFS.blobs[parent].children) {
        out.hashes[BlobFS.blobs[c].name] = await BlobFS.sha256(new Uint8Array(await BlobFS.blobs[c].file.arrayBuffer()));
      }
      return out;
    });
    check('two notes.txt files become notes.txt and notes (2).txt and both payloads survive',
      clash.type === 'dir' && clash.names && clash.names.join(',') === 'notes (2).txt,notes.txt' && clash.hashes['notes.txt'] !== clash.hashes['notes (2).txt'], clash);
    await page.close();

    // ---- a folder merged in stays a sub-orb ----
    page = await fresh();
    check('a nested folder opens as a sub-orb, not a flattened top-level file', /^Opened nested\.orb:/.test(await open(page, path.join(fixDir, 'nested.orb'))) &&
      await page.evaluate(() => {
        const outer = BlobFS.byName('Outer'), inner = BlobFS.byName('Inner'), deep = BlobFS.byName('deep.txt');
        const top = BlobFS.topLevel().map(id => BlobFS.blobs[id].name).sort();
        const outerEl = document.querySelector('.orb[data-id="' + outer + '"]');
        const innerEl = outerEl && outerEl.querySelector('.sub[data-id="' + inner + '"]');
        const deepEl = innerEl && innerEl.querySelector('.sub[data-id="' + deep + '"]');
        return top.join(',') === 'Outer,Shelf' && BlobFS.blobs[inner].type === 'dir' && BlobFS.blobs[inner].parent === outer &&
          BlobFS.blobs[deep].parent === inner && !BlobFS.topLevel().includes(inner) && !!(innerEl && deepEl);
      }));
    const nestIds = await page.evaluate(() => ({ outer: BlobFS.byName('Outer'), side: BlobFS.byName('Shelf'), inner: BlobFS.byName('Inner'), deep: BlobFS.byName('deep.txt') }));
    const nestMerge = await cmd(page, 'merge Outer and Shelf');
    const nestAfter = await page.evaluate((ids) => {
      const result = BlobFS.blobs[ids.inner].parent;
      const direct = BlobFS.blobs[result].children.map(c => BlobFS.blobs[c].name).sort();
      const el = document.querySelector('.orb[data-id="' + result + '"] .sub[data-id="' + ids.inner + '"]');
      return { replyOk: true, direct, deepParent: BlobFS.blobs[ids.deep].parent === ids.inner, innerType: BlobFS.blobs[ids.inner].type,
               resultType: BlobFS.blobs[result].type, outerGone: !!BlobFS.blobs[ids.outer].gone, sideGone: !!BlobFS.blobs[ids.side].gone,
               innerTop: BlobFS.topLevel().includes(ids.inner), drawn: !!el };
    }, nestIds);
    check('merging that folder keeps the inner folder whole', /^Merged "Outer" and "Shelf"/.test(nestMerge) && nestAfter.innerType === 'dir' &&
      nestAfter.resultType === 'dir' && nestAfter.deepParent && nestAfter.direct.indexOf('Inner') !== -1 && nestAfter.direct.indexOf('deep.txt') === -1 &&
      nestAfter.outerGone && nestAfter.sideGone && !nestAfter.innerTop && nestAfter.drawn, { nestMerge, nestAfter });
    const nestSaved = await save(page, 'nested-merged.orb');
    const nestPy = py('d=orb.load(sys.argv[1])\ni=d.by_name("deep.txt")\nprint(json.dumps({"bytes":d.payload(i).decode("utf-8"),"parentType":d.blobs[d.parent[i]]["type"],"parentName":d.blobs[d.parent[i]]["name"]}))', nestSaved);
    check('the nested file survives the page merge byte for byte', nestPy.bytes === 'deep-bytes-xyz' && nestPy.parentType === 'dir' && nestPy.parentName === 'Inner', nestPy);
    await page.close();

    // ---- physics may propose, never commit; a refusal is recorded ----
    page = await fresh();
    await page.evaluate(({ gap }) => {
      const a = BlobFS.byName('song1'), b = BlobFS.byName('photo1');
      const place = () => {
        let k = 0;
        BlobFS.topLevel().forEach((id) => {
          const o = BlobFS.blobs[id];
          o.vx = o.vy = 0;
          if (id === a || id === b) return;
          o.x = 60 + (k % 4) * 200; o.y = 460; k++;
        });
        const A = BlobFS.blobs[a], B = BlobFS.blobs[b];
        A.x = 180; A.y = 150;
        B.x = A.x + BlobFS.radiusOf(a) + BlobFS.radiusOf(b) + gap;
        B.y = A.y;
      };
      place();
      if (window.__pin) clearInterval(window.__pin);
      window.__pin = setInterval(place, 16);
    }, { gap: 12 });
    await page.waitForTimeout(450);
    const noTag = await page.evaluate(() => {
      const a = BlobFS.byName('song1'), b = BlobFS.byName('photo1');
      return { pending: BlobFS.pending().filter(p => p.a === a || p.b === a || p.a === b || p.b === b).length,
               parent: BlobFS.blobs[a].parent || BlobFS.blobs[b].parent, merges: BlobFS.events.filter(e => e.type === 'merge').length };
    });
    check('no shared tag, held in contact: physics proposes nothing and merges nothing', noTag.pending === 0 && !noTag.parent && noTag.merges === 0, noTag);
    await page.evaluate(() => { BlobFS.tag(BlobFS.byName('song1'), 'pair'); BlobFS.tag(BlobFS.byName('photo1'), 'pair'); });
    await page.waitForTimeout(450);
    const proposed = await page.evaluate(() => {
      const a = BlobFS.byName('song1'), b = BlobFS.byName('photo1');
      const p = BlobFS.pending().filter(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      const marked = [a, b].every(id => document.querySelector('.orb[data-id="' + id + '"]').classList.contains('pending'));
      return { n: p.length, source: p[0] && p[0].source, cross: p[0] && p[0].crossKind, shared: p[0] && p[0].shared,
               parent: BlobFS.blobs[a].parent || BlobFS.blobs[b].parent, merges: BlobFS.events.filter(e => e.type === 'merge').length, marked };
    });
    check('a shared tag held in contact becomes a physics suggestion and is not committed', proposed.n === 1 && proposed.source === 'physics' &&
      proposed.cross === true && proposed.shared.indexOf('pair') !== -1 && !proposed.parent && proposed.merges === 0 && proposed.marked, proposed);
    const refuseReply = await cmd(page, 'refuse song1');
    await page.waitForTimeout(300);
    const refused = await page.evaluate(() => {
      const a = BlobFS.byName('song1'), b = BlobFS.byName('photo1');
      const ev = BlobFS.events.filter(e => e.type === 'refuse');
      return { parent: BlobFS.blobs[a].parent || BlobFS.blobs[b].parent, gone: BlobFS.blobs[a].gone || BlobFS.blobs[b].gone,
               pending: BlobFS.pending().filter(p => p.a === a || p.b === a || p.a === b || p.b === b).length,
               refuses: ev.length, text: ev[0] && ev[0].text, sizes: [BlobFS.blobs[a].size, BlobFS.blobs[b].size] };
    });
    check('refusing the suggestion leaves both blobs whole and records the refusal', /Kept ".+" and ".+" apart \(refusal recorded\)/.test(refuseReply) &&
      /song1/.test(refuseReply) && /photo1/.test(refuseReply) &&
      !refused.parent && !refused.gone && refused.pending === 0 && refused.refuses === 1 && /kept apart/.test(refused.text) &&
      refused.sizes[0] === 800000 && refused.sizes[1] === 2700000, refused);
    await page.evaluate(() => { if (window.__pin) clearInterval(window.__pin); });
    await page.close();

    // ---- drag and drop is the human commit path ----
    page = await fresh();
    await page.evaluate(() => {
      BlobFS.topLevel().forEach((id, i) => {
        const b = BlobFS.blobs[id];
        b.x = 90 + (i % 4) * 200; b.y = 130 + Math.floor(i / 4) * 240; b.vx = b.vy = 0;
      });
    });
    await page.waitForTimeout(80);
    const dragOnto = async (fromId, toId) => {
      const box = async (id) => page.locator('.orb[data-id="' + id + '"]').boundingBox();
      const a = await box(fromId), b = await box(toId);
      if (!a || !b) return '';
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
      const cls = await page.locator('.orb[data-id="' + toId + '"]').getAttribute('class');
      await page.mouse.up();
      await page.waitForTimeout(60);
      return cls || '';
    };
    const photo1 = await id(page, 'photo1'), photo2 = await id(page, 'photo2');
    const sameCls = await dragOnto(photo1, photo2);
    const sameDrop = await page.evaluate(() => {
      const a = BlobFS.byName('photo1'), b = BlobFS.byName('photo2');
      const p = a && BlobFS.blobs[a].parent;
      const ev = BlobFS.events.filter(e => e.type === 'merge').pop();
      return { same: !!(p && b && p === BlobFS.blobs[b].parent), by: ev && ev.confirmedBy, status: document.getElementById('status').textContent };
    });
    check('dropping a file on a same-kind file merges, and the commit is the human drop', /drop-ok/.test(sameCls) && sameDrop.same &&
      sameDrop.by === 'human-drop' && /Merged \(same kind\)/.test(sameDrop.status), { sameCls, sameDrop });
    const songId = await id(page, 'song1'), stemsId = await id(page, 'stems.zip');
    const noCls = await dragOnto(songId, stemsId);
    const noDrop = await page.evaluate(() => ({ parent: BlobFS.blobs[BlobFS.byName('song1')].parent, pending: BlobFS.pending().length,
      status: document.getElementById('status').textContent }));
    check('dropping across kinds with no shared tag shows a refusal outline and does not merge', /drop-no/.test(noCls) && !/drop-ask/.test(noCls) &&
      noDrop.parent === null && noDrop.pending === 0 && /bounced apart/.test(noDrop.status), { noCls, noDrop });
    await cmd(page, 'tag song1 with stems');
    const askCls = await dragOnto(songId, stemsId);
    const askDrop = await page.evaluate(() => {
      const p = BlobFS.pending();
      return { parent: BlobFS.blobs[BlobFS.byName('song1')].parent, n: p.length, source: p[0] && p[0].source, cross: p[0] && p[0].crossKind,
               status: document.getElementById('status').textContent };
    });
    check('dropping across kinds with a shared tag asks and does not commit', /drop-ask/.test(askCls) && askDrop.parent === null && askDrop.n === 1 &&
      askDrop.source === 'drop' && askDrop.cross === true && /confirm/.test(askDrop.status), { askCls, askDrop });
    await page.close();

    // ---- hash, CRC, and DEFLATE ----
    page = await fresh();
    const deflateReply = await open(page, path.join(fixDir, 'deflate.orb'));
    const deflateBody = await page.evaluate(async () => {
      const b = BlobFS.blobs[BlobFS.byName('deflated.bin')];
      const u8 = new Uint8Array(await b.file.arrayBuffer());
      let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return { size: b.size, text: s, placeholder: !!b.placeholder };
    });
    check('a DEFLATE .orb opens and the payload bytes match', /all SHA-256 hashes verified/.test(deflateReply) && deflateBody.text === 'deflate-payload-xyz' &&
      deflateBody.size === 'deflate-payload-xyz'.length && deflateBody.placeholder === false, { deflateReply, deflateBody });
    const hashReply = await open(page, path.join(fixDir, 'hashbad.orb'));
    check('a flipped payload whose zip CRC was recomputed is refused as a hash mismatch', /^Could not open hashbad\.orb: hash mismatch/.test(hashReply), hashReply);
    const crcReply = await open(page, path.join(fixDir, 'crcbad.orb'));
    check('a payload whose CRC header was flipped is refused as a CRC mismatch', /^Could not open crcbad\.orb: CRC mismatch/.test(crcReply), crcReply);
    await page.close();

    // ---- spoken commands: a fake Web Speech API, installed before the page loads, delivers results ----
    // The script is per page, so the microphone check above still sees the real API (or its absence).
    const voicePage = async (cfg) => {
      const vp = await ctx.newPage();
      vp.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text()));
      vp.on('pageerror', e => pageErrors.push(String(e)));
      await vp.addInitScript(speech => {
        window.__speechTranscript = speech.transcript || '';
        window.__speechError = speech.error || '';
        function FakeSpeechRecognition() {}
        FakeSpeechRecognition.prototype.start = function () {
          var self = this;
          setTimeout(function () {
            if (window.__speechError) {
              if (typeof self.onerror === 'function') self.onerror({ error: window.__speechError });
            } else if (typeof self.onresult === 'function') {
              self.onresult({ results: [[{ transcript: window.__speechTranscript }]] });
            }
            if (typeof self.onend === 'function') self.onend();
          }, 30);
        };
        FakeSpeechRecognition.prototype.stop = function () { if (typeof this.onend === 'function') this.onend(); };
        FakeSpeechRecognition.prototype.abort = function () {};
        window.SpeechRecognition = FakeSpeechRecognition;
        window.webkitSpeechRecognition = FakeSpeechRecognition;
      }, cfg);
      await vp.goto(PAGE);
      await vp.waitForFunction(() => window.BlobFS && /ready/.test(document.querySelector('#status').textContent));
      return vp;
    };
    page = await voicePage({ transcript: 'open notes' });
    check('the microphone button is enabled when a speech recognizer is present', await page.evaluate(() => {
      const btn = document.getElementById('btnMic');
      return !btn.disabled && /Speak a command/.test(btn.title);
    }));
    await page.click('#btnMic');
    await page.waitForFunction(() => /Opened "notes"/.test(document.querySelector('#reply').textContent), null, { timeout: 5000 });
    const spokenOpen = await page.evaluate(() => {
      const ev = BlobFS.events.filter(e => e.type === 'open');
      return { cmd: document.getElementById('cmd').value, reply: document.getElementById('reply').textContent,
               listening: document.getElementById('btnMic').classList.contains('listening'),
               ev: ev.map(e => ({ text: e.text, via: e.via, local: e.local, id: e.id })) };
    });
    check('a spoken "open notes" is handled as a voice command and logged',
      spokenOpen.cmd === 'open notes' && /Opened "notes" \(text,/.test(spokenOpen.reply) && spokenOpen.listening === false &&
      spokenOpen.ev.length === 1 && spokenOpen.ev[0].text === 'open "notes" (voice)' && spokenOpen.ev[0].via === 'voice' && spokenOpen.ev[0].local === true,
      spokenOpen);
    await page.evaluate(() => { window.__speechTranscript = 'new folder Spoken'; window.__speechError = ''; });
    await page.click('#btnMic');
    await page.waitForFunction(() => /Created folder "Spoken"/.test(document.querySelector('#reply').textContent), null, { timeout: 5000 });
    const spokenFolder = await page.evaluate(() => {
      const id = BlobFS.byName('Spoken');
      return { cmd: document.getElementById('cmd').value, reply: document.getElementById('reply').textContent,
               id: id, type: id && BlobFS.blobs[id].type, top: BlobFS.topLevel().includes(id) };
    });
    check('a spoken "new folder Spoken" creates that folder',
      spokenFolder.cmd === 'new folder Spoken' && /Created folder "Spoken"/.test(spokenFolder.reply) &&
      spokenFolder.type === 'dir' && spokenFolder.top === true, spokenFolder);
    await page.close();
    page = await voicePage({ error: 'not-allowed' });
    const orbsBeforeDeny = await page.evaluate(() => BlobFS.topLevel().length);
    await page.click('#btnMic');
    await page.waitForFunction(() => /microphone permission was denied/.test(document.querySelector('#reply').textContent), null, { timeout: 5000 });
    const denied = await page.evaluate(() => ({
      reply: document.getElementById('reply').textContent,
      cmd: document.getElementById('cmd').value,
      top: BlobFS.topLevel().length,
      opens: BlobFS.events.filter(e => e.type === 'open').length
    }));
    check('a spoken-command permission error is reported and adds nothing',
      /Voice: microphone permission was denied/.test(denied.reply) && denied.cmd === '' &&
      denied.top === orbsBeforeDeny && denied.opens === 0, denied);
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
