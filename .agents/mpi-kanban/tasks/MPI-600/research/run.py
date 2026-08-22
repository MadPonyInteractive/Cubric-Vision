"""MPI-600 bench runner - queue klein_9b_bench.json on the standalone bench (port 8188).

Bench artifact, not app code. Nothing here ships.

    python run.py --set 304.int=4 --set 111.filename_prefix=klein_9b/base/run

Every knob is a --set on the API-prompt JSON: NODE.input=value, type inferred.
Samples GPU memory throughout and reports peak, wall clock, execution_cached and
the files that landed.

ponytail: no config file, no class hierarchy - the graph IS the config, --set edits it.
"""

import argparse
import io
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GRAPH = os.path.join(HERE, "klein_9b_bench.json")
HOST = "http://127.0.0.1:8188"
OUT_ROOT = r"D:\WORK\Images\Outputs"


def post(path, payload):
    req = urllib.request.Request(
        HOST + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def get(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


class VramSampler(threading.Thread):
    """nvidia-smi streaming every 500ms. Peak is a sampled read, not one after-the-fact call."""

    def __init__(self):
        super().__init__(daemon=True)
        self.samples = []
        self.stop_flag = threading.Event()
        self.proc = None

    def run(self):
        self.proc = subprocess.Popen(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits", "-lms", "500"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        for line in self.proc.stdout:
            if self.stop_flag.is_set():
                break
            line = line.strip()
            if line.isdigit():
                self.samples.append(int(line))

    def stop(self):
        self.stop_flag.set()
        if self.proc:
            self.proc.terminate()


def coerce(raw):
    for cast in (int, float):
        try:
            return cast(raw)
        except ValueError:
            pass
    low = raw.lower()
    if low in ("true", "false"):
        return low == "true"
    return raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", dest="sets", action="append", default=[],
                    help="NODE.input=value, e.g. 304.int=4")
    ap.add_argument("--label", default="run", help="label for the console report")
    ap.add_argument("--timeout", type=int, default=1800)
    ap.add_argument("--dump", default=None, help="write the resolved graph here and exit")
    args = ap.parse_args()

    with io.open(GRAPH, encoding="utf-8") as f:
        graph = json.load(f)

    for s in args.sets:
        target, _, raw = s.partition("=")
        nid, _, field = target.partition(".")
        if nid not in graph:
            sys.exit("no node %s in the graph" % nid)
        graph[nid]["inputs"][field] = coerce(raw)

    if args.dump:
        with io.open(args.dump, "w", encoding="utf-8", newline="\n") as f:
            json.dump(graph, f, indent=1)
        print("dumped ->", args.dump)
        return

    print("=== %s ===" % args.label)
    for nid in ("27", "14", "15", "304", "324", "325", "33", "99", "203", "204", "111"):
        print("  %-4s %-24s %s" % (nid, graph[nid]["class_type"],
                                   json.dumps(graph[nid]["inputs"])[:160]))

    sampler = VramSampler()
    sampler.start()
    time.sleep(1.5)
    idle = max(sampler.samples) if sampler.samples else 0

    t0 = time.time()
    res = post("/prompt", {"prompt": graph, "client_id": "mpi600-bench"})
    pid = res["prompt_id"]
    print("queued %s" % pid)

    hist = None
    while time.time() - t0 < args.timeout:
        time.sleep(2)
        h = get("/history/" + pid)
        if pid in h:
            hist = h[pid]
            break
    wall = time.time() - t0
    sampler.stop()
    time.sleep(0.3)

    if hist is None:
        sys.exit("TIMEOUT after %.0fs - no history entry for %s" % (wall, pid))

    status = hist.get("status", {})
    cached = []
    for msg in status.get("messages", []):
        if msg[0] == "execution_cached":
            cached = msg[1].get("nodes", [])

    peak = max(sampler.samples) if sampler.samples else 0
    files = []
    for nid, out in (hist.get("outputs") or {}).items():
        for img in out.get("images", []):
            files.append(os.path.join(OUT_ROOT, img.get("subfolder", ""), img["filename"]))

    print("--- result ---")
    print("status          :", status.get("status_str"), "| completed:", status.get("completed"))
    print("wall clock      : %.1fs (includes queue + model load)" % wall)
    print("execution_cached: %d nodes %s" % (len(cached), cached[:12]))
    print("VRAM idle/peak  : %d / %d MiB  (delta %d MiB, card 16380)" % (idle, peak, peak - idle))
    print("samples         :", len(sampler.samples))
    for p in files:
        print("output          :", p, "EXISTS" if os.path.exists(p) else "*** MISSING ***")
    if not files:
        print("output          : NONE - check status messages below")
        print(json.dumps(status, indent=1)[:2000])


if __name__ == "__main__":
    main()
