# BlobFS: Related Work

## Summary

BlobFS's contribution is narrower than first stated, and still defensible: it fuses different objects into a new container under kind-typed rules, records refused merges as well as accepted ones, and lets the system only propose while a person commits. Merging as a recorded, reversible storage operation is not new on its own, since Git, Irmin, Ficus and Coda all do forms of it. The claim is the four-part combination: to our knowledge, no prior system combines (1) kind-typed fusion of distinct objects into a new stored container, (2) refused merges recorded as events, (3) propose-only / human commit at the storage layer, and (4) a self-describing per-object archive with content-addressed payloads.

Most of the surrounding ideas have strong ancestors, which makes the paper easier to place rather than weaker. Piles (1992) and BumpTop (2006) grouped files by putting them together, 3D file views date to the early 1990s, and content-addressed storage and version history are well established. Earlier grouping systems kept the grouping in the interface or in queries, and version-control stores record merges of versions of the same content. The clearest line for the paper is view versus stored operation: a union mount such as overlayfs merges directories only while mounted, while a BlobFS merge is stored and stays in the history. The research on personal files strongly favours browsing folders, and BlobFS fits that finding, because merging builds nesting rather than removing it. A small user study comparing BlobFS in 3D, BlobFS in 2D and ordinary folders is planned future work; it has not been run.

## Piles and physics desktops

Piles are BlobFS's nearest ancestors: groupings formed by putting things together rather than by naming a folder, and they have been studied since 1992.

- **The pile metaphor (Apple, 1992).** Mander, Salomon and Wong proposed piles as a desktop element for casual organisation, with browsing, direct manipulation and automatic pile construction and reorganisation by the system. System-suggested grouping is therefore not new.
- **BumpTop (Toronto, CHI 2006).** Agarawala and Balakrishnan built a physics desktop where objects have mass and friction, tossed items collide and pile up, and piles can be created and merged with a lasso gesture. Their evaluation was six participants in hour-long think-aloud sessions. The paper does not say whether piles were stored in the file system or only on screen.
- **What happened next.** BumpTop became a product, was acquired by Google in May 2010 (announced 2 May 2010, two days after the discontinuation notice) and discontinued the same month; the source code was released in 2012.

What BlobFS adds: in both systems the pile lives in the interface. In BlobFS the merge is an operation of the storage format itself, with a recorded history, an undo that is a new event, and a rule that only a person can commit it.

## 3D and spatial file browsing

3D file views are old and well studied, and the evidence on whether 3D helps memory is mixed, so BlobFS should not rest its case on 3D.

| System or study | Year | What it did | What it found |
|---|---|---|---|
| fsn, Silicon Graphics | early 1990s | 3D landscape of the directory tree on IRIX; seen in Jurassic Park (1993) | A view of the tree, not a new storage model |
| Data Mountain, Microsoft Research | UIST 1998 | 100 web pages placed freely on an inclined 3D plane | 32 users retrieved pages faster than with browser Favorites |
| Cockburn and McKenzie | CHI 2002 | 69 users arranged and retrieved up to 99 items in 2D, 2.5D and 3D, physical and virtual | Retrieval slowed from 3.7 s in 2D to 4.8 s in 3D; users found 3D more cluttered |
| FOLDER3D, Luz et al. (Trinity College Dublin, Waikato) | IVAPP 2010 | 3D cube view with virtual folders showing file relationships | Kept the folder tree on purpose; argues that replacing hierarchy outright ignores its value |

What this means for BlobFS: spatial placement can help (Data Mountain), but extra depth can hurt (Cockburn and McKenzie). The safe framing is that BlobFS's contribution is the merge operation and its history, and the 3D view is one possible interface over it. A 2D version of the same format would be a fair control in a study.

## Beyond the hierarchy

Every major alternative to folders so far groups files by query, time or property, which leaves the files themselves untouched. None makes combining two objects into a new one the basic operation.

| System | Year | How files are grouped | Storage underneath |
|---|---|---|---|
| Semantic File Systems, Gifford et al. (MIT) | SOSP 1991 | Virtual directories are queries over attributes extracted from file contents | A layer over an ordinary Unix file system, reached through NFS |
| Lifestreams, Fertig, Freeman and Gelernter (Yale) | CHI 1996 | One time-ordered stream; substreams are saved searches | Replaces folders and file names with time (two-page CHI '96 companion paper, not a full paper) |
| Placeless Documents, Dourish et al. (Xerox PARC) | TOIS 2000 | Documents organised by properties; active properties carry behaviour | Property-based document store |
| KondoCloud, Brackenbury et al. (Chicago) | UIST 2021 | Suggests moving or deleting files similar to ones the user just acted on | Ordinary cloud folders |

KondoCloud is the most useful comparison for BlobFS's suggested merges. Its 59 participants accepted 25.5% of 1,856 suggestions, and accepted delete suggestions more often (42.4%) than move suggestions (22.2%). Showing why a suggestion appeared helped people understand it. BlobFS already shows the reason for each suggestion (a shared tag or the same kind of file) and never acts without a person confirming, which fits these findings.

## What research on personal files says about folders

People strongly prefer browsing their own folders to searching for files, and this is the finding any new file system has to answer.

- **The field's main summary.** Bergman and Whittaker's book *The Science of Managing Our Digital Stuff* (MIT Press, 2016) argues that folders remain the better way to organise personal information than search, tags or other alternatives, because the same person both files and retrieves.
- **Why browsing wins.** In a dual-task experiment with 62 participants, retrieving a file by search took nearly three times as long as browsing, failed more often, and used more attention (Bergman, Tene-Rubinstein and Shalom, Personal and Ubiquitous Computing, 2013).

What this means for BlobFS: this works in BlobFS's favour if it is framed correctly. BlobFS does not throw away hierarchy: every merge creates nesting, a merged folder goes in as a sub-orb, and the contents can be browsed level by level. What changes is how the hierarchy is built, by bringing things together rather than by creating and naming a folder first. The paper should say this plainly, because a reviewer who knows this literature will look for it.

## Storage side: hashes, logs and history

The .orb format is built from well-proven parts, and the paper should credit them openly; the new part is what the log records, not the logging itself.

- **Content addressing.** Venti (Quinlan and Dorward, Bell Labs, FAST 2002) identified each stored block by a hash of its contents, which makes blocks write-once and lets identical blocks be stored once. Git uses the same principle. The .orb payload store, with SHA-256 names and automatic deduplication, follows this directly [16].
- **Fossil (Quinlan, McKie and Cox, Plan 9) [33].** A snapshotting file server that archives to Venti. Distinction: it snapshots a whole file tree over time; it has no operation that fuses two objects.
- **Data Domain (Zhu, Li and Patterson, FAST 2008) [34].** Hash-based deduplication engineered for backup throughput. Distinction: .orb dedups whole payloads inside one archive and makes no throughput claim.
- **Keeping history.** The Elephant file system (Santry et al., SOSP 1999) kept old versions of files so that deletions and overwrites could be undone, and let users name past versions by time.
- **CVFS (Soules et al., FAST 2003) [35].** Makes versioning metadata compact with journal-based metadata and multiversion B-trees. Distinction: versions of one file, not fusions of different files.
- **Provenance.** PASS (Muniswamy-Reddy et al., USENIX ATC 2006) [32] collects lineage automatically in the storage system. Distinction: PASS records how data was derived by processes; the .orb log records a person's merge, refuse and unmerge decisions.
- **State from a log.** Rebuilding the current state by replaying an append-only list of events is the established software pattern called event sourcing. The .orb log is a small instance of it.

## Merge as a storage operation already exists

The table compares what "merge" means in each system.

| System | What gets merged | Stored after merging | Refused merges recorded | Who decides |
|---|---|---|---|---|
| Git | Divergent histories of the same project, as a merge commit with two parents; git revert undoes by adding a commit; unrelated histories can be joined with a flag | Yes | No | A person runs the command |
| Irmin (Farinier, Gazagnaire, Madhavapeddy, JFLA 2015) | Versions of typed data structures, by three-way merge with a developer-supplied merge function, in a Git-like content-addressed store | Yes | No | The program |
| Perkeep | Nothing: content-addressed blobs plus signed claims that change a permanode, later claims taking precedence | No merge operation | No | No merge operation |
| overlayfs (Linux) | An upper and a lower directory, shown as one; the lower layer is never changed | No: the merge exists only while mounted | No | Whoever mounts it |
| Unionfs (Wright et al., ACM TOS 2006) [28] | Several branches unified into one namespace with Unix semantics | No: a namespace view over unchanged branches | No | Whoever mounts it |
| Ficus (Reiher et al., USENIX Summer 1994) [29] | Conflicting replicas of the same file, by type-specific resolvers | Yes | No | Resolvers; a person only when resolution fails |
| Coda (Kumar and Satyanarayanan, USENIX Winter 1995) [30] | Conflicting replicas of the same file after partition, by application-specific resolvers | Yes | No | Rule-selected resolvers; manual repair on failure |
| Harmony (Foster et al., JCSS 2007) [31] | Replicas of the same structured data, guided by schemas | Yes | No | The synchroniser |
| BlobFS | Two different objects, fused into a container under kind rules | Yes | Yes | The system proposes, a person commits |

What BlobFS adds: Git and Irmin reconcile versions of the same content, and Ficus and Coda go further at the file-system layer with type-specific resolvers, but all of them merge versions of the same object. BlobFS merges different objects into a new container. None of them records a refused merge, gates merges by kind of file, or limits the system to proposing. Unionfs, like overlayfs, unifies namespaces as a view. Overlayfs gives the sharpest contrast: its merge is a view that vanishes on unmount, while a BlobFS merge is stored and stays in the history until a later event undoes it.

**Ori grafting (Mashtizadeh et al., SOSP 2013).** Ori is a peer-to-peer FUSE file system that stores whole-file-system history, replicates it, and supports grafting: copy a subtree between file systems while preserving history, with later two-way re-sync. It is the closest storage-side neighbour found in the 2026-10-10 pass. Distinction: Ori grafts and shares directory history across devices and merges diverging replicas (three-way where possible). It does not fuse two distinct user objects into a new kind-typed container, does not log refused merges, and has no human-only commit gate for physics-proposed merges. Place it next to Git and Irmin in the related-work story.

**YoloFS (Zhong et al., SOSP 2026) [36].** An agent-native Linux file system that stages every mutation an AI agent makes until a person commits it, snapshots after each command so the agent can undo or travel back, and gates sensitive accesses with progressive allow/ask/deny rules. It is the closest prior found on the human-commit axis: like BlobFS, the storage layer holds changes until a person decides. Distinction: YoloFS stages ordinary file mutations; it does not fuse distinct objects into a new container, does not log refused merges as events, and does not gate operations by object kind.

**Refuse / fork at the app layer (optional).** *Merge What You Can, Fork What You Can't* (Schiefer, Litt and Jackson, PaPoC 2022) [27] argues that when automatic merge would break integrity, fork histories and keep both visible, with manual reconcile as a new event. That supports BlobFS's "refuse is first-class" framing at the application or data layer, not as a personal file-format primitive. Do not overclaim it as a file-system prior.

## Recent neighbours (novelty search, 2026)

Four recent systems were checked against the novelty claim. None makes fusion of distinct objects into a stored container the primitive.

- **SYSSPEC (Liu et al., FAST 2026).** A framework for *generative* file systems: LLMs generate and evolve file system code from formal specifications, demonstrated by producing SpecFS, a concurrent file system matching a manually-coded baseline across hundreds of regression tests. It builds file systems; it does not organise personal files. Different problem entirely.
- **LSFS (Shi et al., ICLR 2025).** An LLM-based semantic file system for prompt-driven file management in agent operating systems. It adds semantic syscalls (CRUD, group by, join) backed by a vector database and reports at least 15% retrieval accuracy improvement and 2.1x faster retrieval. It groups by query, not by contact: no merge operation, no history, no kind gate. The nearest recent cousin on the semantic-organisation axis.
- **LlamaFS (Arasanipalai, Reibman, Hegde et al., 2024, open source, iyaja/llama-fs).** A self-organising file manager powered by Llama 3 that renames and categorises files by content (images via Moondream, audio via Whisper), with batch and watch modes and accept-or-reject suggestions. It organises; it does not fuse. Cite alongside KondoCloud as the LLM-flavoured version of the suggestion pattern.
- **TagFS / SemFS (Bloehdorn et al., 2006).** A tag-based file system where directories become dynamic views over tag annotations stored as RDF, exposed via WebDAV or FUSE. A view layer over an ordinary store, not a storage operation. The paper already covers this family with Semantic File Systems; TagFS is a footnote.

## Positioning: what the paper can claim

The safe headline is specific: BlobFS fuses different objects into a stored container under kind rules, records refusals, and keeps a person as the one who commits. The line to draw is view versus stored operation, and fusing different objects versus reconciling versions of the same one.

Claims we can make, worded with "to our knowledge":

- BlobFS fuses different objects into a new container under kind-typed rules: two files make a new folder, a folder adopts a file, and the heavier of two folders adopts the lighter as a sub-folder. Git and Irmin merge versions of the same content instead.
- The format records refused merges as well as accepted ones, and a refused pair is not suggested again unless the two gain a new shared tag. No store we found records refusals.
- The system may only propose a merge, and a person must commit it. This brings mixed-initiative principles to the storage layer: act, ask or wait depending on confidence and cost (Horvitz, CHI 1999), plus easy dismissal, easy correction and showing why (Amershi et al., CHI 2019, guidelines 8, 9 and 11).
- The merge is stored, unlike a union mount such as overlayfs, where it is only a view while mounted.
- A container (.orb) carries real contents, deduplicated by hash, and opens identically in two independent implementations (Python and JavaScript), which the cross-language tests demonstrate.

Claims to avoid, and why:

| Claim to avoid | Why |
|---|---|
| The first file system with merge as a recorded, reversible storage operation | Git merge commits and git revert already do this, and Irmin (2015) generalises it to typed data |
| The first 3D file system | fsn showed a 3D file landscape in the early 1990s |
| The first physics-based grouping | BumpTop (2006) piled objects with physics and merged piles |
| The first system that suggests groupings | Piles (1992) and KondoCloud (2021) both did |
| Better than folders | No user evidence yet, and the folder literature points the other way |
| 3D improves memory | Cockburn and McKenzie (2002) found 3D slowed retrieval |

## Search status before submission (updated 2026-10-10)

- Patent check done: BumpTop is granted as US8402382B2 (pub. 2013-03-19; application US20090307623A1). Claims cover a physics desktop, piles, and gestural pile create/browse. Scope is interface and visualisation of display objects, not a storage format that records merge or refuse events or kind-typed fusion of payloads.
- Closest storage-side neighbour added above (merge section): Ori (SOSP 2013) grafting with history. ContextFS/AgentVFS is a lower-priority 2020s CAS neighbour (agent working trees, not personal-file fusion).
- Optional app-layer prior for refuse/fork: *Merge What You Can, Fork What You Can't* (PaPoC 2022). Local-first app state, not a file system.
- ACM DL structured sweep still useful; IEEE Xplore full text was not opened (subscription). Abstracts via Scholar remain a final-pass help.
- Novelty line after this pass still holds: no prior system found that combines (1) kind-typed fusion of distinct objects into a new stored container, (2) refused merges recorded as events, (3) propose-only / human commit at the storage layer, (4) self-describing per-object archive with content-addressed payloads.

## Suggested experiment (future work, not run)

A small, careful study with 12 to 16 people would turn the design paper into a research paper, and it can run on the prototype that already exists. Nothing below has been carried out.

**Design.** Each participant uses three interfaces in a balanced order: BlobFS in 3D, BlobFS in a flat 2D view of the same format, and an ordinary folder window. The 2D condition separates the effect of the merge operation from the effect of 3D, which the literature says may hurt.

**Procedure.**
1. Give each participant a realistic set of about 60 files (photos, audio takes, text notes) with a different but comparable set per interface.
2. Ask them to organise the files however they like, with no time pressure.
3. A day later, ask them to find 15 files from short descriptions, timing each search and noting failures.
4. Finish with a short questionnaire on effort and ease, and a ten-minute interview.

**What to measure.**

| Measure | Why it matters |
|---|---|
| Time and failures when finding files a day later | The main comparison with folders |
| Number of merges, splits and undos | Shows whether people use fusion and how often they reverse it |
| Share of suggested merges accepted | Directly comparable with KondoCloud's 25.5% |
| Perceived effort and ease | Folders are known to be low-effort, so this is the fair test |

Practical steps: run a pilot with three people first. The study needs ethics approval from whichever university hosts it; an HCI group would normally handle that, which is another reason to look for a collaborator.

## References

Pages actually opened for this review:

1. Agarawala, A. and Balakrishnan, R. Keepin' it real: pushing the desktop metaphor with physics, piles and the pen. CHI 2006. https://doi.org/10.1145/1124772.1124965
2. Amershi, S., Weld, D. et al. Guidelines for human-AI interaction. CHI 2019. https://doi.org/10.1145/3290605.3300233
3. Bergman, O. and Whittaker, S. The Science of Managing Our Digital Stuff. MIT Press, 2016. https://doi.org/10.7551/mitpress/9780262035170.001.0001
4. Bergman, O., Tene-Rubinstein, M. and Shalom, J. The use of attention resources in navigation versus search. Personal and Ubiquitous Computing, 2013. 17(3). https://doi.org/10.1007/s00779-012-0544-z
5. Brackenbury, W., McNutt, A., Chard, K., Elmore, A. and Ur, B. KondoCloud: improving information management in cloud storage via recommendations based on file similarity. UIST 2021. https://doi.org/10.1145/3472749.3474736
6. Cockburn, A. and McKenzie, B. Evaluating the effectiveness of spatial memory in 2D and 3D physical and virtual environments. CHI 2002. https://doi.org/10.1145/503376.503413
7. Dourish, P. et al. Extending document management systems with user-specific active properties (Placeless Documents). ACM Transactions on Information Systems, 2000. https://doi.org/10.1145/348751.348758
8. Farinier, B., Gazagnaire, T. and Madhavapeddy, A. Mergeable persistent data structures (Irmin). JFLA 2015.
9. Fertig, S., Freeman, E. and Gelernter, D. Lifestreams: an alternative to the desktop metaphor. CHI 1996. https://doi.org/10.1145/257089.257404
10. Gifford, D. K., Jouvelot, P., Sheldon, M. A. and O'Toole, J. W. Semantic file systems. SOSP 1991. https://doi.org/10.1145/121132.121138
11. Horvitz, E. Principles of mixed-initiative user interfaces. CHI 1999. https://doi.org/10.1145/302979.303030
12. Linux kernel documentation. Overlay filesystem.
13. Luz, S., Masoodian, M., Rogers, B. and De Schutter, S. FOLDER3D: a graphical file management system supporting visualisation of file relationships. IVAPP 2010. https://doi.org/10.5220/0002824801490152
14. Mander, R., Salomon, G. and Wong, Y. Y. A "pile" metaphor for supporting casual organization of information. CHI 1992, pp. 260 to 269. https://doi.org/10.1145/142750.143055
15. Perkeep. Overview and permanode schema.
16. Quinlan, S. and Dorward, S. Venti: a new approach to archival storage. FAST 2002. ACM DL record: https://doi.org/10.5555/1973333.1973340
17. Robertson, G. et al. Data Mountain: using spatial memory for document management. UIST 1998. https://doi.org/10.1145/288392.288596
18. Santry, D. S. et al. Deciding when to forget in the Elephant file system. SOSP 1999. https://doi.org/10.1145/319151.319159
19. File System Visualizer and SGI fsn. Wikipedia.
20. BumpTop company history. Wikipedia.

Git and event sourcing are described from general knowledge; their primary pages could not be opened during this search.

Added from the 2026 novelty search:

21. Liu, Q., Zou, M., Zhang, H., Du, D., Xia, Y. and Chen, H. Sharpen the Spec, Cut the Code: A Case for Generative File System with SYSSPEC. 24th USENIX Conference on File and Storage Technologies (FAST 26), Santa Clara, CA, February 2026, pp. 291–311. ACM DL record: https://doi.org/10.5555/3805485.3805503. Preprint arXiv:2512.13047.
22. Shi, Z., Mei, K., Su, Y., Zuo, C., Hua, W., Xu, W., Ren, Y., Liu, Z., Du, M. and Deng, D. and Zhang, Y. From Commands to Prompts: LLM-based Semantic File System for AIOS. arXiv:2410.11843, ICLR 2025.
23. Arasanipalai, A. (iyaja), Reibman, A., Hegde, A. et al. LlamaFS: a self-organizing file manager (llama-fs). GitHub: https://github.com/iyaja/llama-fs, 2024. (Earlier "Jain, I." attribution was wrong: the repository owner is Ajay Arasanipalai; top contributors are areibman (Alex Reibman), AshwinHegde and iyaja.)
24. Bloehdorn, S., Görlitz, O., Schenk, S. and Völkel, M. TagFS: Tag Semantics for Hierarchical File Systems. I-KNOW 2006.
25. Agarawala, A. et al. US8402382B2, System for organizing and visualizing display objects. Filed 2007-04-18 (provisional 60/793,630, 2006-04-21); granted 2013-03-19; assignee Google Inc. Application US20090307623A1 (pub. 2009-12-10). Claims cover a physics desktop, piles, and gestural pile create/browse; interface and visualisation of display objects, not storage fusion. (Was cited as the application number only; upgraded after the 2026-10-10 patent check.)
26. Mashtizadeh, A., Bittau, A., Huang, Y. F. and Mazières, D. Replication, history, and grafting in the Ori file system. SOSP 2013. https://doi.org/10.1145/2517349.2522721
27. Schiefer, N., Litt, G. and Jackson, D. Merge What You Can, Fork What You Can't: Managing Data Integrity in Local-First Software. PaPoC '22 (9th Workshop on Principles and Practice of Consistency for Distributed Data), Rennes, April 2022, pp. 24–32. https://doi.org/10.1145/3517209.3524041. Optional cite for refuse/fork as an app-level prior; not a file system.

Added 2026-10-10 (storage-side and merge neighbours):

28. Wright, C. P., Dave, J., Gupta, P., Krishnan, H., Quigley, D. P., Zadok, E. and Zubair, M. N. Versatility and Unix semantics in namespace unification (Unionfs). ACM Transactions on Storage 2(1), 2006. https://doi.org/10.1145/1138041.1138045. Distinction: unifies branches as a namespace view; the branches are not fused into a new stored object.
29. Reiher, P., Heidemann, J., Ratner, D., Skinner, G. and Popek, G. J. Resolving file conflicts in the Ficus file system. USENIX Summer 1994 Technical Conference, Boston, pp. 183–195. ACM DL record: https://doi.org/10.5555/1267257.1267269. Distinction: type-specific resolvers merge conflicting replicas of the same file.
30. Kumar, P. and Satyanarayanan, M. Flexible and safe resolution of file conflicts. USENIX 1995 Technical Conference (Winter), New Orleans, January 1995. Distinction: Coda's application-specific resolvers reconcile versions of the same file after partition.
31. Foster, J. N., Greenwald, M. B., Kirkegaard, C., Pierce, B. C. and Schmitt, A. Exploiting schemas in data synchronization (Harmony). Journal of Computer and System Sciences 73(4), 2007. https://doi.org/10.1016/j.jcss.2006.10.024. Distinction: schema-guided synchronisation of replicas of the same structured data.
32. Muniswamy-Reddy, K.-K., Holland, D. A., Braun, U. and Seltzer, M. Provenance-aware storage systems (PASS). USENIX ATC 2006, Boston. Distinction: records process lineage automatically; .orb records human merge and refuse decisions.
33. Quinlan, S., McKie, J. and Cox, R. Fossil, an archival file server. Plan 9 documentation. http://p9f.org/sys/doc/fossil.pdf. Distinction: snapshots a whole tree into Venti; no object-fusion operation.
34. Zhu, B., Li, K. and Patterson, H. Avoiding the disk bottleneck in the Data Domain deduplication file system. FAST 2008, pp. 269–282. Distinction: high-throughput segment dedup for backup; .orb dedups whole payloads per archive.
35. Soules, C. A. N., Goodson, G. R., Strunk, J. D. and Ganger, G. R. Metadata efficiency in versioning file systems (CVFS). FAST 2003. Distinction: compact metadata for versions of one file, not fusion of different files.
36. Zhong, S. (W.), Liao, J., Liu, J., Zheng, M., Arpaci-Dusseau, A. C. and Arpaci-Dusseau, R. H. Don't Let AI Agents YOLO Your Files: Information and Control in Agent-Native Filesystems (YoloFS). SOSP 2026, Prague. https://doi.org/10.1145/3830418.3843858. Distinction: stages file-system mutations until a person commits, with snapshots/undo and access gates; closest prior on the human-commit axis; does not fuse distinct objects, log refused merges, or gate by kind.
