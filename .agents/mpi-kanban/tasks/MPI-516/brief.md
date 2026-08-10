# MPI-516 — a destroyed prompt hangs the app forever

**Deferred to 1.5 by Fabio, 2026-08-10.** Surfaced by MPI-450's H3 smoke investigation.

**Severity was revised UPWARD the same day — do not read the original framing.** This was
first carded as "needs a prompt to vanish mid-flight, which no ordinary user action
produces". That is WRONG, and Fabio found what disproves it: ComfyUI PR #15446 (kijai,
merged 2026-08-09), "Optimize MiniMax-H3 VAE". The H3 VAE assembled the full decoded video
in VRAM, cast a second full-size float32 copy, and `sd.py` duplicated it again on CPU, so
**decode peak memory grew linearly with video length** — measured 3485MB VRAM / +7089MB RAM
at 175 frames. A user generating a long H3 video on a card without that headroom OOMs at
decode. An OOM kills the ComfyUI process; on a Pod that is `ComfyManager._supervise ->
os._exit(1)`, which takes the container down. The app then reads a dead engine, every
`_pollHistory` bail path says "still running", and the bar freezes forever.

So the ordinary user path is: **generate a long H3 video with too little memory -> hang with
no error.** Still deferred to 1.5 on Fabio's call so 1.4 can ship, but the reason is "we
chose to", not "it cannot be reached".

Note the fix is NOT ours and we do not have it: the PR merged after v0.31.0 shipped, and we
pin v0.30.0. It lands in a future engine bump — which makes it an argument for the next
bump, not a reason to hold 1.4.

## The bug

`_pollHistory` in `js/services/comfyController.js` settles a generation by reading
ComfyUI's `/history/<promptId>`. Three separate paths bail out of that read, and **all
three mean the same thing to the caller — "still running":**

```js
const resp = await fetch(histUrl);
if (!resp.ok) return;              // :1061  transport/HTTP failure
const data = await resp.json();
entry = data?.[promptId];
} catch (_) { return; }            // :1064  proxy/wrapper not ready
if (!entry) return;                // :1067  absent from history
```

`:1067` is the load-bearing one. "Absent from history" is genuinely ambiguous — it is the
normal state of a running prompt for its entire runtime, AND the permanent state of a
prompt that no longer exists. The poll cannot separate them, so when a prompt is destroyed
the loop spins forever and the promise never settles.

The user sees: a progress bar frozen at whatever percent it reached. No error, no toast,
nothing in the log. On a remote Pod they are billed for the whole time they sit watching a
generation that is already dead.

## The fix, and the trap in it

`scripts/smoke-workflows.mjs` already solved exactly this. Its `orphanReason` separates the
two cases with three signals rather than one: absent from history **AND** absent from the
queue **AND** the engine still answering. ComfyUI holds every accepted prompt in history or
the queue, so absent-from-both while the engine is up means the prompt is gone.

**Port the detector WITH its guard, not just its logic.** On 2026-08-10 that same detector
was found to have a false-positive path: it guarded the queue read against a failed fetch
but not the history re-read, so a transient relay error read as "absent" and manufactured a
verdict. Fixed in `tests/smoke-orphan-guard.test.cjs` — read that test before porting. The
distinction that matters is **"could not read" vs "read, and it was not there"**, and only
the second is evidence. Porting the naive version would trade today's silent hang for a
spurious error, which is not obviously better.

Note the app-side twin needs the same care about WHERE it reads: local `httpBase()` is the
ComfyUI origin, the remote leg goes through `/proxy/*`. MPI-152/156 is the standing lesson
about getting that wrong.

## Scope

- Owner file: `js/services/comfyController.js` (`_pollHistory` / `_startHistoryPoll`).
- Must settle the promise through the SAME error surface a normal failure uses, so the lane
  frees and the next queued job dispatches — see MPI-461, which fixed twelve bare
  `exec.onError` early returns that leaked lanes exactly this way.
- Both engines. Local and remote both poll; a fix to one is a half-wire.

## Verification

Reproduce by destroying a prompt under a running generation: dispatch, then restart ComfyUI
underneath it (the dev radial's restart on the local engine is the cheap path — MPI-501 used
it). Today: frozen bar, forever. Fixed: an actionable error, the lane freed, a log line.
