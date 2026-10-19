# arXiv submission notes

This bundle was prepared for Kenneth Santala. Nothing in it has been submitted to arXiv, and this file is not an upload.

## Suggested title

Merge by Kind, Commit by Hand: The BlobFS File Format

## Abstract

1125 characters, under the 1920-character arXiv limit.

BlobFS is a file system where files are living blobs that attract, merge, and split. The contribution is narrow and specific. Merging as a recorded storage operation is not new (Git, Irmin, Ficus and Coda all do forms of it); to our knowledge, no prior system combines four things: (1) kind-typed fusion of distinct objects into a new stored container, (2) refused merges recorded as events, (3) propose-only operation with a human commit enforced at the storage layer, and (4) a self-describing per-object archive with content-addressed payloads. The .orb format stores real payloads deduplicated by SHA-256 hash. orb.py, a stdlib Python reference written to the shipped format, and the browser loader agree on all 22 blob and 20 object hashes of demo.orb, and files written by each open in the other. We do not claim BlobFS beats folders: the personal-file literature strongly favors browsing, and BlobFS builds nesting rather than removing it. We present the format, the merge rules, and the test results; a user study comparing BlobFS in 3D, BlobFS in 2D, and ordinary folders is planned future work and has not been run.

## Categories

- Primary: **cs.OS** (Operating Systems). The contribution is a file format and a storage operation.
- Cross-list: **cs.HC** (Human-Computer Interaction). The kind gate, the pile literature, and the planned study are interaction design.

If the author would rather lead with the interaction claim, swap those two. No other category is recommended.

## License

Recommend **CC BY 4.0** for the paper text. The repository has no `LICENSE` file, so that recommendation does not cover the code. arXiv also asks the submitter to grant arXiv a non-exclusive license at upload time; that grant is separate from CC BY. Do not upload until the author chooses.

## Files

| File | Role |
|---|---|
| `blobfs.tex` | LaTeX source. A self-contained conversion of `paper/blobfs-paper.md` plus the related-work argument. Working notes that are not paper prose (search status, claims to avoid) stay in `paper/related-work.md`. |
| `blobfs.bib` | Bibliography. Checked 2026-10-19. |
| `figures/blobfs-2d.png` | Screenshot of the 2D prototype with `stems.zip` open. |
| `blobfs.pdf` | Built with pdfLaTeX and BibTeX on TeX Live 2023 (10 pages, rebuilt 2026-10-19 after the GitHub Actions open-time run was recorded). |

Build, from this directory:

```sh
pdflatex blobfs
bibtex blobfs
pdflatex blobfs
pdflatex blobfs
```

Upload `blobfs.tex`, `blobfs.bib`, and `figures/blobfs-2d.png`. arXiv rebuilds the PDF. Do not upload the generated `.aux`, `.log`, `.bbl`, `.blg`, or `.out` files.

## Reference check (2026-10-19)

Crossref was queried for every DOI that Crossref indexes. USENIX, HAL, OpenReview, KIT, kernel.org, Perkeep, GitHub, and Wikipedia URLs were opened. Given names in `blobfs.bib` come from Crossref where it returned them.

Fixed:

- Mander, Salomon and Wong, CHI 1992, was cited as pp. 260–269. Crossref gives pp. 627–634. DOI `10.1145/142750.143055` is right.
- LSFS (ICLR 2025, arXiv:2410.11843) omitted Mingyu Jin and listed Yongye Su before him. The author list is Shi, Mei, Jin, Su, Zuo, Hua, Xu, Ren, Liu, Du, Deng, Zhang. The venue is ICLR 2025, confirmed on OpenReview.
- Venti's USENIX bibliographic title is "Venti: A New Approach to Archival Data Storage". The proceedings PDF title line omits "Data". The citation now uses the USENIX title and URL. ACM DL `10.5555/1973333.1973340` is not in Crossref.
- Data Domain's third author is R. Hugo Patterson, not "Patterson, H." alone. Pages 269–282 and FAST 2008 are right.
- YoloFS given names from Crossref are Shawn (Wanxiang) Zhong, Junxuan Liao, Jing Liu, and Mai Zheng. The previous initials match. SOSP 2026, Prague, pp. 353–378, DOI `10.1145/3830418.3843858` are right.
- Gifford et al., SOSP 1991: the fourth author is James W. O'Toole. An earlier draft wrote "O'Toole, Jr." Crossref does not include "Jr."

Flagged, not invented:

- SYSSPEC's ACM DL id `10.5555/3805485.3805503` is not in Crossref and was not confirmed. The USENIX FAST 2026 record matches the title, the six authors, Santa Clara, February 2026, and pp. 291–311. arXiv:2512.13047 is the preprint DOI `10.48550/arXiv.2512.13047`.
- Ficus's ACM DL id `10.5555/1267257.1267269` is not in Crossref. The USENIX Summer 1994 page confirms the title, authors, Boston, and pp. 183–195.
- Fossil (`http://p9f.org/sys/doc/fossil.pdf`) names Quinlan, McKie, and Cox and the title "Fossil, an Archival File Server". The document states no year, so the bibliography states none.
- TagFS at I-KNOW 2006 (Bloehdorn, Görlitz, Schenk, Völkel) is the KIT record `1000092138`. No DOI was found. A two-author WWW 2006 paper with the same title is a different document.
- US8402382B2 title, filing date 2007-04-18, grant date 2013-03-19, inventors Agarawala and Balakrishnan, and assignee Google Inc. were re-checked. Provisional `60/793,630` and application publication `US20090307623A1` were not re-fetched.
- Bergman, Tene-Rubinstein and Shalom is Personal and Ubiquitous Computing 17(3), pp. 583–590, print March 2013, online 21 April 2012. Citing 2013 is the print issue.
- Lifestreams is the CHI '96 companion, pp. 410–411, not a full paper. The subtitle in the citation is the Crossref subtitle.
- overlayfs, Perkeep, fsn, and BumpTop are living documents or encyclopedia pages. They are cited as retrieved on 2026-10-19, not as peer-reviewed papers.
- IEEE Xplore full texts were not reviewed.

DOIs that Crossref confirmed without a title, year, or venue mismatch: Agarawala CHI 2006, Amershi CHI 2019, Bergman and Whittaker MIT Press 2016, KondoCloud UIST 2021, Cockburn CHI 2002, Dourish TOIS 2000 18(2), Gifford SOSP 1991, Horvitz CHI 1999, FOLDER3D IVAPP 2010 (Luz, Masoodian, Rogers, De Schutter, pp. 149–152), Data Mountain UIST 1998, Elephant SOSP 1999, Ori SOSP 2013, PaPoC 2022, Unionfs ACM TOS 2(1) 2006, Harmony JCSS 73(4) 2007, FileWeaver UIST 2020, and YoloFS SOSP 2026.
