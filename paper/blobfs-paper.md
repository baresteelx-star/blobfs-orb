# BlobFS: A Self-Organizing File System Where Merge Is a Storage Operation

**Kenneth S.**

## Abstract

BlobFS is a file system where files are living blobs that attract, merge, and split. The contribution is narrow and specific: merge is a storage operation of the format itself, not a view in the interface. Two different objects fuse into a new container under kind-typed rules; the merge is stored with an append-only event log; a refused merge is recorded rather than erased; and the system may only propose while a person commits. The .orb format stores real payloads deduplicated by SHA-256 hash, and two independent implementations — Python and JavaScript — open the same file hash-for-hash. We do not claim BlobFS beats folders: the personal-file literature strongly favors browsing, and BlobFS builds nesting rather than removing it. We present the format, the merge rules, the test results, and a planned user study comparing BlobFS in 3D, BlobFS in 2D, and ordinary folders.

## 1. Introduction

Folders are a filing-cabinet metaphor from the eighties. They work because the same person both files and retrieves, and browsing beats searching by nearly three to one in dual-task experiments [Bergman et al. 2013]. But the metaphor has a cost: organization is a chore you do by hand, and the structure you build is brittle — a wrong folder is a wrong place, and moving things means remembering where they went.

BlobFS inverts the relationship. Files are blobs with mass, kind, and tags. Similar files attract each other; when they touch, the format proposes a merge; a person confirms or refuses; and the result is a new stored object with history. The disk organizes itself around what you actually do, and every fusion is reversible.

The contribution is not 3D, not physics, and not self-organization on its own — all of those have ancestors. It is the combination: kind-typed fusion of distinct objects as a stored operation, refusals recorded alongside accepts, and a human commit gate enforced by the format.

## 2. Related Work

[See paper/related-work.md for the full related work section, including the merge table comparing Git, Irmin, Perkeep, overlayfs, and BlobFS.]

### 2.1 Piles and physics desktops

Piles [Mander et al. 1992] and BumpTop [Agarawala and Balakrishnan 2006] grouped files by putting them together rather than naming a folder. BumpTop gave objects mass and friction and merged piles with a lasso gesture. In both systems the grouping lives in the interface. In BlobFS the merge is an operation of the storage format, with recorded history and a human commit gate.

### 2.2 3D and spatial file browsing

3D file views date to the early 1990s (fsn on SGI IRIX). Data Mountain [Robertson et al. 1998] showed spatial placement can help retrieval; Cockburn and McKenzie [2002] found 3D slowed it (3.7s in 2D vs 4.8s in 3D). FOLDER3D [Luz et al. 2010] kept the folder tree on purpose. The safe framing: BlobFS's contribution is the merge operation; 3D is one possible interface, and a 2D version of the same format is the fair control.

### 2.3 Beyond the hierarchy

Semantic File Systems [Gifford et al. 1991], Lifestreams [Fertig et al. 1996], Placeless Documents [Dourish et al. 2000], and KondoCloud [Brackenbury et al. 2021] all group files by query, time, or property — leaving the files untouched. KondoCloud's 59 participants accepted 25.5% of 1,856 suggestions, which is treated as a design input: suggestions are mostly refused, so physics may propose and cannot commit.

### 2.4 Storage side: hashes, logs, and history

Venti [Quinlan and Dorward 2002] identified blocks by content hash — write-once, deduplicated. The Elephant file system [Santry et al. 1999] kept old versions for undo. Event sourcing rebuilds state by replaying an append-only log. The .orb format uses all three, but what is new is what the log records: accepted merges, refused merges, splits, and unmerges as first-class events.

### 2.5 Merge as a storage operation

Git merge commits and git revert already make merge a recorded, reversible storage operation. Irmin [Farinier et al. 2015] generalizes it to typed data structures with three-way merge. Perkeep has content-addressed blobs but no merge operation. overlayfs merges directories as a view that vanishes on unmount. The line to draw: Git and Irmin reconcile versions of the same content; BlobFS fuses different objects into a new container. Neither records refusals nor gates merges by kind.

### 2.6 Recent neighbours

SYSSPEC (FAST 2025) generates file system code from formal specs — it builds systems, it does not organize files. LSFS (ICLR 2025) is an LLM-based semantic file system with a group-by syscall — it groups by query, not by contact. LlamaFS (2024) renames and categorizes files by content with accept-or-reject suggestions — it organizes, it does not fuse. TagFS (2006) makes directories dynamic views over tags — a view layer, not a storage operation. None makes fusion of distinct objects into a stored container the primitive.

## 3. The .orb Format

An .orb file is a zip archive. Inside: a magic header, then records. Each blob is a record with an id, kind (file or directory), name, mass, children, and a content hash. Child links are separate records pointing parent to child. Merge events are their own record type — timestamp, the two source ids, the result id, and a detail string. Positions live in a separate record type, deliberately decoupled from identity.

Payloads are stored once under their SHA-256 hash in an objects/ directory. Identical bytes are stored once: three files with one duplicate became two payloads. A flipped bit is caught when the orb is opened — the hash check fails and the file refuses to load.

Name collisions get a disambiguator: notes.txt and notes.txt become notes.txt and notes (2).txt, never a silent overwrite. A folder merged into another goes in as a sub-orb, not flattened. Undo is a new event that leaves the merge visible in the history — nothing vanishes.

The format is implemented twice: orb.py as the reference, and a JavaScript port using JSZip for the browser. The cross-language test opens the same demo.orb in both and checks every hash. A merge saved from the browser opens cleanly in Python.

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
- Cross-language: Python and JavaScript agree hash-for-hash on the same .orb.

[TODO: total test count, per-row numbers, runtime, open time against event count.]

## 6. Evaluation: Planned User Study

A small study with 12 to 16 people would turn the design paper into a research paper. Each participant uses three interfaces in balanced order: BlobFS in 3D, BlobFS in a flat 2D view of the same format, and an ordinary folder window. The 2D condition separates the effect of the merge operation from the effect of 3D.

Procedure: give each participant a realistic set of about 60 files (photos, audio takes, text notes) with a different but comparable set per interface. Ask them to organize however they like, no time pressure. A day later, ask them to find 15 files from short descriptions, timing each search and noting failures. Finish with a questionnaire on effort and ease, and a ten-minute interview.

Measure: time and failures when finding files a day later (the main comparison with folders); number of merges, splits, and undos (shows whether people use fusion and how often they reverse it); share of suggested merges accepted (directly comparable with KondoCloud's 25.5%); perceived effort and ease (folders are known to be low-effort, so this is the fair test).

Practical steps: run a pilot with three people first. The study needs ethics approval from whichever university hosts it; an HCI group would normally handle that.

## 7. Limitations

- No user study yet. The folder literature points the other way on effort, so the study is not optional.
- The mass constant C is [TODO: not yet derived or measured].
- The repulsion coefficient is tuned, not derived.
- Performance measurements are [TODO: not yet taken].
- The zip profile between Python's zipfile and JSZip has not been formally specified; the format is strict about what it reads and tolerant about what it writes, but this should be tightened.
- The ACM DL sweep is now free (ACM went fully open access January 2026), but the IEEE Xplore full-text sweep still needs access or author PDFs.
- 3D delivery (VR, haptics, light fields) is far future; the prototype is a browser page.

## 8. Conclusion

BlobFS makes merge a storage operation: kind-typed fusion of distinct objects, stored with history, refusals recorded, a human as the one who commits. The format is real — two implementations agree, the tests pass, and the novelty claim survives a literature sweep when worded narrowly. What remains is the user study, the performance numbers, and the paywalled index check. The idea is that a disk should organize itself around what you do, and that nothing you merge should ever be gone for good.

## References

[Full reference list in paper/related-work.md, references 1–25.]

---

*Working copy. Gaps marked [TODO] are real and should be filled before submission.*