"""Tests for orb.py and for agreement between orb.py and the page's own loader/writer.

Run from the repo root:   python -m unittest -v tests.test_crosslang
Pure-Python tests need only the standard library. The cross-language tests drive blobfs-2d.html headless
through tests/page_orb.js, so they need `node` plus the `playwright` package with Chromium and Firefox
installed (set NODE_PATH if playwright lives outside the repo). They are skipped, not faked, when those are missing.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile, unittest, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
import orb  # noqa: E402

DEMO = os.path.join(ROOT, "demo.orb")
HELPER = os.path.join(ROOT, "tests", "page_orb.js")
BROWSERS = ("chromium", "firefox")
STATS = {"blob_hashes": 0, "object_hashes": 0, "links": 0, "page_runs": 0}


def have_playwright():
    if not shutil.which("node"):
        return False
    r = subprocess.run(["node", "-e", "require('playwright')"], capture_output=True)
    return r.returncode == 0


PW = have_playwright()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def records_of(path):
    with zipfile.ZipFile(path) as z:
        return [json.loads(l) for l in z.read("records.jsonl").decode("utf-8").splitlines() if l.strip()]


def run_page(browser, orb_path, cmds=(), save=None, drops=()):
    tmp = tempfile.mkdtemp()
    out = os.path.join(tmp, "out.json")
    args = ["node", HELPER, browser, orb_path or "-", out]
    for c in cmds:
        args += ["--cmd", c]
    for d in drops:
        args += ["--drop", d]
    if save:
        args += ["--save", save]
    r = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise AssertionError("page helper failed: " + r.stderr[-2000:])
    STATS["page_runs"] += 1
    with open(out) as f:
        return json.load(f)


class PurePython(unittest.TestCase):
    def test_demo_verifies(self):
        d = orb.load(DEMO)
        self.assertEqual(d.record_count, len(records_of(DEMO)))
        self.assertGreater(len(d.objects), 0)
        for h, data in d.objects.items():
            self.assertEqual(sha(data), h)

    def test_load_save_records_identical(self):
        d = orb.load(DEMO)
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "re.orb")
            orb.save(d, p)
            a, b = records_of(DEMO), records_of(p)
            self.assertEqual(a[1:], b[1:])                     # only header (savedAt/writer) differs
            with zipfile.ZipFile(DEMO) as za, zipfile.ZipFile(p) as zb:
                self.assertEqual(sorted(za.namelist()), sorted(zb.namelist()))
                self.assertEqual(zb.read("MAGIC"), orb.MAGIC.encode() if isinstance(orb.MAGIC, str) else orb.MAGIC)
                for n in za.namelist():
                    if n.startswith("objects/"):
                        self.assertEqual(za.read(n), zb.read(n))

    def test_tamper_refused(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "bad.orb")
            flipped = False
            with zipfile.ZipFile(DEMO) as z, zipfile.ZipFile(p, "w") as w:
                for n in z.namelist():
                    data = z.read(n)
                    if n.startswith("objects/") and not flipped:      # flip one bit in one payload
                        data, flipped = bytes([data[0] ^ 1]) + data[1:], True
                    w.writestr(n, data)
            with self.assertRaisesRegex(orb.OrbError, "hash mismatch"):
                orb.load(p)

    def test_dangling_link_refused(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "dangle.orb")
            with zipfile.ZipFile(DEMO) as z, zipfile.ZipFile(p, "w") as w:
                for n in z.namelist():
                    data = z.read(n)
                    if n == "records.jsonl":
                        data += b'{"t":"link","parent":"b1","child":"b999","index":0}\n'
                    w.writestr(n, data)
            with self.assertRaisesRegex(orb.OrbError, "dangling"):
                orb.load(p)

    def test_merge_dir_dir_clash(self):
        d = orb.Disk()
        x, y = d.add_dir("X"), d.add_dir("Y")
        d.add_file("a.txt", b"one", parent=x)
        d.add_file("a.txt", b"two", parent=y)
        sub = d.add_dir("sub", parent=y)
        d.add_file("deep.txt", b"deep", parent=sub)
        before = d.mass(x) + d.mass(y)
        r = d.merge(x, y)
        names = sorted(d.blobs[c]["name"] for c in d.children[r])
        self.assertEqual(names, ["a (2).txt", "a.txt", "sub"])
        self.assertEqual(len(d.children[sub]), 1)            # sub-folder kept whole
        self.assertEqual(d.mass(r), before - 2 * orb.C + orb.C)  # two dir shells become one
        self.assertTrue(d.blobs[x]["gone"] and d.blobs[y]["gone"])
        d.verify()

    def test_merge_file_file_and_file_dir(self):
        d = orb.Disk()
        f1, f2 = d.add_file("p1.jpg", b"1" * 10), d.add_file("p2.jpg", b"2" * 20)
        r = d.merge(f1, f2)
        self.assertEqual(d.blobs[r]["type"], "dir")
        self.assertEqual(d.mass(r), orb.C + (10 + orb.C) + (20 + orb.C))
        f3 = d.add_file("p3.jpg", b"3")
        self.assertEqual(d.merge(f3, r), r)                   # the directory adopts the file
        self.assertEqual(len(d.children[r]), 3)
        with self.assertRaises(orb.OrbError):
            d.merge(d.add_file("q", b"q"), d.add_file("w", b"w"), confirmed_by="physics")

    def test_split_exact_mass(self):
        d = orb.Disk()
        x = d.add_dir("X")
        c = d.add_file("big.bin", b"\0" * 12345, parent=x)
        before = d.mass(x)
        d.split(c)
        self.assertEqual(before - d.mass(x), 12345 + orb.C)
        self.assertIsNone(d.parent[c])

    def test_zip32_limits(self):
        orb.zip32_check([("a", 10)])
        with self.assertRaises(orb.OrbError):
            orb.zip32_check([("huge.bin", 4 * 1024 ** 3)])
        with self.assertRaises(orb.OrbError):
            orb.zip32_check([("a", 3 * 1024 ** 3), ("b", 2 * 1024 ** 3)])

    def test_cli(self):
        for cmd in ("verify", "info"):
            r = subprocess.run([sys.executable, os.path.join(ROOT, "orb.py"), cmd, DEMO], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("OK", subprocess.run([sys.executable, os.path.join(ROOT, "orb.py"), "verify", DEMO],
                                           capture_output=True, text=True).stdout)


@unittest.skipUnless(PW, "node + playwright not available")
class CrossLanguage(unittest.TestCase):
    def compare_load(self, path, res):
        """Every object hash, every blob hash (recomputed from bytes on both sides), the link set, record count."""
        d = orb.load(path)
        L = res["loaded"]["lastLoad"]
        self.assertTrue(res["openReply"].startswith("Opened"), res["openReply"])
        self.assertEqual(L["records"], d.record_count)
        self.assertEqual(L["objects"], sorted(d.objects))
        STATS["object_hashes"] += len(L["objects"])
        py_blob_hashes = [[i, b["hash"]] for i, b in d.blobs.items() if b["type"] == "file"]
        self.assertEqual(L["blobHashes"], py_blob_hashes)
        page_blobs = {b["id"]: b for b in res["loaded"]["blobs"]}
        for i, h in py_blob_hashes:
            self.assertEqual(page_blobs[i]["hash"], h, i)           # page re-hashed the bytes it would use
            self.assertEqual(sha(d.payload(i)), h, i)              # python re-hashed the same bytes
        STATS["blob_hashes"] += len(py_blob_hashes)
        py_links = sorted([p, c, k] for p in d.children for k, c in enumerate(d.children[p]))
        self.assertEqual(sorted(L["links"]), py_links)
        STATS["links"] += len(py_links)
        for i, b in d.blobs.items():
            pb = page_blobs[i]
            self.assertEqual((pb["name"], pb["type"], pb["parent"], pb["children"], pb["gone"], pb["mass"]),
                             (b["name"], b["type"], d.parent[i], d.children[i], bool(b.get("gone")), d.mass(i)), i)
        self.assertEqual(res["loaded"]["undoDepth"], len(d.undo))
        self.assertEqual([p["key"] for p in res["loaded"]["pending"]], [p["key"] for p in d.pending])
        self.assertEqual(res["console"], [])
        return d

    def test_page_opens_demo(self):
        for br in BROWSERS:
            with self.subTest(browser=br):
                self.compare_load(DEMO, run_page(br, DEMO))

    def test_python_write_page_open_and_back(self):
        d = orb.load(DEMO)
        a, b = d.add_dir("Py A"), d.add_dir("Py B")
        real = os.urandom(70001)
        d.add_file("dup.txt", b"x", parent=a)
        d.add_file("dup.txt", b"y", parent=b)
        d.add_file("random.bin", real, parent=b)
        r = d.merge(a, b)
        with tempfile.TemporaryDirectory() as t:
            src = os.path.join(t, "py.orb")
            orb.save(d, src)
            for br in BROWSERS:
                with self.subTest(browser=br):
                    out = os.path.join(t, br + "-undo.orb")
                    res = run_page(br, src, cmds=["undo"], save=out)
                    self.compare_load(src, res)
                    after = {x["id"]: x for x in res["after"]["blobs"]}
                    self.assertTrue(after[r]["gone"])                         # undo removed the merged dir
                    self.assertFalse(after[a]["gone"] or after[b]["gone"])    # ...and restored both
                    self.assertEqual(sorted(after[a]["children"] + after[b]["children"]), sorted(d.children[r]))
                    back = orb.load(out)                                      # page-written file verifies in python
                    self.assertEqual(len(back.undo), len(d.undo) - 1)
                    rid = [i for i, x in back.blobs.items() if x["name"] == "random.bin"][0]
                    self.assertEqual(back.payload(rid), real)                 # byte-exact
                    self.assertEqual(back.blobs[rid]["payload"], "bytes")

    def test_page_write_python_open(self):
        with tempfile.TemporaryDirectory() as t:
            drop = os.path.join(t, "dropped.bin")
            data = os.urandom(50000)
            with open(drop, "wb") as f:
                f.write(data)
            for br in BROWSERS:
                with self.subTest(browser=br):
                    out = os.path.join(t, br + ".orb")
                    res = run_page(br, DEMO, drops=[drop], cmds=["merge Covers and Sessions + Masters", "tag cover1 with zz"], save=out)
                    d = self.compare_load(out, run_page(br, out))
                    page = {x["id"]: x for x in res["after"]["blobs"]}
                    self.assertEqual({i: (x["name"], x["parent"], x["children"], x["hash"], x["gone"]) for i, x in page.items()},
                                     {i: (b["name"], d.parent[i], d.children[i], b.get("hash") if b["type"] == "file" else None, bool(b.get("gone")))
                                      for i, b in d.blobs.items()})
                    self.assertEqual(res["after"]["undoDepth"], len(d.undo))
                    self.assertEqual([p["key"] for p in res["after"]["pending"]], [p["key"] for p in d.pending])
                    did = [i for i, b in d.blobs.items() if b["name"] == "dropped.bin"][0]
                    self.assertEqual(sha(d.payload(did)), sha(data))
                    self.assertEqual(d.blobs[did]["payload"], "bytes")
                    recs = records_of(out)
                    types = {r["t"] for r in recs}
                    self.assertTrue({"header", "blob", "link", "merge", "position", "refused", "event", "undo", "pending"} <= types, types)
                    self.assertEqual(sum(1 for r in recs if r["t"] == "undo"), len(d.undo))


def tearDownModule():
    sys.stderr.write("\ncrosslang stats: %s\n" % json.dumps(STATS))


if __name__ == "__main__":
    unittest.main()
