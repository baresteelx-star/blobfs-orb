"""Build benchmark .orb disks with orb.py.
usage: python bench/make_disk.py files N out.orb      # N files of 1 KiB random bytes, merged pairwise (file+file)
       python bench/make_disk.py big MB out.orb       # one file of MB MiB random bytes
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import orb
mode, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
d = orb.Disk()
if mode == "files":
    ids = [d.add_file(f"f{i}.bin", os.urandom(1024)) for i in range(n)]
    for i in range(0, n - 1, 2):
        d.merge(ids[i], ids[i + 1])
else:
    d.add_file("big.bin", os.urandom(n * 1024 * 1024))
orb.save(d, out)
