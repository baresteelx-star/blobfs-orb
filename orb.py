#!/usr/bin/env python3
"""orb.py: stdlib-only Python reference for the BlobFS .orb format, as shipped by blobfs-2d.html.

An .orb is a zip archive with exactly these entries:

  MAGIC                 b"BLOBFS-ORB\\n1\\n"
  records.jsonl         one JSON object per line; the "t" field names the record type
  objects/<sha256hex>   each payload stored once, named by the SHA-256 of its bytes

Record types, in the order they are written:

  header    {t, format:"blobfs-orb", version:1, constantMass:1048576, savedAt, writer}
  blob      {t, id, type:"file"|"dir", kind, name, size, mass, tags, rings, history, hash,
             payload?:"bytes"|"placeholder", src?, entries?, autoName?, gone?}
            hash is the SHA-256 of the payload (null for directories); mass = size + C;
            a directory's size is the sum of its children's masses
  link      {t, parent, child, index}              child order inside a directory
  merge     {t, time, seq, a, b, result, rule, detail}
  position  {t, id, x, y}                           top-level orbs only; layout is not identity
  refused   {t, key}                                a pair the person kept apart ("b3|b9")
  undo      {t, pos, rec}                           the undo stack, bottom (pos 0) to top
  pending   {t, key, a, b, source, shared, crossKind}   open merge suggestions (never committed)
  event     {t, seq, time, type, text, ...}         the append-only event log

API:  load(path) -> Disk (verified: CRC, every object rehashed, links, masses), save(disk, path),
      Disk.merge(a, b), Disk.split(id), Disk.add_file(name, data), Disk.verify().
CLI:  python orb.py verify demo.orb      python orb.py info demo.orb
"""
import datetime
import hashlib
import json
import re
import sys
import zipfile

C = 1048576                      # constant mass added to every blob (1 MiB), same as BODY in blobfs-2d.html
MAGIC = b"BLOBFS-ORB\n1\n"
FOUR_GIB = 4294967296
ZIP32_MAX = 4294967295
RECORD_TYPES = ("header", "blob", "link", "merge", "position", "refused", "undo", "pending", "event")
EXT_KINDS = {
    "image": ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "tif", "tiff", "avif"],
    "audio": ["mp3", "wav", "ogg", "flac", "m4a", "aac", "aif", "aiff", "opus"],
    "text": ["txt", "md", "json", "csv", "html", "htm", "js", "css", "xml", "yml", "yaml", "py", "tex", "rtf", "log", "ts"],
    "zip": ["zip"],
    "video": ["mp4", "mov", "webm", "mkv", "avi"],
}


class OrbError(Exception):
    """The file is not a valid .orb, or an operation would break the format's rules."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def dumps(rec):
    # same bytes as JavaScript's JSON.stringify for these records
    return json.dumps(rec, ensure_ascii=False, separators=(",", ":"))


def now_iso():
    t = datetime.datetime.now(datetime.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (t.microsecond // 1000)


def fmt_bytes(n):
    if n >= 1e6:
        return "%.2f MB" % (n / 1e6)
    if n >= 1e3:
        return "%.1f KB" % (n / 1e3)
    return "%d B" % n


def kind_from_name(name):
    m = re.search(r"\.([A-Za-z0-9]+)$", name)
    if not m:
        return "other"
    e = m.group(1).lower()
    for k, exts in EXT_KINDS.items():
        if e in exts:
            return k
    return "other"


def pick_name(taken, name):
    """'notes.txt' -> 'notes (2).txt' when taken; never a silent overwrite."""
    if name not in taken:
        return name
    m = re.match(r"^(.*?)(\.[A-Za-z0-9]+)?$", name)
    base, ext = m.group(1), m.group(2) or ""
    i = 2
    while True:
        n = "%s (%d)%s" % (base, i, ext)
        if n not in taken:
            return n
        i += 1


def zip32_check(entries):
    """entries: [(name, size)]. Refuse anything a zip32 archive cannot hold."""
    if len(entries) > 65535:
        raise OrbError("too many entries for a zip32 .orb (%d, limit 65535)" % len(entries))
    total = 22
    for name, size in entries:
        n = len(name.encode("utf-8"))
        if size >= FOUR_GIB:
            raise OrbError('"%s" is %s; a single file must be under 4 GiB (zip32 limit)' % (name, fmt_bytes(size)))
        total += 30 + n + size + 46 + n
    if total > ZIP32_MAX:
        raise OrbError("the .orb would be %s, over the 4 GiB zip32 limit; nothing was saved" % fmt_bytes(total))
    return total


class Disk:
    """In-memory BlobFS disk: blobs, child links, payloads, positions, refusals, undo stack, suggestions, events."""

    def __init__(self):
        self.header = {"t": "header", "format": "blobfs-orb", "version": 1, "constantMass": C}
        self.blobs = {}        # id -> blob record fields (without "t"), in creation order
        self.children = {}     # id -> [child ids] in order
        self.parent = {}       # id -> parent id or None
        self.objects = {}      # sha256 -> bytes
        self.positions = {}    # id -> (x, y)
        self.refused = []      # pair keys
        self.undo = []         # undo records, bottom to top (same shape the page uses)
        self.pending = []      # open suggestions
        self.events = []       # event dicts (without "t")
        self.record_count = 0  # records read by load()

    # ---------- derived values (identical rules to the page) ----------
    def content_size(self, id):
        b = self.blobs[id]
        if b["type"] == "file":
            return b["size"]
        return sum(self.mass(c) for c in self.children[id])

    def mass(self, id):
        return C + self.content_size(id)

    def kind(self, id):
        b = self.blobs[id]
        if b["type"] == "file":
            return b["kind"]
        found = set()

        def walk(x):
            for c in self.children[x]:
                if self.blobs[c]["type"] == "file":
                    found.add(self.blobs[c]["kind"])
                else:
                    walk(c)
        walk(id)
        return "empty" if not found else (found.pop() if len(found) == 1 else "mixed")

    def top_level(self):
        return [i for i in self.blobs if self.parent[i] is None and not self.blobs[i].get("gone")]

    def top_ancestor(self, id):
        while self.parent[id]:
            id = self.parent[id]
        return id

    def payload(self, id):
        return self.objects[self.blobs[id]["hash"]]

    def by_name(self, name):
        for i in self.blobs:
            if self.blobs[i]["name"] == name and not self.blobs[self.top_ancestor(i)].get("gone"):
                return i
        return None

    # ---------- verification ----------
    def verify(self):
        """Raise OrbError on any broken invariant; return a summary dict."""
        if self.header.get("format") != "blobfs-orb":
            raise OrbError("header format is not blobfs-orb")
        if self.header.get("constantMass", C) != C:
            raise OrbError("constantMass %r differs from C=%d" % (self.header.get("constantMass"), C))
        for id, b in self.blobs.items():
            if b["type"] == "file":
                if not b.get("hash") or b["hash"] not in self.objects:
                    raise OrbError('payload missing for "%s" (%s)' % (b["name"], id))
                if b.get("payload") == "bytes" and len(self.objects[b["hash"]]) != b["size"]:
                    raise OrbError('"%s" stores %d bytes but declares size %d' % (b["name"], len(self.objects[b["hash"]]), b["size"]))
                if self.children[id]:
                    raise OrbError('file "%s" has children' % b["name"])
        seen = set()
        for id in self.blobs:              # no cycles
            x, path = id, set()
            while x is not None:
                if x in path:
                    raise OrbError("link cycle through %s" % x)
                path.add(x)
                x = self.parent[x]
            for c in self.children[id]:
                if c in seen:
                    raise OrbError("%s has more than one parent" % c)
                seen.add(c)
        for id, b in self.blobs.items():   # recorded size/mass must follow mass = size + C
            if "mass" in b and (b["mass"] != self.mass(id) or b["size"] != self.content_size(id)):
                raise OrbError('mass mismatch for "%s": recorded %s/%s, computed %s/%s'
                               % (b["name"], b["size"], b["mass"], self.content_size(id), self.mass(id)))
        for p in self.pending:
            if p["a"] not in self.blobs or p["b"] not in self.blobs:
                raise OrbError("pending suggestion names a missing blob")
        files = [i for i in self.blobs if self.blobs[i]["type"] == "file"]
        return {"blobs": len(self.blobs), "files": len(files), "dirs": len(self.blobs) - len(files),
                "objects": len(self.objects), "links": sum(len(v) for v in self.children.values()),
                "top_level": len(self.top_level()), "events": len(self.events), "undo": len(self.undo),
                "pending": len(self.pending), "refused": len(self.refused),
                "real_payloads": sum(1 for i in files if self.blobs[i].get("payload") == "bytes"),
                "placeholders": sum(1 for i in files if self.blobs[i].get("payload") == "placeholder")}

    # ---------- operations (same rules and record shapes as the page) ----------
    def _new_id(self):
        n = max([int(re.sub(r"\D", "", i) or 0) for i in self.blobs] + [0]) + 1
        return "b%d" % n

    def _log(self, type, data, text, ids):
        seq = max([e.get("seq", 0) for e in self.events] + [0]) + 1
        ev = {"seq": seq, "time": now_iso(), "type": type, "text": text}
        ev.update({k: v for k, v in data.items() if v is not None or k in ("parent",)})
        self.events.append(ev)
        for i in ids:
            if i in self.blobs:
                self.blobs[i]["history"].append(seq)
        return ev

    def _make(self, type, name, kind=None, size=0, tags=()):
        id = self._new_id()
        self.blobs[id] = {"id": id, "type": type, "kind": kind if type == "file" else None, "name": name,
                          "size": size if type == "file" else 0, "tags": list(tags), "rings": 0, "history": [], "hash": None}
        self.children[id] = []
        self.parent[id] = None
        return id

    def _attach(self, parent, child):
        old = self.blobs[child]["name"]
        taken = {self.blobs[c]["name"] for c in self.children[parent]}
        self.blobs[child]["name"] = pick_name(taken, old)
        self.parent[child] = parent
        self.children[parent].append(child)
        new = self.blobs[child]["name"]
        return {"from": old, "to": new} if new != old else None

    def add_file(self, name, data, kind=None, tags=(), parent=None):
        """Store a real file: payload under its SHA-256 (deduplicated), a blob, a create event and an undo record."""
        zip32_check([(name, len(data))])
        kind = kind or kind_from_name(name)
        id = self._make("file", name, kind, len(data), tags)
        h = sha256(data)
        self.objects[h] = bytes(data)
        self.blobs[id].update(hash=h, payload="bytes")
        if parent:
            self._attach(parent, id)
        ev = self._log("create", {"id": id, "blobType": "file", "kind": kind, "name": self.blobs[id]["name"],
                                  "size": len(data), "parent": parent},
                       'created file "%s" (%s)' % (self.blobs[id]["name"], kind), [id])
        self.undo.append({"op": "create", "seq": ev["seq"], "ids": [id], "what": 'file "%s"' % self.blobs[id]["name"]})
        return id

    def add_dir(self, name, tags=(), parent=None):
        id = self._make("dir", name, None, 0, tags)
        if parent:
            self._attach(parent, id)
        self._log("create", {"id": id, "blobType": "dir", "name": name, "parent": parent}, 'created directory "%s"' % name, [id])
        return id

    def merge(self, a, b, confirmed_by="human-api"):
        """dir+dir = ONE directory holding all children of both ('name (2)' on clashes, sub-folders kept whole);
        file+file = a new directory holding both; file+dir = the directory adopts the file. Physics may not commit."""
        if confirmed_by == "physics":
            raise OrbError("physics may propose, never commit")
        A, B = self.blobs.get(a), self.blobs.get(b)
        if not A or not B or a == b:
            raise OrbError("bad merge")
        if self.parent[a] or self.parent[b] or A.get("gone") or B.get("gone"):
            raise OrbError("only live top-level orbs merge")
        name_a, name_b = A["name"], B["name"]
        kinds = [self.kind(a), self.kind(b)]
        renames, moved = [], None
        if A["type"] == "dir" and B["type"] == "dir":
            rule = "dir+dir"
            result = self._make("dir", name_b + " + " + name_a, None, 0, self._union(A["tags"], B["tags"]))
            self.blobs[result]["autoName"] = True
            self.blobs[result]["rings"] = max(A["rings"], B["rings"])
            moved = []
            for src in (b, a):
                for c in list(self.children[src]):
                    moved.append({"child": c, "from": src, "name": self.blobs[c]["name"]})
                    renames.append(self._attach(result, c))
                self.children[src] = []
                self.blobs[src]["gone"] = True
        elif A["type"] == "file" and B["type"] == "file":
            rule = "file+file"
            result = self._make("dir", name_b + " + " + name_a, None, 0, self._union(A["tags"], B["tags"]))
            self.blobs[result]["autoName"] = True
            renames.append(self._attach(result, b))
            renames.append(self._attach(result, a))
        else:
            rule = "file+dir"
            d = a if A["type"] == "dir" else b
            f = b if d == a else a
            result = d
            renames.append(self._attach(d, f))
        R = self.blobs[result]
        pa, pb = self.positions.get(a, (0, 0)), self.positions.get(b, (0, 0))
        self.positions[result] = pb
        R["rings"] += 1
        renames = [r for r in renames if r]
        self.pending = [p for p in self.pending if p["a"] not in (a, b) and p["b"] not in (a, b)]
        text = 'merged "%s" + "%s" \u2192 "%s" (%s, by %s)' % (name_a, name_b, R["name"], rule, confirmed_by)
        if renames:
            text += "; renamed " + ", ".join('"%s"\u2192"%s"' % (r["from"], r["to"]) for r in renames)
        data = {"a": a, "b": b, "result": result, "rule": rule, "confirmedBy": confirmed_by, "kinds": kinds,
                "resultMass": self.mass(result), "renamed": renames}
        if moved is not None:
            data["absorbed"] = [a, b]
        ids = []
        for x in (a, b, result):
            if x not in ids:
                ids.append(x)
        ev = self._log("merge", data, text, ids)
        self.undo.append({"op": "merge", "seq": ev["seq"], "rule": rule, "a": a, "b": b, "result": result,
                          "nameA": name_a, "nameB": name_b, "moved": moved, "ax": pa[0], "ay": pa[1], "bx": pb[0], "by": pb[1]})
        return result

    @staticmethod
    def _union(x, y):
        out = list(x)
        for t in y:
            if t not in out:
                out.append(t)
        return out

    def split(self, id):
        """Split a child out of its directory (or the last child of a top-level directory). Mass moves exactly."""
        if id not in self.blobs:
            raise OrbError("nothing to split")
        if self.parent[id]:
            parent, child = self.parent[id], id
        elif self.blobs[id]["type"] == "dir" and self.children[id]:
            parent, child = id, self.children[id][-1]
        else:
            raise OrbError("select a directory with children, or a child orb")
        before, cm = self.mass(parent), self.mass(child)
        index = self.children[parent].index(child)
        self.children[parent].remove(child)
        self.parent[child] = None
        after = self.mass(parent)
        if before - after != cm:
            raise OrbError("split math mismatch")
        ax, ay = self.positions.get(self.top_ancestor(parent), (0, 0))
        self.positions[child] = (ax + 80, ay)
        P, Cb = self.blobs[parent], self.blobs[child]
        ev = self._log("split", {"parent": parent, "child": child, "childMass": cm, "parentMassBefore": before, "parentMassAfter": after},
                       'split "%s" out of "%s" (parent lost %s)' % (Cb["name"], P["name"], fmt_bytes(cm)), [parent, child])
        self.undo.append({"op": "split", "seq": ev["seq"], "parent": parent, "child": child, "index": index})
        return child

    # ---------- records ----------
    def records(self, writer="orb.py"):
        hdr = dict(self.header)
        hdr.update(t="header", format="blobfs-orb", version=1, constantMass=C, savedAt=now_iso(), writer=writer)
        recs = [{"t": "header", "format": hdr["format"], "version": hdr["version"], "constantMass": C,
                 "savedAt": hdr["savedAt"], "writer": writer}]
        for id, b in self.blobs.items():
            r = {"t": "blob", "id": id, "type": b["type"], "kind": self.kind(id), "name": b["name"],
                 "size": self.content_size(id), "mass": self.mass(id), "tags": list(b["tags"]),
                 "rings": b["rings"], "history": list(b["history"]), "hash": b.get("hash") if b["type"] == "file" else None}
            if b["type"] == "file":
                r["payload"] = b.get("payload", "bytes")
                if b.get("src"):
                    r["src"] = b["src"]
            if b.get("entries") is not None:
                r["entries"] = b["entries"]
            if b.get("autoName"):
                r["autoName"] = True
            if b.get("gone"):
                r["gone"] = True
            for k, v in b.items():            # keep fields a newer writer added
                if k not in r and k not in ("t", "payload", "src", "entries", "autoName", "gone"):
                    r[k] = v
            recs.append(r)
        for id in self.blobs:
            for i, c in enumerate(self.children[id]):
                recs.append({"t": "link", "parent": id, "child": c, "index": i})
        for ev in self.events:
            if ev.get("type") == "merge":
                recs.append({"t": "merge", "time": ev["time"], "seq": ev["seq"], "a": ev["a"], "b": ev["b"],
                             "result": ev["result"], "rule": ev["rule"], "detail": ev["text"]})
        for id in self.top_level():
            if id in self.positions:
                x, y = self.positions[id]
                recs.append({"t": "position", "id": id, "x": x, "y": y})
        for k in self.refused:
            recs.append({"t": "refused", "key": k})
        for i, u in enumerate(self.undo):
            recs.append({"t": "undo", "pos": i, "rec": u})
        for p in self.pending:
            recs.append(dict({"t": "pending"}, **{k: v for k, v in p.items() if k != "t"}))
        for ev in self.events:
            recs.append(dict({"t": "event"}, **ev))
        return recs


def load(path, verify=True):
    """Open an .orb; check MAGIC, every CRC, every object's SHA-256 against its name, links, masses. Refuse on any mismatch."""
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        raise OrbError("not a zip: %s" % e)
    with z:
        names = z.namelist()
        if "MAGIC" not in names or "records.jsonl" not in names:
            raise OrbError("not a BlobFS .orb (no MAGIC or records.jsonl inside)")
        bad = z.testzip()                    # reads every entry and checks its CRC-32
        if bad is not None:
            raise OrbError("CRC mismatch in %s (the file is damaged)" % bad)
        if not z.read("MAGIC").startswith(b"BLOBFS-ORB\n"):
            raise OrbError("bad MAGIC header")
        d = Disk()
        for n in names:
            if n.startswith("objects/") and len(n) > 8:
                data = z.read(n)
                if sha256(data) != n[8:]:
                    raise OrbError("hash mismatch for %s (the file is damaged)" % n)
                d.objects[n[8:]] = data
        lines = [l for l in z.read("records.jsonl").decode("utf-8").split("\n") if l.strip()]
    recs = [json.loads(l) for l in lines]
    d.record_count = len(recs)
    links, undo = [], []
    for r in recs:
        t = r.get("t")
        if t == "header":
            d.header = r
        elif t == "blob":
            b = {k: v for k, v in r.items() if k != "t"}
            b.setdefault("tags", []); b.setdefault("rings", 0); b.setdefault("history", [])
            d.blobs[r["id"]] = b
            d.children[r["id"]] = []
            d.parent[r["id"]] = None
        elif t == "link":
            links.append(r)
        elif t == "position":
            d.positions[r["id"]] = (r["x"], r["y"])
        elif t == "refused":
            d.refused.append(r["key"])
        elif t == "undo":
            undo.append(r)
        elif t == "pending":
            d.pending.append({k: v for k, v in r.items() if k != "t"})
        elif t == "event":
            d.events.append({k: v for k, v in r.items() if k != "t"})
        elif t == "merge":
            pass                              # derived from the merge events on save
        else:
            raise OrbError("unknown record type %r" % t)
    for l in sorted(links, key=lambda l: l["index"]):
        if l["parent"] not in d.blobs or l["child"] not in d.blobs:
            raise OrbError("dangling link %s -> %s" % (l["parent"], l["child"]))
        if d.parent[l["child"]] is not None:
            raise OrbError("%s has more than one parent" % l["child"])
        d.children[l["parent"]].append(l["child"])
        d.parent[l["child"]] = l["parent"]
    d.undo = [u["rec"] for u in sorted(undo, key=lambda u: u["pos"])]
    if verify:
        d.verify()
    return d


def save(disk, path, writer="orb.py"):
    """Write MAGIC, records.jsonl and each referenced payload once under objects/<sha256>, STORE method, zip32 only."""
    disk.verify()
    recs = disk.records(writer)
    body = ("\n".join(dumps(r) for r in recs) + "\n").encode("utf-8")
    hashes = sorted({b["hash"] for b in disk.blobs.values() if b["type"] == "file"})
    entries = [("MAGIC", len(MAGIC)), ("records.jsonl", len(body))] + [("objects/" + h, len(disk.objects[h])) for h in hashes]
    zip32_check(entries)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED, allowZip64=False) as z:
        z.writestr("MAGIC", MAGIC)
        z.writestr("records.jsonl", body)
        for h in hashes:
            z.writestr("objects/" + h, disk.objects[h])
    return recs


def _info(d):
    s = d.verify()
    s["record_count"] = d.record_count
    s["header"] = {k: v for k, v in d.header.items() if k != "t"}

    def tree(id, depth):
        b = d.blobs[id]
        line = "%s%s [%s, %s, %s]" % ("  " * depth, b["name"], b["type"], d.kind(id), fmt_bytes(d.mass(id)))
        return [line] + [x for c in d.children[id] for x in tree(c, depth + 1)]
    s["tree"] = [x for id in d.top_level() for x in tree(id, 0)]
    return s


def main(argv):
    if len(argv) != 3 or argv[1] not in ("verify", "info"):
        print("usage: python orb.py verify|info FILE.orb", file=sys.stderr)
        return 2
    try:
        d = load(argv[2])
    except (OrbError, OSError, ValueError, KeyError) as e:
        print("FAIL: %s" % e)
        return 1
    if argv[1] == "verify":
        s = d.verify()
        print("OK: %s: %d records, %d blobs (%d files, %d dirs), %d objects, every SHA-256 and CRC checked"
              % (argv[2], d.record_count, s["blobs"], s["files"], s["dirs"], s["objects"]))
    else:
        print(json.dumps(_info(d), indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
