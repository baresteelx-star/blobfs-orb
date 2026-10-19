"""Time orb.load(path, verify=True) on a file. usage: python bench/py_open.py file.orb [runs]"""
import json, os, statistics, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import orb
p, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 5
ts = []
for _ in range(n):
    t = time.perf_counter(); orb.load(p, verify=True); ts.append((time.perf_counter() - t) * 1000)
print(json.dumps({"file": os.path.basename(p), "runs_ms": [round(x, 1) for x in ts], "median_ms": round(statistics.median(ts), 1)}))
