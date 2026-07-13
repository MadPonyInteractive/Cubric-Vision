# 05 — Verify (Definition of Done)

An app is done when ALL of these pass. Read [README](README.md) first.

## Automated

- **Inject-title test** — add a case to `tests/inject-params-titles.test.cjs` asserting every
  `Input_*` (declared in the op's `mediaInputs`) and every `Output_*` capture title EXISTS in the
  app's workflow. The injector SILENTLY SKIPS a title with no matching node, so a typo ships as a
  dead control. Run: `node --test tests/inject-params-titles.test.cjs` → all green.
- **`node --check`** every touched JS file.
- **`operation_registry.json` valid JSON** and carries the new op with `"universal": true`.

## Live (user-driven — a real gen mutates the project + spins the GPU)

Real generations are the USER's to run. The agent verifies render + code + the automated checks;
the user drives the end-to-end live run. Confirm each:

- [ ] App tile shows in the App Library with the correct availability badge (Ready for a no-model
      app; "Get models"/Install for a model app). Open enabled in a project.
- [ ] Each declared media slot renders (drop zone per type, numbered, up to cap). No `media` key →
      no upload UI.
- [ ] **Empty-run guard**: an app with declared slots + none filled + no prompt → Run pops
      `ui:warning` ("{App} needs at least one input"), no gen fires. Media-free apps skip this.
- [ ] **Each media type injects**: drop image/video/**audio** → Run → the output reflects THAT
      input. (The MPI-259 audio bug: output kept the source's own audio because `Input_audio` was
      never injected — verify your inputted audio actually applies. An app-vs-browser divergence is
      an APP-SIDE injection bug, see [02](02-media-io.md).)
- [ ] **Multi-output**: an app with N `Output_*` nodes lands N cards (self-gated — fewer if some
      inputs empty); the result pane shows all that landed; ONE "Generating…" placeholder during
      the run.
- [ ] **Storage**: a dropped file lands in `Media/.preview-assets/` (NOT a new gallery card).
- [ ] **Status bar** shows progress during the run (STITCHING/GENERATING + timer), at the BOTTOM of
      the app overlay (not collapsed to the top).
- [ ] **Ctrl+Enter** runs the OPEN app, not the PromptBox behind it; works again after closing.
- [ ] **Reuse**: reuse an app card → reopens the App with its inputs restored, across a restart
      (sidecar `appId`/`appInputs` hydrate) and in the same session (live item).
- [ ] **Install** (model app): from a clean state, the detail footer drives each model's download
      with a visible aggregate % bar; badge flips Get-models → Ready → Open.

## Both-engine note

Gen-core edits (the `comfyController` media-kind sweep + inject) touch the SHARED path all media
ops use — verify LOCAL and REMOTE. A local-only test does not verify remote (media paths upload to
the Pod via `_uploadRemoteMedia`).
