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
import re
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


def log_entries(since=None):
    """Raw bench log as a list. format.md: it carries the tqdm bar, so anything printed from
    it must be .encode('ascii','replace')'d or Windows cp1252 dies with UnicodeEncodeError.

    Marked by TIMESTAMP, not by index - the endpoint keeps only the last 300 entries, so
    len()-before/len()-after slicing silently returns an empty list on a busy log.
    """
    try:
        d = get("/internal/logs/raw")
    except Exception:
        return []
    ents = d.get("entries", []) if isinstance(d, dict) else list(d)
    if since:
        ents = [e for e in ents if e.get("t", "") > since]
    return ents


def log_mark():
    ents = log_entries()
    return ents[-1].get("t") if ents else ""


def sampler_seconds(entries):
    """Sampler-only wall clock, and ComfyUI's own prompt total, off the log.

    Wall clock from --label covers queue + a constant ~5-8s RAM->VRAM load, which DILUTES a
    speed ratio. The tqdm bar is the sampler alone: `4/4 [00:17<00:00, 4.45s/it]`.
    """
    txt = "".join(e.get("m", "") if isinstance(e, dict) else str(e) for e in entries)
    bars = re.findall(r"(\d+)/(\d+) \[(\d+):(\d+)<", txt)
    sampler = None
    for done, total, mm, ss in bars:
        if done == total:
            sampler = int(mm) * 60 + int(ss)
    m = re.findall(r"Prompt executed in ([\d.]+) seconds", txt)
    return sampler, (float(m[-1]) if m else None)


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
    ap.add_argument("--link", dest="links", action="append", default=[],
                    help="NODE.input=SRC,IDX - rewire a link, e.g. 170.model=900,0")
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

    for s in args.links:
        target, _, raw = s.partition("=")
        nid, _, field = target.partition(".")
        src, _, idx = raw.partition(",")
        if nid not in graph or src not in graph:
            sys.exit("no node %s or %s in the graph" % (nid, src))
        graph[nid]["inputs"][field] = [src, int(idx or 0)]
        print("link %s.%s -> [%s, %s]" % (nid, field, src, idx or 0))

    if args.dump:
        with io.open(args.dump, "w", encoding="utf-8", newline="\n") as f:
            json.dump(graph, f, indent=1)
        print("dumped ->", args.dump)
        return

    print("=== %s ===" % args.label)
    for nid in ("27", "14", "15", "304", "324", "325", "33", "99", "203", "204", "111"):
        print("  %-4s %-24s %s" % (nid, graph[nid]["class_type"],
                                   json.dumps(graph[nid]["inputs"])[:160]))

    mark = log_mark()

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

    samp, prompt_total = sampler_seconds(log_entries(mark))

    print("--- result ---")
    print("status          :", status.get("status_str"), "| completed:", status.get("completed"))
    print("wall clock      : %.1fs (includes queue + model load)" % wall)
    print("sampler only    : %s s | prompt executed: %s s" % (samp, prompt_total))
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
