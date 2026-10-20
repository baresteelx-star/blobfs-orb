# Merge by Kind, Commit by Hand: The BlobFS File Format

**Kenneth Santala**

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

Git merge commits and git revert already make merge a recorded, reversible storage operation. Irmin [Farinier et al. 2015] generalizes it to typed data structures with three-way merge. Ficus [Reiher et al. 1994] and Coda [Kumar and Satyanarayanan 1995] go further at the file-system layer, selecting type-specific resolvers by file name or rule to merge conflicting replicas automatically; Harmony [Foster et al. 2007] uses schemas to synchronize replicas of structured data. FileWeaver [Gori et al. 2020, ref. 37] merges format variants of one file into a polymorphic "morph" and tracks dependencies, but does not fuse distinct objects under kind rules, log refused merges, or gate commits at the storage layer. All of these merge versions of the same object; BlobFS merges different objects into a new container. Perkeep has content-addressed blobs but no merge operation. overlayfs and Unionfs [Wright et al. 2006] merge directories as a namespace view over unchanged branches. None records refusals, gates merges by kind, or limits the system to proposing. The closest prior on the human-commit axis is YoloFS [Zhong et al. 2026, ref. 36], which stages file-system mutations made by AI agents until a person commits them, with snapshots, undo, and access gates; it does not fuse distinct objects, log refused merges, or gate by kind.

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

The test suite covers the rules directly. Each line below is checked by `tests/test_orb.py` (20 tests), `tests/test_crosslang.py` (12 tests), `tests/browser_suite.js` (110 checks per browser), or more than one of those:

- Split math is exact. A file of 2,700,000 bytes and a file of 800,000 bytes merged, then split: the parent lost exactly the child's mass, 800,000 + C = 1,848,576 bytes, and parent mass plus child mass equaled the merged mass. Half of the two payload sizes is 1,750,000 bytes. That half is neither child's size, and it is not the mass that moved.
- The gate works both ways. With no shared tag, orbs held in contact are not proposed and are not merged, and a drop draws the refusal outline and bounces them apart. With a shared tag, a suggestion forms and waits (the amber pending state). Physics can propose that suggestion and cannot commit it. A same-kind drop commits as `human-drop`. A refusal leaves both blobs whole and is recorded.
- Dedup: three files with one duplicate stored two payloads.
- Round-trip: every file's bytes identical after open-and-extract; same ids, same tree.
- Integrity: a flipped payload whose zip CRC was recomputed is refused as a hash mismatch, and a CRC-header flip is refused as a CRC mismatch. The page opens a DEFLATE archive written by Python. The page's inline SHA-256 matches the known digest of "abc".
- Collisions: notes.txt and notes.txt become notes.txt and notes (2).txt. Both payloads survive.
- Nesting: a folder merged into another stays a sub-orb. Its files are not hoisted.
- History shows the move. Unmerge frees both files and leaves the merge event in the log.
- Cross-language: orb.py and the browser loader agree on all 22 blob and 20 object hashes of demo.orb, and files written by each open in the other (tests/test_crosslang.py: 12 tests, 9 pure-Python and 3 cross-language, each cross-language test run in Chromium and Firefox).

Browser page: `tests/browser_suite.js` is 110 automated Playwright checks of blobfs-2d.html, run headless in Chromium and Firefox from a local file. On 2026-10-19 both browsers passed the 106 checks that existed that day, 106/106 with zero console messages, page errors, or network requests (Chromium 11.245 s, Firefox 16.026 s, suite-reported `runtime_ms`, one run each). That run was on a shared Linux VM with 4 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Ubuntu 24.04.5, Node v22.23.3, Playwright 1.56.1, Chromium 141.0.7390.37, and Firefox 142.0.1. The checks cover rendering, the colour key, the command bar, merge rules including directory union and its undo, the kind gate, drag-and-drop commit, physics proposals that do not commit, recorded refusal, undo-as-event, local use-log events (open, play, and export), zorb unpack, .orb save/open round-trip with SHA-256 checks in Python, the undo stack and pending suggestions surviving save and reopen (undo after reopen restores both directories; a reopened suggestion can be accepted or refused), dropped files stored and reopened byte-exact, the 2,700,000-byte / 800,000-byte split, dedup, the notes.txt collision, a nested folder kept as a sub-orb, DEFLATE open, separate hash and CRC refusals, the refusal of files of 4 GiB or more, and spoken commands delivered by a fake Web Speech API. The 4 GiB refusal is checked two ways. One check still passes a File-like stub `{name:'huge.bin', size:4294967296}` to `BlobFS.addFiles`, which reads only `.size`. The other creates a sparse file with `truncate -s 4294967296` (exact size 4,294,967,296 bytes, `stat` block count 0) and hands that path to the page's `#inFiles` input. The block count was still 0 after the refusal, and the file was not added. A separate one-run probe the same day, not one of the 106 checks, timed that input path at 28 ms in Chromium and 82 ms in Firefox; `du -B1` reported 0 bytes allocated. Spoken commands are not audio and not a microphone: before the page loads, Playwright installs a fake `SpeechRecognition` that calls `onresult` with a scripted transcript, or `onerror` with a scripted error. A result `open notes` is logged as the event text `open "notes" (voice)` with `via` `voice`. A later result `new folder Spoken` creates that folder. An error `not-allowed` replies that microphone permission was denied and adds nothing. Pages that do not install the fake still check that the microphone button is enabled only when the browser actually exposes the API (Firefox's Playwright build does not, so the button stays disabled there). The 2026-10-16 run of the previous 101-check suite is in the table below. The original 73-check script was not recovered. The 73/73 rows in the table are as reported on 2026-10-03 and were not re-run.

Test results (each row names the day it was run):

| Suite | Environment | Result | Runtime |
|---|---|---|---|
| Browser page (Playwright) | headless Chromium, local file | 73/73 checks passed; zero console messages, page errors, or network requests | not recorded (the 73-check script was not kept; see the rebuilt suite below) |
| Browser page (Playwright) | headless Firefox, local file | 73/73 checks passed; zero console messages, page errors, or network requests | not recorded (the 73-check script was not kept; see the rebuilt suite below) |
| Rebuilt browser suite `tests/browser_suite.js`, run 2026-10-11 | headless Chromium, local file, Node 20.19.2 | 60/60 checks passed in each of 3 runs; zero console messages, page errors, or network requests | 4.58 s, 4.50 s, 4.60 s (suite-reported) |
| Rebuilt browser suite `tests/browser_suite.js`, run 2026-10-11 | headless Firefox 157.0, local file, Node 20.19.2 | 60/60 checks passed in each of 3 runs; zero console messages, page errors, or network requests | 8.95 s, 8.98 s, 9.26 s (suite-reported) |
| `python -m unittest -v tests.test_crosslang` | Python + Playwright (Chromium and Firefox) | 12/12 passed (9 pure-Python, 3 cross-language) | 19.6 s |
| `python -m unittest -v tests.test_crosslang`, re-run 2026-10-11 | Python 3.13.5, Node 20.19.2, playwright npm package (Chromium, Firefox 157.0) | 12/12 passed (9 pure-Python, 3 cross-language); 140 blob hashes, 128 object hashes, 84 links, 8 page runs | 18.7 s, 17.3 s, 17.1 s (three runs, unittest-reported) |
| `tests/browser_suite.js`, run 2026-10-16 | headless Chromium 141.0.7390.37, local file, Node 22.14.0, Playwright 1.56.1 | 101/101 checks passed; zero console messages, page errors, or network requests | 10.94 s (suite-reported, one run) |
| `tests/browser_suite.js`, run 2026-10-16 | headless Firefox 142.0.1, local file, Node 22.14.0, Playwright 1.56.1 | 101/101 checks passed; zero console messages, page errors, or network requests | 16.57 s (suite-reported, one run) |
| `python -m unittest -v tests.test_orb tests.test_crosslang`, run 2026-10-16 | Python 3.12.3, Node 22.14.0, Playwright 1.56.1 (Chromium 141, Firefox 142) | 32/32 passed (20 in tests/test_orb.py, 12 in tests/test_crosslang.py). The cross-language module again tallied 140 blob hashes, 128 object hashes, 84 links, and 8 page runs | 16.1 s (one run, both modules together) |
| `tests/browser_suite.js`, run 2026-10-19 | headless Chromium 141.0.7390.37, local file, Node v22.23.3, Playwright 1.56.1, 4 vCPUs, 15 GiB RAM, Ubuntu 24.04.5 | 106/106 checks passed; zero console messages, page errors, or network requests | 11.245 s (suite-reported, one run) |
| `tests/browser_suite.js`, run 2026-10-19 | headless Firefox 142.0.1, local file, Node v22.23.3, Playwright 1.56.1, same machine | 106/106 checks passed; zero console messages, page errors, or network requests | 16.026 s (suite-reported, one run) |
| `tests/browser_suite.js`, run 2026-10-20 | headless Chromium 141.0.7390.37, local file, Node v22.23.3, Playwright 1.56.1, 4 vCPUs, 15 GiB RAM, Ubuntu 24.04.5 | 110/110 checks passed; zero console messages, page errors, or network requests | 11.161 s (suite-reported, one run) |
| `tests/browser_suite.js`, run 2026-10-20 | headless Firefox 142.0.1, local file, Node v22.23.3, Playwright 1.56.1, same machine | 110/110 checks passed; zero console messages, page errors, or network requests | 16.303 s (suite-reported, one run) |
| `python -m unittest -v tests.test_orb tests.test_crosslang`, run 2026-10-19 | Python 3.12.3, Node v22.23.3, Playwright 1.56.1 (Chromium 141.0.7390.37, Firefox 142.0.1), same machine | 32/32 passed. The cross-language module again tallied 140 blob hashes, 128 object hashes, 84 links, and 8 page runs | 15.849 s (one run, both modules together) |

The original 73-check Playwright script (run 2026-10-03) was not kept, so its runtime was never recorded and its results cannot be reproduced; the two 73/73 rows above are as reported at the time. On 2026-10-11 a new suite, `tests/browser_suite.js`, was written from the description of that script and the page's features. That rebuild had 60 checks, not 73: rendering, the colour key, the command bar (help, unknown commands, open, rename, tag, undo, new folder, zoom, a typed "add files" opening no file picker, ambiguous names), the merge rules (dir∪dir as one directory after a human accept, a name clash renamed "cover1 (2)", undo of dir∪dir, file∪file making a new directory, file∪dir adopting the file, the kind gate), zorb unpack, dropped files keeping their SHA-256 in the page and in orb.py, .orb save and reopen, undo depth and pending suggestions surviving reopen (a reopened suggestion accepted and another refused, then undo after reopen restoring both directories of a saved dir∪dir merge), a second save on which orb.py and the page agree on every blob hash, a flipped bit refused, the 4 GiB refusal (tested with a File-like stub of size 4 GiB, since a real 4 GiB file was not created), the zip32 limits, and zero console messages, page errors and network requests. Raw output of the 60-check rebuild: tests/results-browser-suite-2026-10-11.txt. Those 60-check rows are the record of that rebuild. They are not the current suite.

On 2026-10-16 `tests/browser_suite.js` was expanded from 60 checks to 101, and `tests/test_orb.py` was added (20 tests). The added checks cover behavior the 60-check rebuild did not exercise, including what Section 5 already attributed to the suite: local use-log events, the 2,700,000 / 800,000 split, dedup to two payloads, the notes.txt disambiguator, a folder kept as a sub-orb, a physics suggestion that does not commit, a recorded refusal, unmerge leaving the merge event in the log, a same-kind drop recorded as a human commit, DEFLATE open, and a hash mismatch distinguished from a CRC mismatch. The 2026-10-16 run is one pass per browser, on a shared Linux VM with 4 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Ubuntu 24.04.5. It is not the 8-vCPU machine used for the 2026-10-11 timings, and it was not repeated three times.

On 2026-10-19 the same suite grew from 101 checks to 106. The five new checks are the real sparse 4 GiB file on `#inFiles`, the microphone button enabled when a fake recognizer is installed, the scripted `open notes` voice event, the scripted `new folder Spoken` command, and the scripted `not-allowed` voice error. That run is also one pass per browser, on a 4 vCPU VM of the same reported shape as 2026-10-16 (Node is v22.23.3 in this run, not 22.14.0). It was not repeated three times.

On 2026-10-20 the suite grew from 106 checks to 110. The four new checks are: study mode stays off unless asked, and a cross-kind bounce is then not an event; with study mode on, every event carries `study: true` and an 8-hex session and the status line says so; that mode logs one cross-kind `suggest` and one `bounce`; the history export names the session and says the file stays on this machine. Study mode does not change merge rules. That run is one pass per browser on a 4 vCPU VM reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Ubuntu 24.04.5, Node v22.23.3, Playwright 1.56.1 (Chromium 141.0.7390.37, Firefox 142.0.1). It was not repeated three times. No user study was run.

On demo.orb, Python and the page agree on all 22 blob hashes, 20 object hashes, 13 links and 101 records. Across the whole cross-language run the test compared 140 blob hashes, 128 object hashes and 84 links over 8 page runs. A re-run on 2026-10-10 on a machine without Node/Playwright passed the 9 pure-Python tests (the 3 cross-language tests were skipped, not failed). The 2026-10-16 unittest run in the table printed that same cross-language tally again.

Open time against event count. Method: a small script builds a disk with orb.py of N files of 1 KiB random bytes, merges them pairwise (file+file), saves it, then times `orb.load(path, verify=True)` five times, which reads every entry, checks every CRC-32 and every object's SHA-256, and verifies links and masses. Machine: shared Linux VM, 8 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Python 3.13.5, warm page cache. Medians of 5 runs (min–max):

| Files | Events | Records | .orb size | Open + verify, median (min–max) |
|---|---|---|---|---|
| 100 | 150 | 651 | 0.23 MB | 3.8 ms (3.5–11.1) |
| 1,000 | 1,500 | 6,501 | 2.3 MB | 40.7 ms (35.1–51.5) |
| 4,000 | 6,000 | 26,001 | 9.3 MB | 193.3 ms (169.8–223.1) |

demo.orb (101 records) opened and verified in 6.5 ms (single run). Open time grows roughly linearly with record count in this range. These are Python-reference numbers on a shared VM; browser open times, a large-payload case, and cold-cache open times are reported in the tables that follow.

Browser loader and large payload (measured 2026-10-11). Scripts are in bench/ (`bench/run_all.sh`; raw output in bench/results-2026-10-11.txt). The same disks were built with `bench/make_disk.py` (N files of 1 KiB random bytes merged pairwise, plus one disk holding a single 100 MiB random file). `bench/py_open.py` times `orb.load(path, verify=True)`. `bench/page_open.js` loads blobfs-2d.html from a local file in headless Chromium or Firefox (Playwright, Node 20.19.2), clicks the page's own Open .orb button, and times from handing the file to the file chooser until the page reports "Opened … (all SHA-256 hashes verified)", with a fresh page for each run. Same machine as above (shared Linux VM, 8 vCPUs, Python 3.13.5), warm page cache. Medians of 5 runs (min–max), in ms:

| Disk | .orb size | orb.py | Chromium page | Firefox page |
|---|---|---|---|---|
| 100 files | 0.23 MB | 3.7 (3.4–5.1) | 47 (39–63) | 29 (19–41) |
| 1,000 files | 2.3 MB | 34.8 (34.2–45.2) | 384 (346–396) | 198 (185–225) |
| 4,000 files | 9.3 MB | 155.0 (149.3–179.3) | 3,269 (1,739–5,506) | 1,736 (1,684–1,798) |
| 1 file, 100 MiB | 104.9 MB | 159.8 (151.9–204.7) | 522 (508–592) | 1,363 (1,348–1,385) |

On many small files the page took about 6 to 21 times as long as orb.py and grows faster than linearly from 1,000 to 4,000 files; Chromium's 4,000-file runs varied by a factor of three on this shared VM. Cold-cache open times (measured 2026-10-11, `bench/run_cold.sh`; raw output in bench/results-cold-2026-10-11.txt). Method: freshly built disks with the same parameters as above; before every timed run the script ran `sync` and `echo 3 > /proc/sys/vm/drop_caches` via sudo (bench/drop_cache.sh), and checked with mincore(2) (bench/resident.py) that 0 bytes of the .orb were resident in the page cache before each of the 60 runs. For orb.py the cache is dropped after Python and orb.py are imported; for the page it is dropped after the browser has started, the page has loaded and the file chooser is open, so the timing covers reading the .orb from disk plus parsing and verifying, not browser start-up. Dropping the cache also evicts other unmapped files (for example parts of the Python and browser installs), which may add to the times. The disk is a virtio block device on the same shared VM, and the host may cache it, so "cold" means cold in the guest's page cache, not necessarily a physical disk read. Medians of 5 runs (min–max), in ms:

| Disk | .orb size | orb.py, cold | Chromium page, cold | Firefox page, cold |
|---|---|---|---|---|
| 100 files | 0.23 MB | 6.5 (5.5–8.2) | 63 (57–84) | 31 (29–53) |
| 1,000 files | 2.3 MB | 61.8 (56.7–73.3) | 522 (454–803) | 295 (270–311) |
| 4,000 files | 9.3 MB | 260.0 (240.6–295.6) | 4,166 (2,331–6,270) | 2,869 (2,432–3,044) |
| 1 file, 100 MiB | 104.9 MB | 310.8 (264.1–353.3) | 685 (658–734) | 1,759 (1,715–1,838) |

The cold and warm series were run at different times on a shared VM, so the differences between them include run-to-run noise as well as the cost of the disk read.

The same scripts were run again on 2026-10-19 (`bench/run_all.sh` and `bench/run_cold.sh`; raw output in bench/results-2026-10-19.txt and bench/results-cold-2026-10-19.txt). This is a different machine from the 2026-10-11 tables: a shared Linux VM with 4 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Ubuntu 24.04.5, Python 3.12.3, Node v22.23.3, Playwright 1.56.1, Chromium 141.0.7390.37, Firefox 142.0.1. Disks were built the same way. Byte sizes were 228,060 (100 files), 2,305,070 (1,000 files), 9,289,070 (4,000 files), and 104,858,694 (one 100 MiB file). Medians of 5 runs (min–max), in ms. Warm page cache:

| Disk | .orb size | orb.py | Chromium page | Firefox page |
|---|---|---|---|---|
| 100 files | 0.23 MB | 4.1 (3.8–6.1) | 37 (36–41) | 22 (20–23) |
| 1,000 files | 2.3 MB | 40.2 (38.5–46.0) | 206 (202–313) | 192 (189–220) |
| 4,000 files | 9.3 MB | 166.6 (163.6–188.2) | 1,763 (1,726–2,923) | 1,732 (1,701–1,779) |
| 1 file, 100 MiB | 104.9 MB | 151.1 (148.1–188.7) | 658 (649–665) | 1,337 (1,326–1,349) |

Cold cache, same day, same machine, after the warm series. Before every timed run the script ran `sync` and `echo 3 > /proc/sys/vm/drop_caches` via passwordless sudo (`bench/drop_cache.sh`), then `bench/resident.py` (mincore). All 60 `resident_bytes_before_each_run` values were 0. The same caveat applies: this is cold in the guest page cache, and the host may still cache the virtio disk. Medians of 5 runs (min–max), in ms:

| Disk | .orb size | orb.py, cold | Chromium page, cold | Firefox page, cold |
|---|---|---|---|---|
| 100 files | 0.23 MB | 5.3 (4.8–6.0) | 41 (39–50) | 25 (22–49) |
| 1,000 files | 2.3 MB | 43.4 (41.5–48.5) | 370 (345–425) | 209 (206–218) |
| 4,000 files | 9.3 MB | 192.0 (183.5–208.6) | 1,954 (1,848–2,026) | 1,928 (1,894–2,043) |
| 1 file, 100 MiB | 104.9 MB | 204.4 (197.8–209.4) | 756 (750–783) | 1,452 (1,446–1,524) |

These 2026-10-19 guest numbers are not a comparison against the 8-vCPU 2026-10-11 machine.

The same two scripts also ran once on a GitHub-hosted runner on 2026-10-19. The workflow run is [39296171414](https://github.com/baresteelx-star/blobfs-orb/actions/runs/39296171414) (`benchmarks` / job `open-time`), which started at 2026-10-19T17:40:46Z and finished successfully. The job recorded its environment at 2026-10-19T17:41:25Z: 4 vCPUs, model name `INTEL(R) XEON(R) PLATINUM 8573C`, 15 GiB RAM, Ubuntu 24.04.5 LTS, kernel `6.17.0-1022-azure`, Python 3.12.15, Node v20.20.2, Playwright 1.56.1. That Playwright release's browser pins, which the job installed with `npx playwright install --with-deps chromium firefox`, are Chromium 141.0.7390.37 and Firefox 142.0.1. Raw logs are bench/results-gha-2026-10-19.txt, bench/results-gha-2026-10-19-env.txt, and bench/results-cold-gha-2026-10-19.txt. Disk byte sizes matched the local disks. Medians of 5 runs (min–max), in ms. Warm page cache:

| Disk | .orb size | orb.py | Chromium page | Firefox page |
|---|---|---|---|---|
| 100 files | 0.23 MB | 6.0 (5.7–7.5) | 56 (55–66) | 29 (28–41) |
| 1,000 files | 2.3 MB | 59.4 (57.6–64.6) | 494 (437–500) | 268 (260–273) |
| 4,000 files | 9.3 MB | 254.7 (251.5–259.4) | 2,403 (2,352–5,618) | 2,367 (2,351–2,400) |
| 1 file, 100 MiB | 104.9 MB | 155.3 (154.1–156.6) | 754 (749–758) | 1,572 (1,546–1,592) |

Chromium's five warm runs on the 4,000-file disk were 5,618, 4,181, 2,403, 2,352, and 2,397 ms. The median is 2,403 ms. The first two runs are the high end of that range.

Cold cache, same job, after the warm series. Before every timed run the script ran `sync` and `echo 3 > /proc/sys/vm/drop_caches` via passwordless sudo (`bench/drop_cache.sh`), then `bench/resident.py` (mincore). All 60 `resident_bytes_before_each_run` values were 0. Cold means cold in the runner's page cache. Medians of 5 runs (min–max), in ms:

| Disk | .orb size | orb.py, cold | Chromium page, cold | Firefox page, cold |
|---|---|---|---|---|
| 100 files | 0.23 MB | 7.7 (7.5–9.0) | 70 (60–90) | 44 (33–46) |
| 1,000 files | 2.3 MB | 66.1 (63.2–71.1) | 458 (448–487) | 292 (290–296) |
| 4,000 files | 9.3 MB | 267.8 (265.8–281.7) | 2,451 (2,416–2,505) | 2,357 (2,310–2,422) |
| 1 file, 100 MiB | 104.9 MB | 522.8 (521.7–526.8) | 1,081 (1,072–1,109) | 1,879 (1,877–1,892) |

The 2026-10-11 machine, the 2026-10-19 guest, and this GitHub-hosted runner are three different environments. The tables are not a comparison between them.

## 6. Future Work: Planned User Study

No user study has been run; this section describes a planned study, and no results are reported or implied. A concrete plan for the 2D page only is `docs/user-study-plan.md` (16 people, folders as the baseline, study mode for local logs). It has not been run. The sketch below still includes a 3D condition, and there is no 3D prototype, so that sketch cannot be run as written. A small study with 12 to 16 people would turn the design paper into a research paper. Each participant would use three interfaces in balanced order: BlobFS in 3D, BlobFS in a flat 2D view of the same format, and an ordinary folder window. The 2D condition separates the effect of the merge operation from the effect of 3D.

Planned procedure: give each participant a realistic set of about 60 files (photos, audio takes, text notes) with a different but comparable set per interface. Ask them to organize however they like, no time pressure. A day later, ask them to find 15 files from short descriptions, timing each search and noting failures. Finish with a questionnaire on effort and ease, and a ten-minute interview.

Planned measures: time and failures when finding files a day later (the main comparison with folders); number of merges, splits, and undos (shows whether people use fusion and how often they reverse it); share of suggested merges accepted (directly comparable with KondoCloud's 25.5%); perceived effort and ease (folders are known to be low-effort, so this is the fair test).

Practical steps (not yet taken): run a pilot with three people first. The study needs ethics approval from whichever university hosts it; an HCI group would normally handle that.

## 7. Limitations

- No user study yet. The folder literature points the other way on effort, so the study is not optional.
- The mass constant C is 1 MiB (1,048,576 bytes) in the browser page (`BODY = 1024 * 1024` in blobfs-2d.html, also written into every saved .orb header as `constantMass`). It is a chosen value, not derived or measured. The Python reference orb.py uses the same value (`C = 1048576`) and refuses a file whose header says otherwise.
- The repulsion coefficient is tuned, not derived.
- Performance measurements are small open-time benchmarks (Section 5): orb.py and the browser page in Chromium and Firefox, at 100 to 4,000 files and one 100 MiB file, warm and with the page cache dropped. The 2026-10-11 series is the 8-vCPU machine. The 2026-10-19 guest series is the 4-vCPU machine named in that section. The 2026-10-19 GitHub Actions series is the hosted runner named in that section, one successful workflow run. The runtime of the original 73-check browser suite was never recorded and that script was not recovered. The 60-check rebuild of 2026-10-11, the 101-check run of 2026-10-16, the 106-check run of 2026-10-19, and the 110-check run of 2026-10-20 are the browser-suite timings reported in Section 5.
- The zip profile has not been formally specified. The page writes uncompressed (STORE) zip32 archives with its own inline writer and reads STORE and DEFLATE (DEFLATE needs the browser's DecompressionStream); orb.py writes STORE zip32 and reads what Python's zipfile reads. The format is strict about what it reads and tolerant about what it writes, but this should be tightened.
- There is no ZIP64: a single file of 4 GiB or more is refused, and so is a save that would exceed 4 GiB in total or 65,535 entries. On 2026-10-19 a sparse file of exactly 4 GiB was refused through the page's file input (Section 5); the bytes of that file were not allocated. A save that actually exceeds 4 GiB in total was not built. Files of the built-in sample disk are synthetic placeholders, marked `"payload":"placeholder"` in the saved records; imported, added and dropped files are stored as their real bytes.
- The related-work search relied on openly accessible records, including the ACM Digital Library; IEEE Xplore full texts were not reviewed.
- 3D delivery (VR, haptics, light fields) is far future; the prototype is a browser page.

### Future work: AI curation and gaze

This is proposed future work, not a claim. An AI curator could learn from the event log BlobFS already keeps (merges, splits, refusals, renames, tags, unpacks) together with a local, on-device record of opens, plays and exports; the 2D prototype now keeps such a record for opens, plays and exports, but no model has been trained on it. The rule would mirror the physics rule: the AI may suggest merges, shown as the same amber Accept / Keep apart prompt, but never commit them. Small undoable actions (a tag, a rename, a new folder) might run automatically, but each must land in the history like any other event and carry an Undo that appends a reversing event rather than erasing anything.

Gaze may later replace the mouse for deictic references, so that "merge this into that" resolves "this" and "that" to the orbs being looked at. Voice comes first: the 2D prototype has a typed and spoken command bar (Web Speech API, Chrome and Edge only) with fuzzy name matching that asks rather than guesses when a name is ambiguous. Eye tracking is not implemented or tested. On 2026-10-19 the spoken path was exercised in Playwright by installing a fake Web Speech API and delivering scripted recognition results (Section 5). A real microphone, real audio, and the browser speech service were not used.

## 8. Conclusion

BlobFS combines kind-typed fusion of distinct objects into a new stored container, refusals recorded as events, a human as the one who commits, and a self-describing archive with content-addressed payloads. The format is real — two implementations agree, the tests pass, and the narrow four-part claim survives a literature sweep. What remains is the user study (planned future work). The idea is that a disk should organize itself around what you do, and that nothing you merge should ever be gone for good.

## References

[Full reference list in paper/related-work.md, references 1–37.]

---

*Working copy. Gaps marked [TODO] are real and should be filled before submission.*
