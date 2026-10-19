# Changelog

## 1.0.0

Prepared 2026-10-19. This version is not tagged and has no GitHub release. The repository owner creates the tag.

The release, when tagged, is the `.orb` format and the two implementations of it:

- `blobfs-2d.html`, the browser page
- the `orb` package (`src/orb`), a standard-library Python reference, also runnable as `python orb.py` from a checkout
- `demo.orb`, the sample archive

`pip install .` installs the `orb` command (`verify` and `info`). The package has not been uploaded to PyPI.

The repository has no `LICENSE` file. Add one before publishing to PyPI, and set that license in Zenodo when the release is minted. `.zenodo.json` and `CITATION.cff` intentionally omit a license.

Verified behavior and open-time numbers are in `paper/blobfs-paper.md`. This changelog does not repeat them.
