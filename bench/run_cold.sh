#!/bin/sh
# Cold-cache open-time benchmark: same disks as run_all.sh; page cache dropped before every timed run.
# Needs passwordless sudo (bench/drop_cache.sh), node + playwright (NODE_PATH) with chromium and firefox.
set -e; cd "$(dirname "$0")/.."; T=${TMPDIR:-/tmp}/orb-bench-cold; mkdir -p $T
for n in 100 1000 4000; do python3 bench/make_disk.py files $n $T/f$n.orb; done
python3 bench/make_disk.py big 100 $T/big100.orb
for f in f100 f1000 f4000 big100; do
  ls -l $T/$f.orb
  python3 bench/py_cold_open.py $T/$f.orb 5
  for b in chromium firefox; do node bench/page_cold_open.js $b $T/$f.orb 5; done
done
