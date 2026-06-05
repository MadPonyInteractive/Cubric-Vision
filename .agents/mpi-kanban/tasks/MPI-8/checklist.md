# Checklist

Implementation checklists are derived by `mpi-continue` when work starts. This
file records the high-level MPI-8 release gates.

## Planning Gates

- [x] Rebuild MPI-8 plan after codebase validation.
- [x] Record current repo/release/update/LLM decisions in project memory.
- [x] Treat old long portable plan as historical input, not executable truth.
- [ ] Reconcile or archive stale LLM/llama language in historical docs if it
  becomes confusing during implementation.

## Portable Runtime Gates

- [ ] Portable env/root contract implemented.
- [ ] Remaining bare ffmpeg/ffprobe shell route removed.
- [ ] `/open-folder` made cross-platform.
- [ ] Custom-node ZIP extraction no longer depends on Mac/Linux `7zip-bin`
  module load.
- [ ] Permanent app identity and icon assets added.

## Build, Update, And Manifest Gates

- [ ] Full portable build/staging script implemented.
- [ ] GitHub-source updater implemented.
- [ ] Local update-zip updater implemented for early access/offline delivery.
- [ ] `resources/cubric/connector-manifest.json` staged and smoke-asserted.
- [ ] `resources/cubric/update-manifest.json` generated from staged artifacts.
- [ ] Build hash injected and error reporter labels updated.

## Platform Gates

- [ ] Windows artifact extracts, launches, installs/repairs engine, installs or
  seeds a model, generates one image, restarts cleanly, and updates safely.
- [ ] Linux artifact extracts and launches on Ubuntu; engine/setup path is
  validated as far as weak hardware allows.
- [ ] macOS artifact is produced and explicitly marked maintainer-untested.
- [ ] Contributor validation checklist exists for macOS and stronger Linux hosts.

## Release Gates

- [ ] Real `0.0.1` release notes replace placeholder copy.
- [ ] GitHub release asset names use Cubric Vision naming.
- [ ] Release copy states platform validation truthfully.
- [ ] No Vision LLM/llama claims remain in active release scope.
- [ ] No live connector runtime work has been added to Vision v1.
