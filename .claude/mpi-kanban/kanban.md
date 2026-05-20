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

    Coordinate with existing website plan
    `docs\plans\2026-05-16-port-stage-to-website.md` and the docs-IA work.
    ```

### LTX 2.3 video model integration

  - tags: [PLAN, video]
  - priority: high
  - defaultExpanded: false
    ```md
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

### Cubric Vision foundation

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: false
    ```md
    Plan file: docs/plans/2026-05-19-cubric-vision-foundation.md
    Completed children: brand-identity + app-rename (see COMPLETED).
    Gated children: integration-contract, artifact-handoff, ecosystem-backend,
    shared-component-system, website, release-copy.
    Umbrella now includes TypeScript-first connector backend direction and a
    shared component-system compatibility phase. Component-system work blocks
    Cubric Prompt/future apps, not Cubric Vision v1; keep separate from
    app-rename unless explicitly promoted.
    Linked docs child: "Cubric Studio Docs subdomain + finish docs site" in BACKLOG.
    ```

### Cubric Vision foundation - ecosystem-backend

  - tags: [PLAN, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md
    Scope: plan the TypeScript-first backend/connector system that lets Cubric
    apps discover each other and request action-based capabilities. This is the
    ecosystem blocker, but it is separate from the app-rename implementation.
    ```

### Cubric Vision foundation - shared-component-system

  - tags: [PLAN, architecture, typescript]
  - priority: medium
  - defaultExpanded: false
    ```md
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Scope: plan whether Cubric Vision's JS component system remains Vision-local,
    becomes a TypeScript-compatible shared Cubric UI package, or gets a typed
    adapter/wrapper path for the TypeScript-first hub and future apps.

    Blocks Cubric Prompt/future app implementation, not Cubric Vision v1. Must
    stay separate from release-blocking app-rename unless explicitly promoted.
    First outputs should be an inventory/classification of reusable component
    contracts and a recommendation for the lowest-risk TypeScript bridge.
    ```

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
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
