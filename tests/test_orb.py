"""Pure-Python checks for the BlobFS rules the paper says the suite covers.

Run from the repo root:  python -m unittest -v tests.test_orb
Uses only the standard library and orb.py. No browser.
"""
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import orb  # noqa: E402

DEMO = os.path.join(ROOT, "demo.orb")
MB_27 = 2_700_000
MB_08 = 800_000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rewrite(src, dst, mut):
    """Copy a zip, replacing each entry's bytes with mut(name, data). CRC is recomputed."""
    with zipfile.ZipFile(src) as z, zipfile.ZipFile(dst, "w") as w:
        for name in z.namelist():
            w.writestr(name, mut(name, z.read(name)))


def patch_object_crc(src, dst):
    """Flip the CRC of the first objects/ entry in both zip headers, leaving the bytes alone."""
    with zipfile.ZipFile(src) as z:
        name = next(n for n in z.namelist() if n.startswith("objects/"))
        local = z.getinfo(name).header_offset + 14
    with open(src, "rb") as f:
        raw = bytearray(f.read())
    name_b = name.encode("utf-8")
    start, central = 0, None
    while True:
        i = raw.find(b"PK\x01\x02", start)
        if i < 0:
            break
        nl = int.from_bytes(raw[i + 28:i + 30], "little")
        if raw[i + 46:i + 46 + nl] == name_b:
            central = i + 16
            break
        start = i + 4
    if central is None:
        raise AssertionError("central-directory entry for %s not found" % name)
    raw[local] ^= 0xFF
    raw[central] ^= 0xFF
    with open(dst, "wb") as f:
        f.write(raw)


class OrbRules(unittest.TestCase):
    def test_demo_shape_matches_paper(self):
        d = orb.load(DEMO)
        files = [i for i, b in d.blobs.items() if b["type"] == "file"]
        self.assertEqual(len(files), 22)
        self.assertEqual(len(d.objects), 20)
        self.assertEqual(len({b["hash"] for b in d.blobs.values() if b["type"] == "file"}), 20)
        self.assertEqual(sum(len(v) for v in d.children.values()), 13)
        self.assertEqual(d.record_count, 101)
        self.assertEqual(d.header.get("constantMass"), orb.C)

    def test_split_sizes_from_the_paper(self):
        """A 2,700,000-byte file and an 800,000-byte file. Parent loses the child's mass, not half the payloads."""
        d = orb.Disk()
        big = d.add_file("big.bin", b"\0" * MB_27)
        small = d.add_file("small.bin", b"\1" * MB_08)
        result = d.merge(big, small)
        merged = d.mass(result)
        child = d.mass(small)
        self.assertEqual(child, MB_08 + orb.C)
        d.split(small)
        moved = merged - d.mass(result)
        self.assertEqual(moved, child)
        self.assertEqual(d.mass(result) + d.mass(small), merged)
        self.assertIsNone(d.parent[small])
        self.assertEqual(d.blobs[small]["size"], MB_08)
        self.assertEqual(d.blobs[big]["size"], MB_27)
        half = (MB_27 + MB_08) // 2
        self.assertEqual(half, 1_750_000)
        self.assertNotEqual(moved, half)
        self.assertNotEqual(d.blobs[small]["size"], half)
        d.verify()

    def test_dedup_three_files_two_payloads(self):
        d = orb.Disk()
        body = b"same-payload"
        a = d.add_file("a.txt", body)
        b = d.add_file("b.txt", body)
        c = d.add_file("c.txt", b"other-payload")
        self.assertEqual(d.blobs[a]["hash"], d.blobs[b]["hash"])
        self.assertNotEqual(d.blobs[a]["hash"], d.blobs[c]["hash"])
        self.assertEqual(len(d.objects), 2)
        with tempfile.TemporaryDirectory() as t:
            path = os.path.join(t, "dedup.orb")
            orb.save(d, path)
            back = orb.load(path)
            names = {x["name"]: x for x in back.blobs.values()}
            self.assertEqual(len(back.objects), 2)
            self.assertEqual(back.payload(back.by_name("a.txt")), body)
            self.assertEqual(back.payload(back.by_name("b.txt")), body)
            self.assertEqual(names["a.txt"]["hash"], names["b.txt"]["hash"])
            with zipfile.ZipFile(path) as z:
                self.assertEqual(len([n for n in z.namelist() if n.startswith("objects/")]), 2)

    def test_notes_txt_collision_keeps_both_payloads(self):
        d = orb.Disk()
        a = d.add_file("notes.txt", b"first")
        b = d.add_file("notes.txt", b"second")
        result = d.merge(a, b)
        names = sorted(d.blobs[c]["name"] for c in d.children[result])
        self.assertEqual(names, ["notes (2).txt", "notes.txt"])
        payloads = {d.blobs[c]["name"]: d.payload(c) for c in d.children[result]}
        self.assertEqual(payloads["notes.txt"], b"second")  # b is attached first and keeps the name
        self.assertEqual(payloads["notes (2).txt"], b"first")
        self.assertNotEqual(d.blobs[a]["hash"], d.blobs[b]["hash"])
        d.verify()

    def test_dir_merge_keeps_suborb(self):
        d = orb.Disk()
        outer = d.add_dir("Outer")
        inner = d.add_dir("Inner", parent=outer)
        deep = d.add_file("deep.txt", b"deep-bytes", parent=inner)
        side = d.add_dir("Side")
        d.add_file("side.txt", b"side", parent=side)
        result = d.merge(outer, side)
        self.assertIn(inner, d.children[result])
        self.assertEqual(d.children[inner], [deep])
        self.assertNotIn(deep, d.children[result])
        self.assertEqual(d.blobs[inner]["type"], "dir")
        self.assertTrue(d.blobs[outer]["gone"] and d.blobs[side]["gone"])
        self.assertEqual(d.payload(deep), b"deep-bytes")
        d.verify()

    def test_roundtrip_bytes_ids_and_tree(self):
        d = orb.Disk()
        root = d.add_dir("Root")
        sub = d.add_dir("Sub", parent=root)
        blobs = {
            d.add_file("a.bin", b"alpha", parent=root): b"alpha",
            d.add_file("b.bin", b"beta" * 100, parent=sub): b"beta" * 100,
        }
        before = self._tree(d)
        with tempfile.TemporaryDirectory() as t:
            path = os.path.join(t, "round.orb")
            orb.save(d, path)
            back = orb.load(path)
            self.assertEqual(self._tree(back), before)
            self.assertEqual(set(back.blobs), set(d.blobs))
            for i, body in blobs.items():
                self.assertEqual(back.payload(i), body)
                self.assertEqual(sha(back.payload(i)), back.blobs[i]["hash"])

    def test_hash_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "bad.orb")
            d = orb.Disk()
            d.add_file("hello.bin", b"hello-blobfs")
            orb.save(d, src)
            flipped = {"done": False}

            def mut(name, data):
                if name.startswith("objects/") and not flipped["done"] and data:
                    flipped["done"] = True
                    return bytes([data[0] ^ 1]) + data[1:]
                return data

            rewrite(src, bad, mut)
            with self.assertRaisesRegex(orb.OrbError, "hash mismatch"):
                orb.load(bad)

    def test_crc_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "crc.orb")
            d = orb.Disk()
            d.add_file("hello.bin", b"hello-blobfs")
            orb.save(d, src)
            patch_object_crc(src, bad)
            with self.assertRaisesRegex(orb.OrbError, "CRC mismatch"):
                orb.load(bad)

    def test_constant_mass_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "mass.orb")
            d = orb.Disk()
            d.add_file("a.txt", b"a")
            orb.save(d, src)

            def mut(name, data):
                if name == "records.jsonl":
                    text = data.decode("utf-8").replace('"constantMass":1048576', '"constantMass":1', 1)
                    self.assertNotEqual(text, data.decode("utf-8"))
                    return text.encode("utf-8")
                return data

            rewrite(src, bad, mut)
            with self.assertRaisesRegex(orb.OrbError, "constantMass"):
                orb.load(bad)

    def test_bad_magic_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "magic.orb")
            orb.save(orb.Disk(), src)
            rewrite(src, bad, lambda name, data: b"NOT-BLOBFS\n" if name == "MAGIC" else data)
            with self.assertRaisesRegex(orb.OrbError, "bad MAGIC"):
                orb.load(bad)

    def test_unknown_record_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "unk.orb")
            orb.save(orb.Disk(), src)

            def mut(name, data):
                if name == "records.jsonl":
                    return data + b'{"t":"widget"}\n'
                return data

            rewrite(src, bad, mut)
            with self.assertRaisesRegex(orb.OrbError, "unknown record type"):
                orb.load(bad)

    def test_mass_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as t:
            src, bad = os.path.join(t, "ok.orb"), os.path.join(t, "mm.orb")
            d = orb.Disk()
            d.add_file("a.txt", b"abc")
            orb.save(d, src)
            changed = {"done": False}

            def mut(name, data):
                if name != "records.jsonl":
                    return data
                lines = []
                for line in data.decode("utf-8").splitlines():
                    if '"t":"blob"' in line and not changed["done"]:
                        line = line.replace('"mass":1048579', '"mass":1', 1)
                        changed["done"] = True
                    lines.append(line)
                self.assertTrue(changed["done"])
                return ("\n".join(lines) + "\n").encode("utf-8")

            rewrite(src, bad, mut)
            with self.assertRaisesRegex(orb.OrbError, "mass mismatch"):
                orb.load(bad)

    def test_file_cannot_have_children(self):
        d = orb.Disk()
        a = d.add_file("a.txt", b"a")
        b = d.add_file("b.txt", b"b")
        d.children[a].append(b)
        d.parent[b] = a
        with self.assertRaisesRegex(orb.OrbError, "has children"):
            d.verify()

    def test_physics_cannot_commit(self):
        d = orb.Disk()
        a = d.add_file("a.txt", b"a")
        b = d.add_file("b.txt", b"b")
        with self.assertRaisesRegex(orb.OrbError, "physics may propose, never commit"):
            d.merge(a, b, confirmed_by="physics")
        self.assertIsNone(d.parent[a])
        self.assertIsNone(d.parent[b])
        self.assertFalse(any(e.get("type") == "merge" for e in d.events))

    def test_file_merge_does_not_concatenate_payloads(self):
        d = orb.Disk()
        a = d.add_file("a.txt", b"AAAA")
        b = d.add_file("b.txt", b"BBBB")
        result = d.merge(a, b)
        self.assertEqual(d.blobs[result]["type"], "dir")
        self.assertEqual(d.payload(a), b"AAAA")
        self.assertEqual(d.payload(b), b"BBBB")
        self.assertEqual(d.blobs[a]["size"], 4)
        self.assertEqual(d.blobs[b]["size"], 4)
        self.assertNotEqual(d.blobs[a]["hash"], sha(b"AAAABBBB"))

    def test_empty_directory_mass_is_constant(self):
        d = orb.Disk()
        empty = d.add_dir("Empty")
        self.assertEqual(d.content_size(empty), 0)
        self.assertEqual(d.mass(empty), orb.C)
        self.assertEqual(orb.C, 1048576)

    def test_zip32_entry_count(self):
        self.assertGreater(orb.zip32_check([("f%d" % i, 0) for i in range(65535)]), 0)
        with self.assertRaisesRegex(orb.OrbError, "65535"):
            orb.zip32_check([("f%d" % i, 0) for i in range(65536)])

    def test_deflate_archive_loads(self):
        body = b"deflate-payload-xyz"
        with tempfile.TemporaryDirectory() as t:
            stored, packed = os.path.join(t, "stored.orb"), os.path.join(t, "deflate.orb")
            d = orb.Disk()
            d.add_file("deflated.bin", body)
            orb.save(d, stored)
            with zipfile.ZipFile(stored) as z, zipfile.ZipFile(packed, "w", compression=zipfile.ZIP_DEFLATED) as w:
                for name in z.namelist():
                    w.writestr(name, z.read(name))
            with zipfile.ZipFile(packed) as z:
                info = z.getinfo("objects/" + sha(body))
                self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED)
            back = orb.load(packed)
            self.assertEqual(back.payload(back.by_name("deflated.bin")), body)

    def test_merge_and_split_are_recorded(self):
        d = orb.Disk()
        a = d.add_file("a.txt", b"a")
        b = d.add_file("b.txt", b"bb")
        result = d.merge(a, b)
        merges = [e for e in d.events if e.get("type") == "merge"]
        self.assertEqual(len(merges), 1)
        self.assertEqual(merges[0]["rule"], "file+file")
        self.assertEqual(merges[0]["confirmedBy"], "human-api")
        rec = next(r for r in d.records() if r["t"] == "merge")
        self.assertEqual(rec["result"], result)
        self.assertIn("merged", rec["detail"])
        d.split(a)
        splits = [e for e in d.events if e.get("type") == "split"]
        self.assertEqual(len(splits), 1)
        self.assertEqual(splits[0]["child"], a)
        self.assertTrue(any(e.get("type") == "merge" for e in d.events))

    def test_cli_usage_and_missing_file(self):
        orb_py = os.path.join(ROOT, "orb.py")
        usage = subprocess.run([sys.executable, orb_py], capture_output=True, text=True)
        self.assertEqual(usage.returncode, 2)
        self.assertIn("usage:", usage.stderr)
        missing = subprocess.run([sys.executable, orb_py, "verify", os.path.join(ROOT, "no-such.orb")],
                                 capture_output=True, text=True)
        self.assertEqual(missing.returncode, 1)
        self.assertIn("FAIL:", missing.stdout)

    def _tree(self, disk):
        def walk(i):
            b = disk.blobs[i]
            return (i, b["name"], b["type"], tuple(walk(c) for c in disk.children[i]))
        return tuple(walk(i) for i in disk.top_level())


if __name__ == "__main__":
    unittest.main()
