// Drive blobfs-2d.html headless (Playwright) for the cross-language tests.
// usage: node tests/page_orb.js <chromium|firefox> <in.orb|-> <out.json> [--save out.orb] [--cmd "text"]... [--drop file]...
// Opens <in.orb> with the page's own "Open .orb" button and loader, reports what the page loaded
// (records, object hashes, per-blob payload hashes recomputed in the page, links, undo depth, pending),
// runs commands, optionally drops files onto the stage, and optionally saves with the page's own writer.
// Needs node and the playwright package (with chromium/firefox installed); set NODE_PATH if it lives elsewhere.
const path = require('path'), fs = require('fs');
const pw = require('playwright');
const [bname, inOrb, outJson, ...rest] = process.argv.slice(2);
const opts = { save: null, cmds: [], drops: [] };
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === '--save') opts.save = rest[i + 1];
  else if (rest[i] === '--cmd') opts.cmds.push(rest[i + 1]);
  else if (rest[i] === '--drop') opts.drops.push(rest[i + 1]);
}
const PAGE = 'file://' + path.resolve(__dirname, '..', 'blobfs-2d.html');
async function state(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const id of Object.keys(BlobFS.blobs)) {
      const b = BlobFS.blobs[id];
      let hash = null;
      if (b.type === 'file' && b.file) hash = await BlobFS.sha256(new Uint8Array(await b.file.arrayBuffer()));
      out.push({ id, type: b.type, name: b.name, kind: BlobFS.kindOf(id), size: b.size, mass: BlobFS.massOf(id), parent: b.parent,
                 children: b.children.slice(), gone: !!b.gone, hash, placeholder: !!b.placeholder });
    }
    return { blobs: out, topLevel: BlobFS.topLevel(), undoDepth: BlobFS.undoDepth(), events: BlobFS.events.length,
             pending: BlobFS.pending().map(p => ({ key: p.key, a: p.a, b: p.b, source: p.source, shared: p.shared, crossKind: p.crossKind })),
             lastLoad: BlobFS.lastLoad() };
  });
}
(async () => {
  const browser = await pw[bname].launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => consoleMsgs.push('pageerror: ' + e));
  await page.goto(PAGE); await page.waitForTimeout(500);
  const res = { browser: bname, replies: [] };
  if (inOrb !== '-') {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpenOrb')]);
    await fc.setFiles(path.resolve(inOrb));
    await page.waitForFunction(() => /^(Opened|Could not open)/.test(document.querySelector('#reply').textContent), null, { timeout: 15000 });
    res.openReply = await page.textContent('#reply');
  }
  res.loaded = await state(page);
  for (const f of opts.drops) {
    const b64 = fs.readFileSync(f).toString('base64');
    await page.evaluate(({ b64, name }) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([u8], name));
      const st = document.getElementById('stage');
      st.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { b64, name: path.basename(f) });
    await page.waitForTimeout(150);
    res.replies.push(['drop ' + path.basename(f), await page.textContent('#reply')]);
  }
  for (const c of opts.cmds) {
    await page.fill('#cmd', c); await page.press('#cmd', 'Enter'); await page.waitForTimeout(150);
    res.replies.push([c, await page.textContent('#reply')]);
  }
  res.after = await state(page);
  if (opts.save) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    await dl.saveAs(path.resolve(opts.save));
    await page.waitForTimeout(200);
    res.saveName = dl.suggestedFilename(); res.saveReply = await page.textContent('#reply');
  }
  res.console = consoleMsgs;
  fs.writeFileSync(outJson, JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
