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

### 4.1 Delegating the commit

BlobFS can extend the commit rule without breaking it. The format already records merges, refusals and undos as events, so a delegation would be just another event type. A delegation event would state that an AI may commit merges of a given kind when its confidence is above a stated threshold. The storage layer would enforce it: every AI commit carries a reference to the delegation that allows it, and any commit outside that scope is rejected by the format. Revocation would be a new event, recorded in the history like any other, so the record shows exactly when authority was handed over and when it was taken back. The person never leaves the record: the AI commits, but the delegation event proves the person chose to let it. Delegation is itself a commit by hand — of authority rather than of a merge. The reference implementation does not yet implement delegation events.

## 5. Evaluation: Tests

The test suite covers the rules directly. Each line below is checked by `tests/test_orb.py` (20 tests), `tests/test_crosslang.py` (12 tests), `tests/browser_suite.js` (101 checks per browser), or more than one of those:

- Split math is exact. A file of 2,700,000 bytes and a file of 800,000 bytes merged, then split: the parent lost exactly the child's mass, 800,000 + C = 1,848,576 bytes, and parent mass plus child mass equaled the merged mass. Half of the two payload sizes is 1,750,000 bytes. That half is neither child's size, and it is not the mass that moved.
- The gate works both ways. With no shared tag, orbs held in contact are not proposed and are not merged, and a drop draws the refusal outline and bounces them apart. With a shared tag, a suggestion forms and waits (the amber pending state). Physics can propose that suggestion and cannot commit it. A same-kind drop commits as `human-drop`. A refusal leaves both blobs whole and is recorded.
- Dedup: three files with one duplicate stored two payloads.
- Round-trip: every file's bytes identical after open-and-extract; same ids, same tree.
- Integrity: a flipped payload whose zip CRC was recomputed is refused as a hash mismatch, and a CRC-header flip is refused as a CRC mismatch. The page opens a DEFLATE archive written by Python. The page's inline SHA-256 matches the known digest of "abc".
- Collisions: notes.txt and notes.txt become notes.txt and notes (2).txt. Both payloads survive.
- Nesting: a folder merged into another stays a sub-orb. Its files are not hoisted.
- History shows the move. Unmerge frees both files and leaves the merge event in the log.
- Cross-language: orb.py and the browser loader agree on all 22 blob and 20 object hashes of demo.orb, and files written by each open in the other (tests/test_crosslang.py: 12 tests, 9 pure-Python and 3 cross-language, each cross-language test run in Chromium and Firefox).

Browser page: `tests/browser_suite.js` is 101 automated Playwright checks of blobfs-2d.html, run headless in Chromium and Firefox from a local file. On 2026-10-16 both browsers passed 101/101 with zero console messages, page errors, or network requests (Chromium 10.94 s, Firefox 16.57 s, suite-reported, one run each). The checks cover rendering, the colour key, the command bar, merge rules including directory union and its undo, the kind gate, drag-and-drop commit, physics proposals that do not commit, recorded refusal, undo-as-event, local use-log events (open, play, and export), zorb unpack, .orb save/open round-trip with SHA-256 checks in Python, the undo stack and pending suggestions surviving save and reopen (undo after reopen restores both directories; a reopened suggestion can be accepted or refused), dropped files stored and reopened byte-exact, the 2,700,000-byte / 800,000-byte split, dedup, the notes.txt collision, a nested folder kept as a sub-orb, DEFLATE open, separate hash and CRC refusals, and the refusal of files of 4 GiB or more (still a File-like stub of that size; a real 4 GiB file was not created). The original 73-check script was not recovered. The 73/73 rows in the table are as reported on 2026-10-03 and were not re-run.

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

The original 73-check Playwright script (run 2026-10-03) was not kept, so its runtime was never recorded and its results cannot be reproduced; the two 73/73 rows above are as reported at the time. On 2026-10-11 a new suite, `tests/browser_suite.js`, was written from the description of that script and the page's features. That rebuild had 60 checks, not 73: rendering, the colour key, the command bar (help, unknown commands, open, rename, tag, undo, new folder, zoom, a typed "add files" opening no file picker, ambiguous names), the merge rules (dir∪dir as one directory after a human accept, a name clash renamed "cover1 (2)", undo of dir∪dir, file∪file making a new directory, file∪dir adopting the file, the kind gate), zorb unpack, dropped files keeping their SHA-256 in the page and in orb.py, .orb save and reopen, undo depth and pending suggestions surviving reopen (a reopened suggestion accepted and another refused, then undo after reopen restoring both directories of a saved dir∪dir merge), a second save on which orb.py and the page agree on every blob hash, a flipped bit refused, the 4 GiB refusal (tested with a File-like stub of size 4 GiB, since a real 4 GiB file was not created), the zip32 limits, and zero console messages, page errors and network requests. Raw output of the 60-check rebuild: tests/results-browser-suite-2026-10-11.txt. Those 60-check rows are the record of that rebuild. They are not the current suite.

On 2026-10-16 `tests/browser_suite.js` was expanded from 60 checks to 101, and `tests/test_orb.py` was added (20 tests). The added checks cover behavior the 60-check rebuild did not exercise, including what Section 5 already attributed to the suite: local use-log events, the 2,700,000 / 800,000 split, dedup to two payloads, the notes.txt disambiguator, a folder kept as a sub-orb, a physics suggestion that does not commit, a recorded refusal, unmerge leaving the merge event in the log, a same-kind drop recorded as a human commit, DEFLATE open, and a hash mismatch distinguished from a CRC mismatch. The 2026-10-16 run is one pass per browser, on a shared Linux VM with 4 vCPUs reported as "Intel(R) Xeon(R) Processor", 15 GiB RAM, Ubuntu 24.04.5. It is not the 8-vCPU machine used for the 2026-10-11 timings, and it was not repeated three times.

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

### 5.1 Planned user study (not yet run)

No user study has been run. This subsection describes a planned study. No participants have been recruited, and no results are reported or implied. The 3D interface is being built separately and does not exist yet. The study cannot start until it does, and it should not start until the 3D and 2D interfaces read and write the same .orb files and pass the same merge-rule checks as the 2D page (Section 5). The detailed plan here goes with the outline in Section 6.

The study has to answer the question the paper leaves open. Section 2 explains why. Browsing in folders is fast and well liked [Bergman et al. 2013], and 3D has slowed retrieval before [Cockburn and McKenzie 2002]. A 3D BlobFS that does worse than folders would not tell us whether the merge operation or the 3D view is to blame. So the 2D view of the same format is the fair control, and ordinary folders are the baseline.

#### Research questions

- **RQ1 (retrieval).** When people look for their own files after a delay, does BlobFS (3D or 2D) differ from ordinary folders in search time and failed searches?
- **RQ2 (organizing effort).** Does tidying a messy set of files take more or less time and perceived workload with merge-by-contact than with making folders and dragging files into them?
- **RQ3 (the commit gate).** When the format proposes a cross-kind merge that the task says is wrong (Section 4), do people refuse it? How often do they accept it by mistake, and how often do they undo afterwards?
- **RQ4 (3D vs 2D).** For the same format and the same merge rules, does the 3D view change time, errors, workload or preference compared with the flat 2D view?
- **RQ5 (proposals).** What share of the merges the physics suggests do people accept? This is the figure that compares directly with KondoCloud's 25.5% [Brackenbury et al. 2021].

#### Participants

We plan to recruit adults who manage their own files on a desktop or laptop every week. Recruitment would go through university mailing lists and notice boards at the host institution. We would exclude people who have seen or worked on BlobFS, and record each person's self-reported filing habits (mostly folders, mostly search, mostly desktop piles) and any prior use of 3D software or games. Section 6 asks for 12 to 16 people. We plan 12, or 18 if resources allow, because the design below needs a multiple of six to be fully counterbalanced. That count is set by the counterbalancing and by what one lab can run. It does not come from a power analysis. With no pilot data there is no effect size to base one on. The pilot (three people, see Section 6) would give rough variance estimates for task time, and if those suggest the plan is too small, the count will be revised before the main study. With this many people, the study can show large differences and point to design problems. It cannot show that two conditions are equivalent. Payment and consent would follow the host institution's ethics approval, which has not yet been sought.

#### Conditions

The design is within-subjects with three conditions:

- **3D.** BlobFS in the 3D interface now being built.
- **2D.** BlobFS in the flat view (blobfs-2d.html), with the same .orb format, the same merge rules, the same kind gate and the same amber Accept / Keep apart prompt.
- **Folders.** The ordinary file manager of the lab machine's operating system.

Each participant gets a different but comparable file set in each condition. Every set holds about 60 files (photos, audio takes, text notes, as in Section 6), with the same mix of kinds, the same number of duplicates and name clashes, and the same depth of starting mess. Any file used to plant a bad merge is built the same way in every set. Real payloads are used, not the placeholders of the built-in sample disk.

#### Counterbalancing

Three conditions have six possible orders. With 12 or 18 participants, each order is used equally often (two or three times), which is full counterbalancing. A 3×3 Latin square balances only position, while all six orders also balance which condition comes before which. That carryover matters here because organizing in one interface may teach habits that show up in the next. The three file sets are crossed with condition by a separate 3×3 Latin square, so that no set is always paired with the same interface. If the final count is not a multiple of six, we would fall back to a balanced Latin square and say so in the report.

#### Tasks

The tasks come from what the paper claims and tests:

1. **Organize a messy folder (T1).** A flat, untidy set of about 60 files. Instruction: "arrange these so you could find things later", with no time pressure. In BlobFS this means merging, splitting, tagging, renaming and creating folders. In Folders it means creating and moving folders. The task covers the three merge rules in Section 4 (directory ∪ directory, file ∪ file making a new directory, file ∪ directory adoption).
2. **Find files (T2).** Find 15 files from short descriptions ("the second take of the bass line", "the receipt photo from the trip"). This happens once right after T1 and again at the next session, about a day later (Section 6). It is the main comparison with folders.
3. **Refuse a bad merge (T3, BlobFS conditions only).** The set includes a photo and a song that share a tag by accident. Under Section 4, the neck forms, the merge waits as pending, and nothing moves until a person decides. The participant is told what each file is but not what to do with the prompt, and the correct response is Keep apart. We record the decision, whether it ends up in the history as a refusal, and any later undo. Folders have no proposal step, so T3 is not run there. Any comparison with folders on this task would be invented, so T3 results compare 3D with 2D only.
4. **Undo a merge (T4).** A merge of two directories that the participant did not want ("you merged Sessions and Masters by mistake; put them back"). In BlobFS the expected path is unmerge, which leaves the merge event in the history (Section 3). In Folders it means moving the files back by hand. We measure whether everything ends up in the right place.
5. **Handle a name clash (T5).** Combine two groups that each hold a `notes.txt`, then open the right one. This checks whether people read the `notes (2).txt` disambiguator correctly in BlobFS, compared with the operating system's own overwrite or rename dialog in Folders.
6. **Find a nested item (T6).** Find a file inside a folder that was merged in as a sub-orb, which tests whether people see that nesting survives (Section 3).

Delegation (Section 4.1) is not implemented, so it is not a study task. If it is built before the study, a follow-up study could test whether people understand and revoke a delegation event. This study does not.

#### Metrics

- **Task time.** Logged by the interface for BlobFS (from the event log plus task start and stop markers), and screen-recorded and coded for Folders. Failed or abandoned tasks are recorded separately and not timed as successes.
- **Error rate.** For T2, wrong files and failed searches (a search is called off after a fixed limit set in the pilot). For T3, accepted bad merges. For T4 to T6, items in the wrong place or the wrong copy opened. Undos and refusals are also counted as behaviour, not as errors.
- **Workload.** NASA-TLX [Hart and Staveland 1988] after each condition, on all six subscales. We plan to report both the weighted score and the unweighted (raw) score, and to decide in advance which one is primary.
- **Usability (secondary).** SUS [Brooke 1996] after each condition.
- **Preference.** A forced ranking of the three conditions at the end, with a reason for each rank given in the debrief interview.
- **Behaviour (BlobFS only).** Number of merges, splits, undos and refusals, and the share of physics proposals accepted (RQ5), all read from the .orb event log.

#### Protocol

The plan uses four sessions, so that every condition gets a delayed search:

- **Session 1:** consent, a background questionnaire, then condition A. This means training, T1, T3 (BlobFS only), the immediate T2, then the NASA-TLX and SUS.
- **Sessions 2 and 3:** the delayed T2 for the previous condition, then T4 to T6 in that condition. After that, the next condition starts with training, T1, T3 and the immediate T2, followed by the questionnaires.
- **Session 4:** the delayed T2 and T4 to T6 for the last condition, then the ranking and a debrief interview of about ten minutes.

Training for each interface uses a separate practice set and continues until the participant has done each operation once without help: merge, split, undo and refusal in BlobFS; create, move and rename in Folders. Delayed tasks always come before new training, so that learning a new interface cannot interfere with recall of the old one. Sessions are planned to last under an hour. The pilot will check that and the number of tasks.

#### Planned analysis

We will fix this plan before running the main study. Task time (log-transformed) will be analysed with linear mixed-effects models: condition as a fixed effect, position in the order as a covariate, and random intercepts for participant and file set. Error and success outcomes will use the binomial form of the same model. NASA-TLX, SUS and preference ranks will be compared with Friedman tests, followed by pairwise Wilcoxon signed-rank tests with Holm correction. The pairs that matter for the research questions are 3D vs 2D (RQ4), 2D vs Folders and 3D vs Folders (RQ1 and RQ2). T3 is analysed for the two BlobFS conditions only. Accepted-proposal shares (RQ5) are reported descriptively next to KondoCloud's figure, not tested against it. We will report effect sizes and confidence intervals as well as p-values. With so few participants, any result that is not significant will be reported as inconclusive, not as evidence of no difference. Interview notes will be coded thematically by two coders.

#### Threats to validity

- **Novelty and familiarity.** Every participant has used folders for years and has never seen BlobFS. Short training cannot remove that difference, and it works against BlobFS. We will report each person's filing habits and analyse by them.
- **Prototype maturity.** The 3D interface does not exist yet. When the study runs, it will be newer and less polished than the 2D page and much less polished than the operating system's file manager. Some differences may come from polish, not from the design. We would report its version and any known bugs.
- **Measurement differs by condition.** BlobFS times come from the event log and Folders times from coded video. Both will be checked against video for a subset of tasks.
- **Experimenter-designed tasks.** The file sets are synthetic and not the participants' own files. Bergman et al. [2013] studied people's own files, which are what folders are good at, so external validity is limited. Planting a bad merge for T3 also tells participants something about what the test is looking at.
- **Sample.** Volunteers from a university are not typical users, and the small count limits how far the results generalize.
- **Experimenter bias.** The author built BlobFS. Ideally someone else would run the sessions and code the videos, without being told which hypotheses matter.
- **Carryover.** Full counterbalancing balances order effects but cannot remove asymmetric transfer between two BlobFS views of the same format. We will check whether the order interacts with condition.

## 6. Future Work: Planned User Study

No user study has been run. The planned study is described in Section 5.1. In outline: 12 to 16 participants, each using BlobFS in 3D, BlobFS in 2D and an ordinary folder window in balanced order, with about 60 files (photos, audio takes, text notes) per interface and a delayed search about a day later. A pilot with three people comes first, and ethics approval has not yet been sought.

## 7. Limitations

- No user study yet. The folder literature points the other way on effort, so the study is not optional.
- The mass constant C is 1 MiB (1,048,576 bytes) in the browser page (`BODY = 1024 * 1024` in blobfs-2d.html, also written into every saved .orb header as `constantMass`). It is a chosen value, not derived or measured. The Python reference orb.py uses the same value (`C = 1048576`) and refuses a file whose header says otherwise.
- The repulsion coefficient is tuned, not derived.
- Performance measurements are small open-time benchmarks on one shared VM with a warm page cache and with the guest page cache dropped (Section 5): orb.py and the browser page in Chromium and Firefox, at 100 to 4,000 files and one 100 MiB file. The runtime of the original 73-check browser suite was never recorded and that script was not recovered. The 60-check rebuild of 2026-10-11 and the 101-check run of 2026-10-16 are the browser-suite timings reported in Section 5.
- The zip profile has not been formally specified. The page writes uncompressed (STORE) zip32 archives with its own inline writer and reads STORE and DEFLATE (DEFLATE needs the browser's DecompressionStream); orb.py writes STORE zip32 and reads what Python's zipfile reads. The format is strict about what it reads and tolerant about what it writes, but this should be tightened.
- There is no ZIP64: a single file of 4 GiB or more is refused, and so is a save that would exceed 4 GiB in total or 65,535 entries. Files of the built-in sample disk are synthetic placeholders, marked `"payload":"placeholder"` in the saved records; imported, added and dropped files are stored as their real bytes.
- The related-work search relied on openly accessible records, including the ACM Digital Library; IEEE Xplore full texts were not reviewed.
- 3D delivery (VR, haptics, light fields) is far future; the prototype is a browser page.

### Future work: AI curation and gaze

This is proposed future work, not a claim. An AI curator could learn from the event log BlobFS already keeps (merges, splits, refusals, renames, tags, unpacks) together with a local, on-device record of opens, plays and exports; the 2D prototype now keeps such a record for opens, plays and exports, but no model has been trained on it. The rule would mirror the physics rule: the AI may suggest merges, shown as the same amber Accept / Keep apart prompt, but never commit them. Small undoable actions (a tag, a rename, a new folder) might run automatically, but each must land in the history like any other event and carry an Undo that appends a reversing event rather than erasing anything.

Gaze may later replace the mouse for deictic references, so that "merge this into that" resolves "this" and "that" to the orbs being looked at. Voice comes first: the 2D prototype has a typed and spoken command bar (Web Speech API, Chrome and Edge only) with fuzzy name matching that asks rather than guesses when a name is ambiguous. Eye tracking is not implemented or tested.

## 8. Conclusion

BlobFS combines kind-typed fusion of distinct objects into a new stored container, refusals recorded as events, a human as the one who commits, and a self-describing archive with content-addressed payloads. The format is real — two implementations agree, the tests pass, and the narrow four-part claim survives a literature sweep. What remains is the user study (planned future work). The idea is that a disk should organize itself around what you do, and that nothing you merge should ever be gone for good.

## References

[Full reference list in paper/related-work.md, references 1–39.]

---

*Working copy. Gaps marked [TODO] are real and should be filled before submission.*
