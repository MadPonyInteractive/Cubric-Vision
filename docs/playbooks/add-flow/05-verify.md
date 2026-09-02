# 05 — Verify (Definition of Done)

A flow is done when ALL of these pass. Read [README](README.md) first.

## Automated

- **Inject-title test** — add a case to `tests/inject-params-titles.test.cjs` asserting every
  `Input_*` (declared in the op's `mediaInputs`) and every `Output_*` capture title EXISTS in the
  flow's workflow. The injector SILENTLY SKIPS a title with no matching node, so a typo ships as a
  dead control (the shared silent-skip trap — [../common/inject-titles-guard.md](../common/inject-titles-guard.md)).
  Run: `node --test tests/inject-params-titles.test.cjs` → all green.
- **`node --check`** every touched JS file.
- **`operation_registry.json` valid JSON** and carries the new op with `"universal": true`.
- **🔴 Touched `js/data/flowsRegistry.js`? Run the flow desktop specs BEFORE pushing:**
  ```bash
  npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js
  ```
  `npm test` does NOT cover these — Playwright desktop runs in CI ONLY, so a collision here
  surfaces as a red master on somebody else's card, minutes after you pushed. ~10s each
  locally, on their own port; a dev app on `:3000` is left alone. **A flow's `requiredDeps`
  are read by OTHER flows' specs**: on 2026-09-02 MPI-664 declared the 4.88GB enhancer dep
  on `minimax-music`, the uninstall dialog's derived total moved 13.4GB → 18.2GB, and
  MPI-682's spec — which had the figure typed in — reddened master for four hours. The
  literal is gone, but the coupling is not.

## Live (user-driven — a real gen mutates the project + spins the GPU)

Real generations are the USER's to run. The agent verifies render + code + the automated checks;
the user drives the end-to-end live run. Confirm each:

- [ ] Flow tile shows in the Flow Library with the correct availability badge (Ready for a no-model
      flow; "Get models"/Install for a model flow). Open enabled in a project.
- [ ] Each declared media slot renders (drop zone per type, numbered, up to cap). No `media` key →
      no upload UI.
- [ ] **Empty-run guard**: a flow with declared slots + none filled + no prompt → Run pops
      `ui:warning` ("{Flow} needs at least one input"), no gen fires. Media-free flows skip this.
- [ ] **Each media type injects**: drop image/video/**audio** → Run → the output reflects THAT
      input. (The MPI-259 audio bug: output kept the source's own audio because `Input_audio` was
      never injected — verify your inputted audio actually applies. A flow-vs-browser divergence is
      an APP-SIDE injection bug, see [02](02-media-io.md).)
- [ ] **Multi-output**: a flow with N `Output_*` nodes lands N cards (self-gated — fewer if some
      inputs empty); the result pane shows all that landed; ONE "Generating…" placeholder during
      the run.
- [ ] **Storage**: a dropped file lands in `Media/.preview-assets/` (NOT a new gallery card).
- [ ] **Status bar** shows progress during the run (STITCHING/GENERATING + timer), at the BOTTOM of
      the flow overlay (not collapsed to the top).
- [ ] **Ctrl+Enter** runs the OPEN flow, not the PromptBox behind it; works again after closing.
- [ ] **Reuse**: reuse a flow card → reopens the Flow with its inputs restored, across a restart
      (sidecar `flowId`/`flowInputs` hydrate) and in the same session (live item).
- [ ] **Install** (model flow): from a clean state, the detail footer drives each model's download
      with a visible aggregate % bar; badge flips Get-models → Ready → Open.

## Both-engine note

Gen-core edits (the `comfyController` media-kind sweep + inject) touch the SHARED path all media
ops use — verify LOCAL and REMOTE. A local-only test does not verify remote (media paths upload to
the Pod via `_uploadRemoteMedia`).
