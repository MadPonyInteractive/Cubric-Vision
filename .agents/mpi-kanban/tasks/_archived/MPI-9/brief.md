# Website final copy pass + Pony section + nav refactor  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 215 Legacy column: COMPLETED  ```md ### Website final copy pass + Pony section + nav refactor - tags: [website, content, media]
  - priority: medium
  - defaultExpanded: false
    ```md
    Completed 2026-05-25 by claude-opus-4.7.

    Display website (Cubric Studio Website) done — needs push only.

    Vision page (`vision/index.html`):
    - Proof band rewritten: Generation/Image+video, Privacy/Runs offline,
      Learning curve/Minutes-not-weeks, Source/Open and free.
    - Interface body rewritten ("ComfyUI's engine, without the engine room").
    - Features card 03 (Curated local models) folded in VRAM hint.
    - Features card 04 rewritten as ComfyUI-update-stability differentiator.
    - SDXL Real section rewritten with v1 honesty caveat.
    - Image-to-video section rewritten to surface i2v workflow capabilities.
    - Illustrious section (was "SDXL anime") rewritten with model identity,
      speed angle, and stylized-by-default framing.
    - Workflow section reframed: "One workflow, your file at the end" with
      honest external-tool handoff in step 4.
    - NEW Pony section added between Patreon + FAQ (image right, text left).
    - Top nav refactored: Docs · FAQ · Discord · Patreon · Download (action-right).
    - 14 new Pony images (sdxl-pony-NN.webp) batch-converted PNG → WebP.

    Main page (`index.html`):
    - Showcase section: Stage two-line H2 (pink em on "Own it.") + Wan 2.2
      reel + Vision-bridge copy ("ComfyUI's engine, without the engine room").
    - landing.css: showcase h2 em rule for pink line break.

    Tooling:
    - Cubric-Vision repo: NEW `scripts/convert-images.cjs` — reusable
      PNG/JPG → WebP batch converter for sibling website carousels.
      Replaces one-off Pony script. Memory: `tool_website_image_converter.md`.
      Added to project-profile Important Commands.

    Both repos committed (Website + Cubric-Vision). Not pushed per user.

    Outstanding: Docs website (`Cubric Studio (Docs)`) — separate session.
    See BACKLOG "Cubric Studio Docs subdomain + finish docs site".
    ``` ``` 