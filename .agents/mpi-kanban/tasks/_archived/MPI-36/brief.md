# Cubric Vision foundation - app-rename  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 959 Legacy column: COMPLETED  ```md ### Cubric Vision foundation - app-rename - tags: [PLAN, brand, rename]
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
    ``` ``` 