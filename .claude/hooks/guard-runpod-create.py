#!/usr/bin/env python3
"""MPI-450 close-out — PreToolUse block on `POST /runpod/pods`, which RENTS A GPU.

`routes/runpodRemote.js` mirrors RunPod's REST verbs one-for-one, so
`router.post('/runpod/pods')` is **createPod**. Read as "list my pods" and called
with an empty body, RunPod fills in account defaults and you get a running GPU at
~$0.74/hr named `my pod` — which does NOT match `_sweepOrphanPods`' exact
`p.name === 'cubric-vision'` test, so the app's own orphan sweep will never reap
it. It bills until a human opens the RunPod console.

This is a hook and not a rule because the rule already existed and lost. The trap
was written up in memory `tool_probe_a_runpod_pod_for_ground_truth.md` on
2026-08-09 after it rented three 4090s — and fired again on 2026-08-10, same
session shape, same `head -c 300` that truncates the reply before the `id`,
leaving rentals that cannot even be named. Prose in a file loaded on demand does
not fire at the moment of action. A check does.

What it does NOT block, deliberately:
  * `GET /runpod/pods`            — the read-only inventory added in 7293d1b4.
                                    This is the thing you actually wanted.
  * `POST /runpod/pods/<id>/start|stop`, `DELETE /runpod/pods/<id>` — real
                                    lifecycle verbs on a Pod you already named.
  * `POST /remote/pod/create`     — the app's INTENTIONAL create path, which is
                                    tracked, named `cubric-vision`, and reapable.

Blocking is the whole point, so it exits 2. If a future task genuinely needs the
raw create, use `/remote/pod/create` — or say so and lift this deliberately.

Run self-check:  python guard-runpod-create.py --selftest
"""
import json
import re
import sys

# The bare collection endpoint: /runpod/pods NOT followed by another path segment.
# `/runpod/pods/<id>...` is a per-Pod verb and is none of our business.
_COLLECTION = re.compile(r"/runpod/pods(?![\w/-])")

# curl turns any of these into a POST even with no -X.
_POST_INTENT = re.compile(
    r"(-X\s*POST|--request\s+POST|-Method\s+POST"          # explicit
    r"|--data-raw|--data-binary|--data-urlencode|--data"    # curl body flags
    r"|(?<![\w-])-d(?![\w-])"                               # bare -d
    r"|(?<![\w-])-F(?![\w-])|--form"                        # multipart
    r")",
    re.IGNORECASE,
)

MESSAGE = """BLOCKED: this command POSTs to /runpod/pods, which RENTS A GPU.

That route is createPod, not a list. With an empty body RunPod picks account
defaults and you get a running GPU (~$0.74/hr, named `my pod`) that the app's
orphan sweep can never reap, because the sweep matches name == 'cubric-vision'.
It has already happened twice: 2026-08-09 (three 4090s) and 2026-08-10.

To SEE what is running:
    curl -s http://127.0.0.1:3000/runpod/pods

To DELETE strays, once you have their ids from that list:
    curl -s -X DELETE http://127.0.0.1:3000/runpod/pods/<id>
    curl -s -X POST http://127.0.0.1:3000/remote/pod/cleanup-orphans \\
         -H "Content-Type: application/json" -d '{"all":true,"keepActive":false}'

To CREATE a Pod on purpose, use the app's tracked path, not the raw mirror:
    POST /remote/pod/create

Never truncate a RunPod reply with `head -c` before reading its `id` - that is
how the last two rentals became unnameable."""


def is_blocked(command):
    """True when `command` would POST to the bare /runpod/pods collection."""
    if not command:
        return False
    return bool(_COLLECTION.search(command) and _POST_INTENT.search(command))


def _selftest():
    block = [
        "curl -X POST http://127.0.0.1:3000/runpod/pods -d '{}'",
        "curl -s http://127.0.0.1:3000/runpod/pods -H 'Content-Type: application/json' -d '{}'",
        "curl --request POST http://localhost:3000/runpod/pods",
        "curl -s --data-raw '{}' http://127.0.0.1:3000/runpod/pods | head -c 300",
    ]
    allow = [
        "curl -s http://127.0.0.1:3000/runpod/pods",
        "curl -s http://127.0.0.1:3000/runpod/pods | python -c 'import json,sys'",
        "curl -X POST http://127.0.0.1:3000/runpod/pods/abc123/stop",
        "curl -X DELETE http://127.0.0.1:3000/runpod/pods/abc123",
        "curl -s http://127.0.0.1:3000/runpod/pods/abc123",
        "curl -X POST http://127.0.0.1:3000/remote/pod/create -d '{}'",
        "curl -X POST http://127.0.0.1:3000/remote/pod/cleanup-orphans -d '{\"all\":true}'",
        "git commit -m 'docs: POST /runpod/pods rents a GPU'",
    ]
    bad = []
    for c in block:
        if not is_blocked(c):
            bad.append("MISSED (should block): " + c)
    for c in allow:
        if is_blocked(c):
            bad.append("FALSE POSITIVE (should allow): " + c)
    if bad:
        print("\n".join(bad))
        return 1
    # ASCII only: this console is cp1252, and a UnicodeEncodeError inside a hook
    # is a wedged session rather than a failed print.
    print("selftest OK - %d blocked, %d allowed" % (len(block), len(allow)))
    return 0


def main():
    if "--selftest" in sys.argv:
        return _selftest()
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # unreadable payload must never wedge the session
    if payload.get("tool_name") != "Bash":
        return 0
    command = (payload.get("tool_input") or {}).get("command", "")
    if is_blocked(command):
        sys.stderr.write(MESSAGE + "\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
