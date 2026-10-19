"""Cold-cache variant of py_open.py: before EACH run, sync + drop the page cache (bench/drop_cache.sh),
record how much of the file is resident (bench/resident.py, mincore), then time orb.load(path, verify=True).
usage: python bench/py_cold_open.py file.orb [runs]"""
import json, os, statistics, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import orb
def resident(p):
    try: return int(subprocess.run([sys.executable, os.path.join(HERE, "resident.py"), p], capture_output=True, text=True, check=True).stdout)
    except Exception: return None
p, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 5
ts, res = [], []
for _ in range(n):
    subprocess.run([os.path.join(HERE, "drop_cache.sh")], check=True)
    res.append(resident(p))
    t = time.perf_counter(); orb.load(p, verify=True); ts.append((time.perf_counter() - t) * 1000)
print(json.dumps({"mode": "cold", "file": os.path.basename(p), "runs_ms": [round(x, 1) for x in ts],
                  "median_ms": round(statistics.median(ts), 1), "resident_bytes_before_each_run": res}))
