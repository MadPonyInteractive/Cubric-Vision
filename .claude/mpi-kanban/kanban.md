## BACKLOG

### Server log capture broken

  - tags: [bug, infra, deferred]
  - priority: low
  - defaultExpanded: false
    ```md
    logs/server.log frozen since 2026-04-17. The forked server.js process'
    stdout/stderr are not captured by the main process logger, so today's
    EADDRINUSE port-bind failure never made it into any log file (we only
    found it via netstat).

    Fix sketch: in main.js `startServer()`, fork with `silent: true` and
    pipe child stdout/stderr into routes/logger via `serverProcess.stdout/
    .stderr.on('data', chunk => logger.info/error('server-stdout|stderr',
    chunk.toString()))`. Also surface non-zero exit codes loudly.

    Deferred 2026-05-20 — not release-blocking.
    ```

### Vision subdomain content (vision.cubric.studio)

  - tags: [website, content, deferred]
  - priority: medium
  - defaultExpanded: false
    ```md
    Cubric Studio website (cubric.studio) is becoming the ecosystem landing.
    Current single-app landing copy (hero, features, screenshots, CTAs) belongs
    on a Vision-specific page at vision.cubric.studio.

    Scope: move the current "Cubric Studio" landing content to a new Vision
    subdomain site (or section), and rewrite cubric.studio as ecosystem landing
    listing all apps (Vision, future Prompt/Audio/Video).

    Sequencing lock 2026-05-21: do not start website/subdomain/social work
    until current app implementation work is finished, hub readiness is solid,
    and cross-platform portable distribution is ready and tested. Public-site
    work happens before release, not before portable distribution.

    Coordinate with existing website plan
    `docs\plans\2026-05-16-port-stage-to-website.md` and the docs-IA work.
    ```

### LTX 2.3 video model integration

  - tags: [PLAN, video]
  - priority: high
  - defaultExpanded: false
    ```md
    Sequencing lock 2026-05-21: post-release only. Do not start before
    current app work, hub readiness, cross-platform portable distribution,
    website/Patreon/social release surfaces, and the first public release.

    Deferred from WAN dual-model + 12 LoRAs plan until LTX workflows are ready.
    Scope:
    - Register LTX 2.3 as a video model once `comfy_workflows/LTX23_t2v.json` (+
    `LTX23_t2v_stage2.json`) and `LTX23_i2v.json` (+ `LTX23_i2v_stage2.json`)
    exist.
    - LTX uses the two-file multi-stage contract (no `Is_Continue` injection):
    stage-1 file contains `Preview_Only` + `SaveLatent` + `Preview` + `Output`;
    stage-2 sibling is authored by bypassing the stage-1 KSampler in ComfyUI
    and Save (API). See `.claude/rules/comfy_injection.md` § "Multi-stage
    video workflows".
    - LTX uses the standard flat LoRA shape, not staged WAN-style LoRAs. Because
    stage-2 LoRAs do not vary the result for LTX, set
    `commands[op].allowsBranchingContinue = false` so preview cards expose
    only the Discard + Finish buttons (no Continue). Finish replaces the
    preview with the final video via `replaceItemId`.
    - When LTX-class image models are added (future, lower-grade-GPU image
    ops), they get the same treatment: two-file `_ms` workflow, Finish-only
    preview card.
    ```

### Patreon landing page images

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    - Use Patreon users images for the landing page on each version.
    ```

### Additive model folders in settings

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    - Explore adding to settings additive folders for models.
    This would basically be adding multiple folders where the system can pull from. 
    ```

### Cubric Studio Docs subdomain + finish docs site

  - tags: [docs, infra, content]
  - priority: medium
  - defaultExpanded: false
    ```md
    Stage redesign port shipped + pushed to GitHub (Cubric-Studio-Docs main @ a2647b8).
    Remaining work:
    - Set up `docs.cubric.studio` (or chosen) subdomain via Namecheap → GitHub Pages.
    - Configure CNAME (already present in repo root) + GitHub Pages source = main / root.
    - Verify HTTPS once DNS propagates.
    - Address small UI polish items deferred from port session.
    - Flesh out actual documentation content: real screenshots, real videos
    (replace VIDEO/SCREENSHOT placeholders), expand thin pages
    (gallery, history, workflows), add search wiring (Algolia DocSearch
    or static Lunr), add new pages as features land.
    
    Target repo: c:\AI\Mpi\Cubric Studio (Docs)\
    Reference: docs\plans\2026-05-16-port-stage-to-docs.md (archived spec).
    Linked umbrella: docs\plans\2026-05-19-cubric-vision-foundation.md (docs child track).
    ```

## PLANNING

### Cubric hub readiness before portable distribution

  - tags: [PLAN, hub, integration, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Sequencing lock 2026-05-21: this comes after the current Cubric Vision app
    implementation work, and before cross-platform portable distribution.

    Goal: make sure the hub/connector foundation is ready enough that portable
    packaging will not have to be reworked around app identity, connector
    manifests, broker startup assumptions, bundled hub artifacts, or update
    manifest expectations.

    Inputs:
    - docs/specs/cubric-connector-sdk.md
    - docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md
    - docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md
    - resources/cubric/connector-manifest.json

    Expected output: a concrete implementation/readiness checklist or child
    plan. Do not expand into Cubric Prompt work. Prompt starts only after
    Cubric Vision is mature enough to move from alpha toward v1.
    ```

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    Sequencing lock 2026-05-21: start after current app implementation work and
    hub readiness. After portable distribution is ready and tested, handle
    website/Patreon/social/docs release surfaces before public release.
    ```

### Madpony Patreon Revamp (User Action)

  - tags: [PLAN]
  - priority: low
  - workload: Easy
  - defaultExpanded: false
    ```md
    Plan File: docs\plans\2026-04-28-madpony-patreon-revamp.md
    ```

## IMPLEMENTING

### Add missing prompt box parameters for individual operations.

  - tags: [feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Ongoing task managed by the developer cooperating with agents
    ```

## COMPLETED

### Remove local LLM / LLaMA runtime before release

  - tags: [PLAN, cleanup, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-21.

    Plan file: docs/plans/2026-05-21-remove-local-llm-llama-runtime.md

    Shipped via 3 parallel workers (backend/frontend/packaging-docs) + main-agent
    sweep + Phase 2 cleanup + Phase 3 audit:
    - Backend: deleted routes/llm.js + dev_configs/llm_models.json. Stripped
      llama from server.js, routes/shared.js, routes/platformEngine.js,
      routes/engine.js, dev_configs/system_dependencies.json.
    - Frontend: deleted js/services/llmService.js. Removed Ollama URL field
      from MpiSettings, OLLAMA_URL storage key + get/setOllamaUrl helpers,
      g_abortControllers + currentLoadedModel state. memoryOps.js keeps
      /comfy/unload (F5/Ctrl+F5 intact).
    - Packaging/docs: electron-builder.yml exclusions added
      (!llama_engine/**, !llama_models/**, !.engine-config.json),
      .engine-config.json llama keys stripped (enginePath kept),
      .husky/post-checkout no longer writes llamaPath/llamaModelsPath,
      docs/PROJECT.md + worktrees.md + versioning.md scrubbed of LLAMA_VERSION
      and llamaServer references.
    - Sweep: removed dead stopLlamaServer import in routes/comfy.js, swapped
      'llm' JSDoc example in routes/logger.js to 'comfy', stripped Q3 +
      version-bump steps from .claude/skills/mpi-version-bump.md.
    - Rule edits (with user approval): .claude/rules/comfy_engine.md,
      component-state.md, component-mounts.md scrubbed of LLaMA/Ollama drift.
    - Physical: deleted llama_engine/ (545 MB) + llama_models/ (7.2 GB).
      .gitignore defensive entries kept.
    - Dependency hygiene: npm audit fix resolved 4 vulns (1 high axios,
      3 moderate brace-expansion/follow-redirects/uuid). 0 vulnerabilities now.

    Verification: lint 0 errors (29 pre-existing warnings unchanged), server
    boots clean on :3000, /engine/status + /comfy/status return Comfy-only
    responses, /llm/* returns 404 (route gone). UI run + smoke:app deferred
    to user discretion.

    Residual references are intentional: packaging exclusions, .gitignore
    defensive entries, historical docs/plans/**, false-positive substrings
    (installedAllModels, MpiModelsModal, fullMessage, shellMarginTop).
    ```

### Cubric Vision foundation

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed/closed 2026-05-21.

    Plan file: docs/plans/2026-05-19-cubric-vision-foundation.md

    Outcome: foundation decisions are closed. Completed children/work:
    brand-identity, app-rename, ecosystem-backend, connector-broker-stage-1-2,
    shared-component-system, artifact-handoff-project-portability,
    model-resource-registry, Cubric Vision connector manifest stub, and
    @cubric/connector Stage 0 MVP at C:\AI\Mpi\Cubric-Studio\packages\connector\.

    Deferred out of this umbrella:
    - Website/subdomain/docs/social work waits until app implementation, hub
      readiness, and cross-platform portable distribution are ready/tested.
    - Release-readiness copy/audit runs near release.
    - LTX 2.3 and new workflows/features happen after release.
    - Cubric Prompt starts only after Cubric Vision is mature enough to move
      from alpha toward v1.
    ```

### Cubric Vision foundation - artifact-handoff-project-portability

  - tags: [PLAN, architecture, portability, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-artifact-handoff-project-portability.md

    Outcome: selected media handoff uses CubricArtifactRef; broader
    context/templates use CubricProjectRef plus the portable project folder.
    Sidecars already cover the needed future-app metadata. Artifact ids remain
    project-local; no global artifact id and no Cubric Vision runtime connector
    implementation in this phase.
    ```

### Cubric Vision foundation - model-resource-registry

  - tags: [PLAN, architecture, models, deferred]
  - priority: low
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-model-resource-registry.md

    Outcome: no Cubric Vision v1 implementation. Future shared model/resource
    registry, if needed, is hub-owned and descriptive only: local resource roots,
    model/resource files, compatibility, hash/version/status. It is not a shared
    settings store, does not centralize model selection, and does not force apps
    to share one engine environment.
    ```

### Cubric Vision foundation - shared-component-system

  - tags: [PLAN, architecture, typescript]
  - priority: medium
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-shared-component-system.md

    Outcome: share the Stage visual contract, not Cubric Vision's JavaScript
    component runtime. Vision's ComponentFactory system stays Vision-local.
    Future TypeScript apps should build native UI using the Stage tokens/design
    rules; a tiny hub-owned tokens/primitives package can be planned later only
    if a real future app needs it.
    ```

### Cubric Vision foundation - connector-broker-stage-1-2

  - tags: [IMPL, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Shipped 2026-05-21.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md
    Brief: docs/plans/2026-05-21-connector-broker-stage-1-2-implementation-brief.md

    Target repo: C:\AI\Mpi\Cubric-Studio\ (NOT a git repo yet — flag for
    later git init follow-up).

    Delivered:
    - packages/connector transport layer: src/transport/{frame,
      localEndpoint, localConnection}.ts + src/brokerClient.ts +
      public exports in src/index.ts.
    - packages/broker (new): token, connectionMetadata, handshake,
      router, brokerServer, endpoint, cli, index. Bin: `cubric-broker`.

    Tests: 56/56 green.
    - connector: 36 (frame 8, brokerClient 2, schemas 16, mockClient 10)
    - broker: 20 (metadata 9, handshake 7, integration 4)
    Integration test runs in-process broker + real SDK client over UDS
    (POSIX) / named pipe (Windows), covers HELLO/READY happy path,
    DISCOVER_APPS, LIST_CAPABILITIES, REQUEST_CAPABILITY →
    CAPABILITY_UNSUPPORTED, shutdown metadata cleanup, untrusted-app
    PERMISSION_DENIED.

    Acceptance: all criteria met. No Electron, no Cubric Vision runtime
    changes, Stage 3+ (ensureBroker, registry persistence, perm UI, scan
    /import) deferred as scoped.

    Follow-ups (NEW kanban entries as work surfaces):
    - git init the hub repo + workspace tooling.
    - True spawn-based integration test (cli.ts is ready; current
      integration uses in-process server).
    - Stage 3 plan.
    ```

### Cubric Vision foundation - ecosystem-backend

  - tags: [PLAN, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed (planning) 2026-05-21.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md

    All 5 phases locked. Final two opens closed today:
    - Phase 2 capability vocabulary finalized — action-based dotted ids
      (prompt.enhance, prompt.translate, prompt.format.model, asset.import,
      asset.export, project.context.read); provider app id carried separately.
    - Phase 3 UUID rules aligned — itemId is project-local (scoped by
      projectId + sidecarRelativePath); cross-app identity requires a future
      explicit globalArtifactId field.

    Stage 0 SDK shipped at C:\AI\Mpi\Cubric-Studio\packages\connector
    (memory: project_connector_sdk_mvp.md). Cubric Vision v1 unblocked —
    manifest-only stub at resources/cubric/connector-manifest.json.

    Broker/runtime implementation continues in
    docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md.
    ```

### Cubric Vision foundation - app-rename

  - tags: [PLAN, brand, rename]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-20.

    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Consumed: docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md
    (sign-off in its Phase 5; full inventory in Phase 3 sections 3.A–3.G;
    release-blocking set in Phase 4).

    Shipped:
    - App repo: package.json name/description, electron-builder productName/
      appId, Start.bat, index.html title/meta/alt/hero, APP_NAME constants
      (cjs+esm twins), User-Agent header, MpiAbout alt, MpiNewProject hint,
      projectUI version label, routes/shared.js getProjectsRoot path
      (Cubric Studio → Cubric Vision, no migration shim per user OK).
    - Lettering: assets/lettering.png + media/assets/Lettering.png deleted.
      Russo One 400 self-hosted at assets/fonts/RussoOne-Regular.woff2.
      `.mpi-wordmark` BEM in styles/shell/titlebar.css; titlebar variant
      .mpi-wordmark--titlebar (12px). index.html titlebar + MpiAbout swapped
      to live-text spans. --font-wordmark token now Russo One.
    - Accent: --accent-heat swapped to rose lift oklch(0.76 0.17 355).
      Hardcoded oklch(0.72 0.20 6) sweep across 15 files (CSS + canvas JS).
    - Mascot: assets/mascot/{logo,idle,greet,happy}.png from external
      Vision-*.png crops. 4 legacy mascot{,-arms,-hi,-ho}.png deleted.
      Code refs swapped (MpiGroupHistoryBlock x3, projectUI, MpiStartingComfy).
    - Cleanup: media/assets/ (comfy_robot_engine* + logo.{png,psd} + PSDs)
      all deleted; dual-tree rule retired for Vision repo.
    - Icon: build/icon.png + favicon.png swapped to Vision head crop.
    - GitHub: dev repo Cubric-Studio-Dev → Cubric-Vision-Dev; public
      Cubric-Studio → Cubric-Vision (user). origin remote updated.
    - Website (c:\AI\Mpi\Cubric Studio (Website)\): 8 GitHub URL fixes +
      1 GitHub API URL fix in scripts/landing.js + 3 Patreon URL fixes +
      CTA "Get Cubric Studio" → "Get Cubric Vision" + footer copyright.
      Website push gate still applies — NOT pushed.
    - Docs (c:\AI\Mpi\Cubric Studio (Docs)\): GitHub + Patreon URL fixes
      in index.html. Title/lettering/home links kept (docs site IS hub).
    - Bug fix: listProjects catch branch now shows friendly empty-state
      mascot + "No projects yet" copy instead of "Could not load projects".
    - Rule edits (.claude/rules/components.md): Stage design baseline now
      lists Russo One wordmark + .mpi-wordmark BEM + canonical 4-mascot
      state set + accent-heat rose-lift value.
    - Memory: feedback_dual_asset_tree updated to RETIRED; new
      feedback_lettering_wordmark + feedback_mascot_state_set +
      project_app_rename_complete.

    Out of scope (deferred):
    - HuggingFace org (locked keep).
    - Website ecosystem-landing rewrite (separate plan + new "Vision
      subdomain content" backlog entry).
    - Docs IA rewrite (separate "Cubric Studio Docs subdomain" backlog).
    - Future hub repo creation.
    - External brand-assets folder migration.
    - Server log capture bug (new BACKLOG entry).

    Lint clean (0 errors). User-verified visually: titlebar wordmark,
    About panel, accent rose lift, mascot. Project create + generate
    confirmed working after restart.
    ```

### Cubric Vision foundation - brand-identity

  - tags: [PLAN, brand, design]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-19.

    Plan file: docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md

    Outcome: planning + decisions + inventory only — no code rename was done
    in this entry. All five phases of the child plan are checked off:
    1. Naming Lock — ecosystem term "Cubric ecosystem"; hub = Cubric Studio
       (not an app in v1); app ids dotted (cubric.vision); package/FS kebab;
       subdomains under cubric.studio.
    2. Mascot Scope — ecosystem operator family; three states idle/greet/happy;
       Vision v1 ships Vision mascot only; external folder = master library.
    3. Asset + Text Inventory — sections 3.A–3.G cover app + Website + Docs
       + external folder. Every row classified rename/replace/defer/keep and
       bucketed release-blocking vs non-blocking.
    4. Release-Blocking Scope Cut — v1 minimum set + non-blocking polish set
       + explicitly deferred items enumerated.
    5. Sign-Off Artifact — one-page authoritative decision summary; parent
       plan Phase 1 checkboxes updated.

    Lettering lock: Russo One 400 replaces lettering.png; "Cubric" in ink-1
    + app suffix in accent color; UI font stack unchanged.
    Patreon: -> patreon.com/madponyinteractive.
    GitHub: MadPonyInteractive/Cubric-Studio -> Cubric-Vision (public);
    Cubric-Studio name reserved for future hub repo.
    HuggingFace: cubric-studio org stays (ecosystem hub).
    Asset tree: dual-tree retired for Vision repo; flat assets/mascot/ with
    logo.png + idle.png + greet.png + happy.png.

    Execution follow-up: "Cubric Vision foundation - app-rename" in BACKLOG
    consumes this inventory and executes the rename + asset swap + URL fixes
    across app + Website + Docs.
    ```

### Mascot + logo + lettering recolor ported across all surfaces

  - tags: [design, brand, assets]
  - priority: medium
  - defaultExpanded: false
    ```md
    Recolored PNGs (Photoshop pass per docs/redesign/RECOLOR.md) landed in app
    media/assets/ and synced to siblings. App is canonical source.
    
    Synced files (hash-verified):
    - CubricStudio_Redesign/assets/: 6 files (Lettering, comfy_robot_engine*, logo)
    + CubricStudio_Redesign/logo.png (root copy).
    - Cubric Studio (Website)/assets/: logo.png + comfy_robot_engine{,_arms,_hi,_ho}.png.
    - Cubric Studio (Docs)/assets/: logo.png + renamed mascots:
    comfy_robot_engine      -> mascot_idle
    comfy_robot_engine_arms -> mascot_success
    comfy_robot_engine_hi   -> mascot_happy
    comfy_robot_engine_ho   -> mascot_surprised
    
    Lettering.png not referenced by Website/Docs HTML — skipped there.
    
    Follow-up: Website + Docs are separate git repos; commit + push from each.
    Website push still gated on app-downloadable per project_website_push_gate.md.
    ```

### Tool-options polish — crop redesign + radio primitive + video tool persistence

  - tags: [chore, tool-options, persistence]
  - priority: medium
  - defaultExpanded: false
    ```md
    - Crop tool: dropdown → MpiRadioGroup family selector; ratio popup → inline
    stacked-icon radio (1:1 featured + 4-col grid); section labels;
    orientation/family index-mirrored label swap; persistence under
    toolSettings.crop {family,orientation,label}.
    - MpiRadioGroup extended with labelPosition (right|top), size (sm|md|lg),
    columns (grid), featuredFirst (full-width first cell). Reused everywhere.
    - Video Upscale: popup → MpiRadioGroup factor; model dropdown moved on top,
    direction:'down' fix; persistence under toolSettings.videoUpscale.
    - Video Interpolate: popup → MpiRadioGroup multiplier; persistence under
    toolSettings.videoInterpolate.
    - projectModel.js: getToolSettings default {}, setToolSettings strips
    legacy upscaleModel:null noise on every write.
    - SOCIAL_RATIOS reordered so 1:1 is first.
    ```

### Port Stage redesign → Cubric Studio Docs

  - tags: [PLAN, design, product]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-docs.md
    Target repo: c:\AI\Mpi\Cubric Studio (Docs)\ (pushed to origin/main @ a2647b8)
    Shipped: tokens.css NEW, base.css + docs.css rewrite, router.js rewrite,
    toc.js NEW (scroll-spy), all 8 pages restyled with kicker eyebrows,
    mascot kept to home only, hotkey table → docs-table + kbd primitives.
    Stage exception (sidebar nav-link active border-left) documented in code.
    Verified: 8 routes navigate, zero console errors, banned-token grep clean.
    Follow-up tracked in backlog entry "Cubric Studio Docs subdomain + finish docs site".
    ```

### Video workspace trim + split controls

  - tags: [feature, video]
  - priority: high
  - defaultExpanded: false

### Port Stage redesign → Cubric Studio Website

  - tags: [PLAN, design, brand]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-website.md
    Target repo: c:\AI\Mpi\Cubric Studio (Website)\ (separate git)
    Register: brand · Color strategy: Drenched mauve
    Spec: docs\redesign\PRODUCT.md, DESIGN.md, c-stage\landing.html
    Driver: $impeccable shape (gate passed)
    Scope: single-page marketing site rewrite — tokens.css NEW, landing.css rewrite,
    index.html rewrite, shaderBackground.js DELETE. Sharp corners, OKLCH tokens,
    asymmetric strips, no gradient-text outside wordmark, no card-grid features.
    ```
