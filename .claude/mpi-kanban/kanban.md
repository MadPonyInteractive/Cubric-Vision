## BACKLOG

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
    ```

### Mascot + logo recolor across all surfaces

  - tags: [design, brand, assets]
  - priority: medium
  - defaultExpanded: false
    ```md
    Update mascot + logo PNGs to Stage mauve across:
    - CubricStudio app (c:\AI\Mpi\CubricStudio\assets\)
    - Cubric Studio (Website) (c:\AI\Mpi\Cubric Studio (Website)\assets\)
    - Cubric Studio (Docs) (c:\AI\Mpi\Cubric Studio (Docs)\)
    
    Source recipe: c:\AI\Mpi\CubricStudio\docs\redesign\RECOLOR.md
    Photoshop pass on source PNGs. Drop CSS hue-rotate stopgap filters
    everywhere after assets land.
    
    Targets per RECOLOR.md:
    - Body: oklch(0.50 0.022 350)
    - Eyes: oklch(0.82 0.13 220) frost cyan
    - Emblem + C: oklch(0.72 0.20 6) heat pink
    - Outline: oklch(0.22 0.02 350) deep mauve
    
    Files to refresh (non-exhaustive):
    - logo.png / favicon.png / lettering.png
    - comfy_robot_engine*.png (mascot family — hi/ho/arms variants)
    ```

## PLANNING

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

## COMPLETED

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

