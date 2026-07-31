# MPI-414 Checklist

Derived from `brief.md` § Candidate fixes. The root cause is that **readiness is
judged by the wrong artifact**: `/engine/status` answers "does the venv python
exist", which on the uv path is true from step 1.

- [x] Retry routes on `/engine/version-check` (`installed !== null`) instead of `/engine/status`
- [x] `/engine/repair-deps` can no longer report success on an unstamped engine — it hands back to the full install
- [x] Blast radius swept: every `/engine/status` and `/engine/version-check` consumer classified (see `validation.md`)
- [x] `docs/comfy.md` engine-bootstrap retry contract updated to match the code
- [ ] Verified live: no stamp -> Retry reaches `/engine/download`, not `/engine/repair-deps` — **needs the Windows interrupted-install leg**
- [ ] Verified live: `/engine/repair-deps` on an unstamped engine runs the full install instead of broadcasting `engine:complete`

## Deliberately NOT done

- **No extra stamping.** A stamp exists only when `comfy install` exited 0, so
  stamping from any other path would produce the "green stamp on a broken
  engine" the brief calls worse than no stamp.
- **No live python-import readiness probe.** The stamp already implies `comfy
  install` succeeded; a probe is a second source of truth with a startup cost.
  Revisit only if a stamped engine is ever seen failing to boot.
- **`/engine/status` left in place** although this change makes it unused by
  live code. Pre-existing, and deleting a route is out of scope for a blocker
  fix — flagged, not removed.
