"""Post a bench graph to 8188, wait, and pull every file it wrote over /view.

MpiSaveVideo does NOT write to <ComfyUI>/output on this bench (it runs with
--output-directory D:\\WORK\\Images\\Outputs), so fetching over /view is the only
path that does not need to know where the bench points today.

Run it UNDER THE LEASE - guard-gpu only matches a literal /prompt in a Bash
command, so a dispatch from inside a .py is invisible to it:

    python <mpi-lib>/scripts/gpu_lease.py run -- python dispatch.py arm_a1_bare.json out/

and assert on the artefact, never the exit code: the lease exits 0 WITHOUT
running the command on timeout.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BENCH = 'http://127.0.0.1:8188'


def post(graph):
    body = json.dumps({'prompt': graph, 'client_id': 'mpi591-bench'}).encode()
    req = urllib.request.Request(BENCH + '/prompt', body, {'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))['prompt_id']
    except urllib.error.HTTPError as e:
        sys.exit('REJECTED by the bench:\n' + e.read().decode('utf-8', 'replace'))


def wait(pid, poll=10):
    t0 = time.time()
    while True:
        h = json.load(urllib.request.urlopen('%s/history/%s' % (BENCH, pid), timeout=60))
        if pid in h:
            return h[pid], time.time() - t0
        q = json.load(urllib.request.urlopen(BENCH + '/queue', timeout=30))
        running = len(q.get('queue_running', []))
        print('  %5.0fs  running=%d pending=%d' % (
            time.time() - t0, running, len(q.get('queue_pending', []))), flush=True)
        if not running and not q.get('queue_pending'):
            # gone from the queue and never reached history: it died
            time.sleep(5)
            h = json.load(urllib.request.urlopen('%s/history/%s' % (BENCH, pid), timeout=60))
            if pid in h:
                return h[pid], time.time() - t0
            sys.exit('prompt %s left the queue without landing in history' % pid)
        time.sleep(poll)


def fetch(entry, out_dir):
    """Pull every {filename, subfolder, type} the run reported. Returns paths."""
    os.makedirs(out_dir, exist_ok=True)
    got = []
    for node_id, out in entry.get('outputs', {}).items():
        for key, items in out.items():
            if not isinstance(items, list):
                continue
            for it in items:
                if not (isinstance(it, dict) and 'filename' in it):
                    continue
                url = '%s/view?filename=%s&subfolder=%s&type=%s' % (
                    BENCH, urllib.parse.quote(it['filename']),
                    urllib.parse.quote(it.get('subfolder', '')), it.get('type', 'output'))
                dest = os.path.join(out_dir, it['filename'])
                try:
                    data = urllib.request.urlopen(url, timeout=300).read()
                except urllib.error.HTTPError as e:
                    print('  #%s %s %s -> /view %s' % (node_id, key, it['filename'], e))
                    continue
                with open(dest, 'wb') as f:
                    f.write(data)
                print('  #%s %s -> %s  (%.1f MB)' % (node_id, key, dest, len(data) / 1e6))
                got.append(dest)
    return got


def main(graph_path, out_dir):
    graph = json.load(open(graph_path))
    pid = post(graph)
    print('dispatched %s  (%d nodes)' % (pid, len(graph)), flush=True)
    entry, secs = wait(pid)
    status = entry.get('status', {})
    print('\nstatus: %s  wall %.1fs' % (status.get('status_str'), secs))
    for kind, payload in status.get('messages', []):
        if kind == 'execution_cached' and payload.get('nodes'):
            print('  SERVED FROM CACHE: %s' % sorted(payload['nodes']))
        if kind in ('execution_error', 'execution_interrupted'):
            print('  %s: %s' % (kind, json.dumps(payload)[:2000]))
    print('\nfiles:')
    got = fetch(entry, out_dir)
    if not got:
        sys.exit('NO FILES - the run produced nothing to measure')
    json.dump(entry, open(os.path.join(out_dir, 'history_%s.json' % pid), 'w'), indent=1)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: dispatch.py GRAPH.json OUT_DIR')
    main(sys.argv[1], sys.argv[2])
