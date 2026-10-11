# BlobFS: Kind-Typed Fusion of Distinct Objects as a Recorded, Human-Committed Storage Event

**Kenneth S.**

## Abstract

BlobFS is a file system where files are living blobs that attract, merge, and split. The contribution is narrow and specific. Merging as a recorded storage operation is not new (Git, Irmin, Ficus and Coda all do forms of it); to our knowledge, no prior system combines four things: (1) kind-typed fusion of distinct objects into a new stored container, (2) refused merges recorded as events, (3) propose-only operation with a human commit enforced at the storage layer, and (4) a self-describing per-object archive with content-addressed payloads. The .orb format stores real payloads deduplicated by SHA-256 hash. orb.py, a stdlib Python reference written to the shipped format, and the browser loader agree on all 22 blob and 20 object hashes of demo.orb, and files written by each open in the other. We do not claim BlobFS beats folders: the personal-file literature strongly favors browsing, and BlobFS builds nesting rather than removing it. We present the format, the merge rules, and the test results; a user study comparing BlobFS in 3D, BlobFS in 2D, and ordinary folders is planned future work and has not been run.

## 1. Introduction

Folders are a filing-cabinet metaphor from the eighties. They work because the same person both files and retrieves, and browsing beats searching by nearly three to one in dual-task experiments [Bergman et al. 2013]. But the metaphor has a cost: organization is a chore you do by hand, and the structure you build is brittle — a wrong folder is a wrong place, and moving things means remembering where they went.

BlobFS inverts the relationship. Files are blobs with mass, kind, and tags. Similar files attract each other; when they touch, the format proposes a merge; a person confirms or refuses; and the result is a new stored object with history. The disk organizes itself around what you actually do, and every fusion is reversible.

The contribution is not 3D, not physics, not self-organization, and not merge as a storage operation on its own — all of those have ancestors (fsn, BumpTop, Piles, Git, Irmin, Ficus, Coda). The claim is narrow: to our knowledge, no prior system combines (1) kind-typed fusion of distinct objects into a new stored container, (2) refused merges recorded as events, (3) propose-only operation with a human commit at the storage layer, and (4) a self-describing per-object archive with content-addressed payloads.

## 2. Related Work

[See paper/related-work.md for the full related work section, including the merge table comparing Git, Irmin, Perkeep, overlayfs, and BlobFS.]

### 2.1 Piles and physics desktops

Piles [Mander et al. 1992] and BumpTop [Agarawala and Balakrishnan 2006] grouped files by putting them together rather than naming a folder. BumpTop gave objects mass and friction and merged piles with a lasso gesture. In both systems the grouping lives in the interface. In BlobFS the merge is an operation of the storage format, with recorded history and a human commit gate.

### 2.2 3D and spatial file browsing

3D file views date to the early 1990s (fsn on SGI IRIX). Data Mountain [Robertson et al. 1998] showed spatial placement can help retrieval; Cockburn and McKenzie [2002] found 3D slowed it (3.7s in 2D vs 4.8s in 3D). FOLDER3D [Luz et al. 2010] kept the folder tree on purpose. The safe framing: BlobFS's contribution is the merge operation; 3D is one possible interface, and a 2D version of the same format is the fair control.

### 2.3 Beyond the hierarchy

Semantic File Systems [Gifford et al. 1991], Lifestreams [Fertig et al. 1996], Placeless Documents [Dourish et al. 2000], and KondoCloud [Brackenbury et al. 2021] all group files by query, time, or property — leaving the files untouched. KondoCloud's 59 participants accepted 25.5% of 1,856 suggestions, which is treated as a design input: suggestions are mostly refused, so physics may propose and cannot commit.

### 2.4 Storage side: hashes, logs, and history

Venti [Quinlan and Dorward 2002] identified blocks by content hash — write-once, deduplicated — and Fossil [Quinlan, McKie and Cox] layered a snapshotting Plan 9 file server over it; Data Domain [Zhu, Li and Patterson 2008] made hash-based deduplication fast at backup scale. The .orb store borrows the idea, not the scale: it dedups whole payloads per archive. The Elephant file system [Santry et al. 1999] and CVFS [Soules et al. 2003] kept old versions; they record versions of one file, not fusions of different ones. PASS [Muniswamy-Reddy et al. 2006] records provenance automatically in storage; the .orb log is closer to a user-decision log than to lineage capture. Event sourcing rebuilds state by replaying an append-only log. The .orb format uses these parts; what is new is what the log records: accepted merges, refused merges, splits, and unmerges as first-class events.

### 2.5 Merge as a storage operation

Git merge commits and git revert already make merge a recorded, reversible storage operation. Irmin [Farinier et al. 2015] generalizes it to typed data structures with three-way merge. Ficus [Reiher et al. 1994] and Coda [Kumar and Satyanarayanan 1995] go further at the file-system layer, selecting type-specific resolvers by file name or rule to merge conflicting replicas automatically; Harmony [Foster et al. 2007] uses schemas to synchronize replicas of structured data. All of these merge versions of the same object; BlobFS merges different objects into a new container. Perkeep has content-addressed blobs but no merge operation. overlayfs and Unionfs [Wright et al. 2006] merge directories as a namespace view over unchanged branches. None records refusals, gates merges by kind, or limits the system to proposing. The closest prior on the human-commit axis is YoloFS [Zhong et al. 2026, ref. 36], which stages file-system mutations made by AI agents until a person commits them, with snapshots, undo, and access gates; it does not fuse distinct objects, log refused merges, or gate by kind.

### 2.6 Recent neighbours

SYSSPEC (FAST 2026) generates file system code from formal specs — it builds systems, it does not organize files. LSFS (ICLR 2025) is an LLM-based semantic file system with a group-by syscall — it groups by query, not by contact. LlamaFS (2024) renames and categorizes files by content with accept-or-reject suggestions — it organizes, it does not fuse. TagFS (2006) makes directories dynamic views over tags — a view layer, not a storage operation. None makes fusion of distinct objects into a stored container the primitive.

## 3. The .orb Format

An .orb file is a zip archive. Inside: a magic header, then records. Each blob is a record with an id, kind (file or directory), name, mass, children, and a content hash. Child links are separate records pointing parent to child. Merge events are their own record type — timestamp, the two source ids, the result id, and a detail string. Positions live in a separate record type, deliberately decoupled from identity.

Payloads are stored once under their SHA-256 hash in an objects/ directory. Identical bytes are stored once: three files with one duplicate became two payloads. A flipped bit is caught when the orb is opened — the hash check fails and the file refuses to load.

Name collisions get a disambiguator: notes.txt and notes.txt become notes.txt and notes (2).txt, never a silent overwrite. A folder merged into another goes in as a sub-orb, not flattened. Undo is a new event that leaves the merge visible in the history — nothing vanishes.

The format is implemented twice: the browser page (blobfs-2d.html), which reads and writes the zip with its own inline reader and writer (no JSZip or other library), and orb.py, a stdlib-only Python reference (zipfile, hashlib, json) written afterwards to the format the page ships. The cross-language test (tests/test_crosslang.py) opens the committed demo.orb, saved by the page, in orb.py and in the page's own loader run headless in Chromium and Firefox. Both sides agree on all 22 blob hashes, all 20 object hashes, the 13 links and the 101-record count. A file written by orb.py opens in the page, and a file saved by the page opens and verifies in orb.py, with a random 70,001-byte payload compared byte for byte and a 50,000-byte file dropped onto the page compared by SHA-256.

## 4. Merge Rules

Three merge rules, so a drag never destroys data:

- Directory ∪ directory becomes one directory. Children are kept. The name is a union (Sessions ∪ Masters) until renamed.
- File ∪ file becomes a new directory holding both files — not a byte-level paste. Concatenating audio or text on contact is too easy to do by accident.
- File ∪ directory adopts the file as a child and adds its mass.

Mass is content size plus a small constant, so an empty folder still has a body. Radius follows the cube root.

The kind gate: same-kind attraction is the default. Cross-kind fusion requires explicit shared tags plus a human confirm. A photo and a song with nothing in common never form a neck. Give them a shared tag and the neck forms, the merge waits as pending, and nothing moves. Physics cannot commit it; refusing it leaves both blobs whole, and the refusal stays in the history.

The force model has four terms: typed attraction, size-dependent repulsion (mass-product over distance, so two heavy blobs repel far harder than a heavy and a light one), tag-boosted pull (shared tags double the attraction), and pinning (a force pulling back toward origin). Without the size-dependent repulsion, everything collapses into a single blob. With it, same-type files still fuse while cross-type contact does not swallow everything.

## 5. Evaluation: Tests

The test suite covers the rules directly:

- Split math is exact. A 2.7 MB file and a 0.8 MB file merged, then split: the parent lost exactly the child's size, and parent plus child equaled the merged mass to the byte. Halving would have been off by 1,750,000 bytes.
- The gate works both ways. No shared tag: no neck. Shared tag: neck forms, merge waits, physics cannot commit, refusal leaves both blobs whole and is recorded.
- Dedup: three files with one duplicate stored two payloads.
- Round-trip: every file's bytes identical after open-and-extract; same ids, same tree.
- Integrity: a flipped bit is caught on open.
- Collisions: same-name files get disambiguators; nothing overwritten.
- Nesting: a folder goes in as a sub-orb, not flattened.
- Diff: shows the move. Unmerge: frees the blob and leaves the commit in the log.
- Cross-language: orb.py and the browser loader agree on all 22 blob and 20 object hashes of demo.orb, and files written by each open in the other (tests/test_crosslang.py: 12 tests, 9 pure-Python and 3 cross-language, each cross-language test run in Chromium and Firefox).

Browser page: 73 automated Playwright checks of blobfs-2d.html, run headless in Chromium and Firefox from a local file, passed in both with zero console errors. They cover rendering, the command bar, merge rules including directory union and its undo, kind gate, undo-as-event, local use-log events, zorb unpack, .orb save/open round-trip with SHA-256 checks in Python, the undo stack and pending suggestions surviving save and reopen (undo after reopen restores both directories; a reopened suggestion can be accepted or refused), dropped files stored and reopened byte-exact, and the refusal of files of 4 GiB or more.

Test results (actually run on 2026-10-03):

| Suite | Environment | Result | Runtime |
|---|---|---|---|
| Browser page (Playwright) | headless Chromium, local file | 73/73 checks passed; zero console messages, page errors, or network requests | [TODO: not recorded; the 73-check script was not kept and could not be re-run] |
| Browser page (Playwright) | headless Firefox, local file | 73/73 checks passed; zero console messages, page errors, or network requests | [TODO: not recorded; the 73-check script was not kept and could not be re-run] |
| `python -m unittest -v tests.test_crosslang` | Python + Playwright (Chromium and Firefox) | 12/12 passed (9 pure-Python, 3 cross-language) | 19.6 s |
| `python -m unittest -v tests.test_crosslang`, re-run 2026-10-11 | Python 3.13.5, Node 20.19.2, playwright npm package (Chromium, Firefox 157.0) | 12/12 passed (9 pure-Python, 3 cross-language); 140 blob hashes, 128 object hashes, 84 links, 8 page runs | 18.7 s, 17.3 s, 17.1 s (three runs, unittest-reported) |

On demo.orb, Python and the page agree on all 22 blob hashes, 20 object hashes, 13 links and 101 records. Across the whole cross-language run the test compared 140 blob hashes, 128 object hashes and 84 links over 8 page runs. A re-run on 2026-10-10 on a machine without Node/Playwright passed the 9 pure-Python tests (the 3 cross-language tests were skipped, not failed).

Open time against event count. Method: a small script builds a disk with orb.py of N files of 1 KiB random bytes, merges them pairwise (file+file), saves it, then times `orb.load(path, verify=True)` five times, which reads every entry, checks every CRC-32 and every object's SHA-256, and verifies links and masses. Machine: shared Linux VM, 8 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Python 3.13.5, warm page cache. Medians of 5 runs (min–max):

| Files | Events | Records | .orb size | Open + verify, median (min–max) |
|---|---|---|---|---|
| 100 | 150 | 651 | 0.23 MB | 3.8 ms (3.5–11.1) |
| 1,000 | 1,500 | 6,501 | 2.3 MB | 40.7 ms (35.1–51.5) |
| 4,000 | 6,000 | 26,001 | 9.3 MB | 193.3 ms (169.8–223.1) |

demo.orb (101 records) opened and verified in 6.5 ms (single run). Open time grows roughly linearly with record count in this range. These are Python-reference numbers on a shared VM; the browser loader's open time, large payloads, and cold-cache disks were not measured in this run.

Browser loader and large payload (measured 2026-10-11). Scripts are in bench/ (`bench/run_all.sh`; raw output in bench/results-2026-10-11.txt). The same disks were built with `bench/make_disk.py` (N files of 1 KiB random bytes merged pairwise, plus one disk holding a single 100 MiB random file). `bench/py_open.py` times `orb.load(path, verify=True)`. `bench/page_open.js` loads blobfs-2d.html from a local file in headless Chromium or Firefox (Playwright, Node 20.19.2), clicks the page's own Open .orb button, and times from handing the file to the file chooser until the page reports "Opened … (all SHA-256 hashes verified)", with a fresh page for each run. Same machine as above (shared Linux VM, 8 vCPUs, Python 3.13.5), warm page cache. Medians of 5 runs (min–max), in ms:

| Disk | .orb size | orb.py | Chromium page | Firefox page |
|---|---|---|---|---|
| 100 files | 0.23 MB | 3.7 (3.4–5.1) | 47 (39–63) | 29 (19–41) |
| 1,000 files | 2.3 MB | 34.8 (34.2–45.2) | 384 (346–396) | 198 (185–225) |
| 4,000 files | 9.3 MB | 155.0 (149.3–179.3) | 3,269 (1,739–5,506) | 1,736 (1,684–1,798) |
| 1 file, 100 MiB | 104.9 MB | 159.8 (151.9–204.7) | 522 (508–592) | 1,363 (1,348–1,385) |

On many small files the page took about 6 to 21 times as long as orb.py and grows faster than linearly from 1,000 to 4,000 files; Chromium's 4,000-file runs varied by a factor of three on this shared VM. Cold-cache disk timings are [TODO: not yet measured].

## 6. Future Work: Planned User Study

No user study has been run; this section describes a planned study, and no results are reported or implied. A small study with 12 to 16 people would turn the design paper into a research paper. Each participant would use three interfaces in balanced order: BlobFS in 3D, BlobFS in a flat 2D view of the same format, and an ordinary folder window. The 2D condition separates the effect of the merge operation from the effect of 3D.

Planned procedure: give each participant a realistic set of about 60 files (photos, audio takes, text notes) with a different but comparable set per interface. Ask them to organize however they like, no time pressure. A day later, ask them to find 15 files from short descriptions, timing each search and noting failures. Finish with a questionnaire on effort and ease, and a ten-minute interview.

Planned measures: time and failures when finding files a day later (the main comparison with folders); number of merges, splits, and undos (shows whether people use fusion and how often they reverse it); share of suggested merges accepted (directly comparable with KondoCloud's 25.5%); perceived effort and ease (folders are known to be low-effort, so this is the fair test).

Practical steps (not yet taken): run a pilot with three people first. The study needs ethics approval from whichever university hosts it; an HCI group would normally handle that.

## 7. Limitations

- No user study yet. The folder literature points the other way on effort, so the study is not optional.
- The mass constant C is 1 MiB (1,048,576 bytes) in the browser page (`BODY = 1024 * 1024` in blobfs-2d.html, also written into every saved .orb header as `constantMass`). It is a chosen value, not derived or measured. The Python reference orb.py uses the same value (`C = 1048576`) and refuses a file whose header says otherwise.
- The repulsion coefficient is tuned, not derived.
- Performance measurements are small open-time benchmarks on one shared VM with a warm page cache (Section 5): orb.py and the browser page in Chromium and Firefox, at 100 to 4,000 files and one 100 MiB file. Cold-cache timings are [TODO: not yet measured], and the runtime of the 73-check browser suite was never recorded.
- The zip profile has not been formally specified. The page writes uncompressed (STORE) zip32 archives with its own inline writer and reads STORE and DEFLATE (DEFLATE needs the browser's DecompressionStream); orb.py writes STORE zip32 and reads what Python's zipfile reads. The format is strict about what it reads and tolerant about what it writes, but this should be tightened.
- There is no ZIP64: a single file of 4 GiB or more is refused, and so is a save that would exceed 4 GiB in total or 65,535 entries. Files of the built-in sample disk are synthetic placeholders, marked `"payload":"placeholder"` in the saved records; imported, added and dropped files are stored as their real bytes.
- The ACM DL sweep is now free (ACM went fully open access January 2026), but the IEEE Xplore full-text sweep still needs access or author PDFs.
- 3D delivery (VR, haptics, light fields) is far future; the prototype is a browser page.

### Future work: AI curation and gaze

This is proposed future work, not a claim. An AI curator could learn from the event log BlobFS already keeps (merges, splits, refusals, renames, tags, unpacks) together with a local, on-device record of opens, plays and exports; the 2D prototype now keeps such a record for opens, plays and exports, but no model has been trained on it. The rule would mirror the physics rule: the AI may suggest merges, shown as the same amber Accept / Keep apart prompt, but never commit them. Small undoable actions (a tag, a rename, a new folder) might run automatically, but each must land in the history like any other event and carry an Undo that appends a reversing event rather than erasing anything.

Gaze may later replace the mouse for deictic references, so that "merge this into that" resolves "this" and "that" to the orbs being looked at. Voice comes first: the 2D prototype has a typed and spoken command bar (Web Speech API, Chrome and Edge only) with fuzzy name matching that asks rather than guesses when a name is ambiguous. Eye tracking is not implemented or tested.

## 8. Conclusion

BlobFS combines kind-typed fusion of distinct objects into a new stored container, refusals recorded as events, a human as the one who commits, and a self-describing archive with content-addressed payloads. The format is real — two implementations agree, the tests pass, and the narrow four-part claim survives a literature sweep. What remains is the user study (future work), cold-cache performance numbers, and the paywalled index check. The idea is that a disk should organize itself around what you do, and that nothing you merge should ever be gone for good.

## References

[Full reference list in paper/related-work.md, references 1–36.]

---

*Working copy. Gaps marked [TODO] are real and should be filled before submission.*
