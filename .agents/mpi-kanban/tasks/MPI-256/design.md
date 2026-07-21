# MPI-256 — Artistic Tier: App Library + Apps

**Status:** Design/investigation card. NO plan yet — full investigation (Fable model, sub-agents over rules/docs/memory/code) BEFORE any plan. Do not start implementation.

---

## 1. The thesis (why)

Three user tiers. Cubric owns the middle. Missing the top.

| Tier | User | Tool | Mental model |
|---|---|---|---|
| Advanced | technical/nerdy | ComfyUI | "wire the graph" |
| **Intermediate** | technical | **Cubric now** | "pick model → op → upscale → detail" |
| **Artistic** | artists/beginners | **← this card** | "I want THIS. Click. Done." |

Reference #1 = **Higgsfield** (higgsfield.ai/apps) — #1 site right now. Gallery of specialized "apps": Skin Enhancer, Angles, Face Swap, Nano Theft, Color grading, Relight, Expand image, Transitions. Each = ONE outcome, model+workflow+chain HIDDEN behind it. User scans → clicks → done.

This is **additive**. "Of course we keep what we have. This is just a feature." Intermediate tier stays untouched.

Precedent already shipped: Krea2 **"styles"** = curated app-LoRAs = first step toward this.

---

## 2. Naming law (AGENT-SAFE — the whole point is not confusing agents)

- **Workspace** = Landing / Gallery / History ONLY (existing, `router.js` PAGE_*, `.claude/rules/workspaces.md`). UNCHANGED — hands off. Do NOT add a 4th workspace.
- **App Library** = the card-grid overlay ("browse apps"). NEW overlay. CLONES the **Model Library** overlay pattern.
- **App** = ONE running app = minimal-controls **overlay**, body = a **Block/Organism**. NEW overlay.
- **NEVER "app workspace."** An App is an OVERLAY, not a workspace.

---

## 3. Flow (LOCKED)

```
Gallery workspace (home, unchanged)
  └─ [dev-gated toolbar button] → App Library overlay (card grid + availability badges)
        └─ click card → slide-over from RIGHT (clone Model Library slide-over)
              ├─ app info + preview + required-models list (per-model install state)
              └─ ONE button:
                   • all models installed → [Open]  → App Library CLOSES → App overlay OPENS
                   • missing models       → [Install] → download flow → button flips to [Open]
```

- **Two-overlay handoff, NOT nested.** App Library closes when App opens. One overlay alive at a time.
- **Overlay z-scope:** App overlay covers **Gallery + PromptBox ONLY**. The **queue slide-over rides OVER the app overlay** (z-order). Queue + status bar always live/visible.

---

## 4. The monolith-killer — slide-over hoists install logic OUT of apps

Apps depend on **1..N models** (some 2-3). Availability = pure fn: `requiredModels.every(installed)`.
- Card shows avail **badge**.
- Click card → slide-over: info + required-models (per-model install state) + Open/Install button.

WHY slide-over (not straight into app UI): it **hoists ALL install/availability/info logic into ONE shared surface**. App UIs stay dumb — assume models present, just run. Straight-to-app-UI would force every app ×N to handle install/deps/progress = the biggest monolith ever. Averted.

---

## 5. Anti-repetition — BaseApp base component

Each app = own Organism/Block but **INHERITS a shared base** (frame/chrome). App-specific = only the differing controls (Skin Enhancer = 1 upload; Face Swap = 2 uploads; Angles = orbit widget + rotation/tilt/zoom sliders; Nano Theft = 1 upload + image/video toggle). Goal: "add an app = ~40 lines", not "a project".

**OPEN — BaseApp scope not locked** (was mid-question when scope shifted). Candidates to decide during design:
- result + progress pane (shared?)
- Generate button + run lifecycle (shared?)
- media upload slot(s) — app declares count (some use a widget instead)
- header + close/back (trivially shared)

---

## 6. Run model — DECIDED: App = a SECOND PRODUCER into the EXISTING queue

**In theory it's just another workflow pushed into the queue + status bar.**

- **App overlay owns INPUT + per-app STATE. Existing queue owns RUN + PROGRESS.**
- App collects inputs → holds **per-app input-state** (go-back-and-tweak without re-setup; key by appId e.g. `state.s_appInputs[appId]`, replace-not-mutate per state rules) → **Run** → **submits to existing generationStore via the SAME submit seam PromptBox uses** (front door — NOT reaching into `_laneOf`/engine-lanes/store internals).
- Status bar + queue show progress FOR FREE. Video gen + app gen coexist in queue naturally.
- After Run: **Back to App Library** → pick another app (→ queue), OR go to PromptBox and do image/video gen (→ queue). All one queue. "Happy days."

**REJECTED:**
- Blocking (kills run-app-while-video-generates; still needs own progress UI = MORE work; "safer" is a trap).
- App owning its own progress bar / parallel run system.

Rationale: this is LESS entanglement than full-integration BECAUSE it only touches the ONE submit entry point, not the MPI-208/213-consolidated generationStore internals. Only genuinely-new state = small per-app input-state.

---

## 7. Dual entry + RunPod / unlock-first

App Library reachable from **BOTH Landing (project page) AND Gallery**.
Reason: unlock-first. User wants apps → needs models installed → must install BEFORE entering project/gallery (can't connect a CPU pod then go to gallery).

- **Landing/project page:** Open **DISABLED**, Install only. Press Open → toast: "open apps from the Gallery / inside a project."
- **Gallery:** full (Open + Install).
- One flag: `canOpen = (page === PAGE_GALLERY)`. Availability logic itself unchanged — only the Open button is context-gated.

---

## 8. Dev-gating + rollout

- App Library access buttons gated by **`APP_CONFIG.dev_mode`** (`dev_configs/app_config.js`). Auto-true in dev/source, auto-false in staged builds — ships DARK, can't be forgotten-flipped before release. (NOT `test_styles` — that's the manual component-gallery toggle.)
- **Ongoing feature.** Stays dev-only until **≥4 real apps** exist. Keep shipping to users normally; they never know this system exists until we flip it.
- **Parallel track:** keep adding new MODELS (separate work). More models = more value NOW + more apps possible. Apps need models; models are the current bottleneck.

---

## 9. App descriptor (draft — finalize against real code in investigation)

```
App = {
  id,
  title,
  preview,          // card + slide-over image
  description,      // slide-over copy
  workflow,         // ComfyUI workflow (template→runtime split, existing system)
  requiredModels[], // drives availability badge + slide-over install list
  uiComponent,      // per-app Block/Organism, inherits BaseApp
  inputSchema       // what the uiComponent collects → injected into workflow
}
```
Adding app N = a descriptor + a small uiComponent. Host/gallery/routing/slide-over/submit-seam/model-resolve = built ONCE.

---

## 10. Investigation to run BEFORE the plan (Fable model + sub-agents)

Read rules + docs + memory + CODE. Name real functions. Targets:
1. **Model Library overlay + slide-over** wiring — the exact clone target (open/close event, grid shell, slide-over, install button → download flow). → `.claude/rules/component-mounts.md`, `component-events.md`, the Model Library component, `models:open` (workspaces.md:15).
2. **PromptBox → generationStore SUBMIT seam** — the exact front-door entry an app calls. → generationStore.js, PromptBox, MPI-208/213 research (`.agents/mpi-kanban/tasks/MPI-208/research/`), `.claude/rules/state.md`.
3. **ComfyUI injection engine** — how a workflow gets inputs injected; how inputSchema maps to `Input_*` titles. → `.claude/rules/comfy_injection.md`, add-model-playbook §11, [[project_comfy_injection_silent_title_skip]].
4. **Overlay system + z-order** — can an overlay cover Gallery+PromptBox while the queue slide-over rides above it? → `docs/shell.md` (Overlays), overlay manager.
5. **Model availability** — how "is this model installed" is known (`s_installedModelIds`), for the badge/slide-over. → state + Model Library.
6. **Workspace/router** — confirm App Library/App as overlays need ZERO PAGE_* additions. → `.claude/rules/workspaces.md`, router.js.
7. **Block lifecycle + destroy contract** — App overlay = a Block; teardown rules. → `.claude/rules/components.md` (Observer Lifecycle & Teardown).
8. **BaseApp inheritance** — does the ComponentFactory pattern support a base-component-to-inherit cleanly? → `.claude/rules/components.md`, factory (LOCKED — don't modify), types.js.

Output = a de-risked plan that "won't trick us" (Fabio's words). Open decisions to close in investigation: BaseApp exact scope (§5), inputSchema→injection contract, first reference app (likely simplest single-upload, e.g. Skin Enhancer / upscale-style, to prove the host before Angles' orbit widget).

---

## 11. Investigation DONE (2026-07-11, Fable + 5 sub-agents) — see research/

Findings: research/A-model-library-clone.md, B-submit-seam.md, C-injection-workflows.md, D-overlays-zorder.md, E-factory-router-buttons-state.md, **SYNTHESIS.md** (the cross-agent picture: free wins, 3 gaps, trap list, stale docs).

## 12. DECISIONS LOCKED with Fabio (post-investigation)

1. **App results = normal gallery cards** in the current project (pipeline default; addGroup creates fresh group; requires open project — guaranteed by Gallery-only Open gate).
2. **REUSE on app cards opens the APP, not the PromptBox** (Fabio requirement): app gens' `.meta` sidecar gets ADDITIVE fields `appId` + input snapshot (s_appInputs at Run time). Reuse entry point branches: sidecar has appId → open App overlay w/ inputs restored (availability-check models first); else → PromptBox fill as today. Bonus: app-input restore works across restarts (disk > session).
3. **Overlay coverage = new third MpiOverlay mount mode, named `mountTarget: 'main-area'`** (NOT 'workspace' — that word caused instant confusion; main-area names the real DOM target). Mounts into `.main-area`, covers #tool-container + #prompt-box-mount, sticky #shell-info-bar stays live. NO router change, NO new workspace — Landing/Gallery/History remain the only workspaces. Each app STILL has its own Organism/file; the overlay is just the shared frame.
4. **LoRA policy = RUN CLEAN**: app gens strip project modelSettings LoRA injection (small per-call override — new but tiny). App workflow = the whole recipe.
5. **Registry = `js/data/apps.js`** (Fabio's naming), sibling of models.js. Descriptor: `{id, title, preview, description, requiredModels: [MODEL ids — NOT dep ids; availability derives from s_installedModelIds + existing install machinery], operation (universal-op key), workflow, uiComponent, inputSchema}`.
6. **First reference app = image-in → image-out, 1 model** (simplest; proves library→slide-over→open→run→gallery loop before any bespoke widget).
7. Queue-above-overlay fix = CSS var approach (`--app-overlay-z` + calc on `.mpi-slide-over--queue`) — technical pick, no user fork.
8. BaseApp scope (recommended, unobjected): header/back + result+progress pane + Run button/lifecycle + declared upload slots in BaseApp; per-app component = controls only.

## 13. Remaining before plan
- Trace the current Reuse entry point (Gallery/History) for decision 2's branch — one focused read, do at plan time.
- Sidecar schema addition (appId + inputs) — confirm against docs/project-integrity.md at plan time.
- Then: /mpi-create-large-plan (this is multi-phase: overlay mode + registry+guard + App Library + BaseApp + first app + reuse routing).
