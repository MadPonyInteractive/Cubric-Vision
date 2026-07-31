# MPI-407 Validation

**LIVE-VERIFIED on Linux 2026-07-30**, ThinkPad X121e / Ubuntu 22.04, portable
build `CubricVision-linux-x64-v1.3.0.tar.gz` from mpi-ci run 30589473208
(SHA `addc03a2`). GitHub `Date:` header read `Thu, 30 Jul 2026 23:46:25 GMT` when
this was written; board stamps run ahead of true UTC, so card timestamps follow
the board's existing sequence.

## Reproducing the race deliberately

The first launch after extracting did **not** trip it — the server bound in
0.8 s because untarring left every file in the page cache. That is not a pass,
it is no evidence. Dropping the cache reproduces the original cold-start
conditions:

```sh
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches
./start-with-terminal.sh
```

Worth keeping: **a warm-cache launch cannot test this card.** Any future
re-test must drop caches or cold-boot first.

## Result — verbatim

```
[2026-07-30T23:44:21.027Z] [INFO] [mask-temp] session=79f0469f-…
[2026-07-30T23:44:25.909Z] [INFO] [server] injected env (0) from .env
[main] Server signal timed out, attempting to create window anyway...
[2026-07-30T23:44:32.650Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 1
[2026-07-30T23:44:33.715Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 2
[2026-07-30T23:44:35.149Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 3
[2026-07-30T23:44:35.819Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 4
[2026-07-30T23:44:36.382Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 5
[2026-07-30T23:44:36.939Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 6
[2026-07-30T23:44:37.496Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 7
[2026-07-30T23:44:38.049Z] [WARN] [system] Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 8
[2026-07-30T23:44:38.105Z] [INFO] [server] [server.js] App initialization started
[2026-07-30T23:44:38.527Z] [INFO] [system] Server started at http://127.0.0.1:3000
[main] Server signaled ready.
[2026-07-30T23:44:42.383Z] [INFO] [gpu-detect] Starting GPU detection...
[2026-07-30T23:44:42.501Z] [INFO] [update] portable check — current=1.3.0 latest=1.2.0
```

- Server bound **13.5 s** after launch — the same class of delay as the original
  11.6 s finding, well past the 5000 ms fallback.
- 8 retries logged, then **silence**: retry 9 succeeded, so no warning was
  emitted. The `did-fail-load` handler at `main.js:399` is what closed the hole.
- User confirmed the window painted and **"app started normally"**.
- `gpu-detect` and the update check fire after — both renderer-driven, so the
  page was genuinely live, not an error page.

Pre-fix, this identical sequence ended at the first `ERR_CONNECTION_REFUSED`
with a permanently black window and no user-accessible recovery.

The 5000 ms constant was deliberately left alone. It still times out here, and
that is fine — the retry, not the threshold, is the fix.

## Side finding — NOT part of this card

The same log carries:

```
[2026-07-30T23:44:34.338Z] [WARN] [main] Splash failed to load: ERR_FAILED (-2)
  loading 'file:///…/app/splash/splash.html'
```

`splash/splash.html` **is** present in the artifact, and the user reports this
happens on the first run on every platform, not only Linux. Tracked as
**MPI-410**; it is pre-existing and does not affect this card's result.
