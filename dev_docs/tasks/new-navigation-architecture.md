# Architecture Vision: Radial Navigation & Workspace System

# 🤖 IMPORTANT for agents 
## CRITICAL Must Read: `dev_docs/05_components.md`
## Use JSDocs extensively
## Use the `styles/01_base.css` as the source of thruth for styles
## USe `js/utils/dom.js` for shorthands
## use `js/utils/` where appropriate
## Do not commit git
## Do not test
## Ask questions if goal not clear
## Work on your assigned phase but the read the other phases for context
## Remember to update `js/shell.js` and `js/components/types.js` if adding or removing components

---

## 🎯 The Vision

MpiAiSuite is a **desktop app for artists**, not a technical dashboard. The UI must feel **immersive and gamey** — the tool disappears, only the work matters. There is no sidebar, no page navigation, no visual clutter. The user focuses on **one task at a time**, guided by a context-aware radial menu.

---

## 🗺️ Application Structure

### Layer 1 — Landing Page (Keep As-Is)
The existing project selection/creation screen remains **completely unchanged**. It is a hard transition: entering a project clears the landing DOM.

- **New Project** → enters the Workspace Shell with radial menu shown at Root
- **Existing Project** → enters the Workspace Shell and opens the **Media Library** immediately

---

### Layer 2 — Workspace Shell (Persistent Chrome)

Once inside a project, a minimal persistent HUD surrounds all workspaces and overlays. **This never changes, regardless of what overlay is open.**

| Element | Location | Notes |
|---|---|---|
| **Project name + current tool** | Top Left | Updates when context changes |
| **VRAM + RAM meters** | Top Right | Already implemented in status bar |
| **Status bar** | Bottom | Already implemented. Hovering any control should emit a description here |

> The workspace shell has **no sidebar, no top nav, no back button.** The radial menu is the only navigation system.

---

### Layer 3 — The Radial Menu (Context-Aware)

**Trigger: Hold `Tab`** — no button, no corner widget, no other trigger. This is a deliberate power-user gesture. New users are onboarded by the first-run state (see below).

The menu is **context-aware** — it shows different options depending on where the user is.

#### Root Context (no active tool)
```
[ Gallery ]  [ Image ]  [ Video ]  [ Audio ]
```

#### Image Context
```
[ Upscale ]  [ Enhance ]  [ Edit ]  [ Settings ]  [ Downloads ]  [ Gallery ]  [ ← Main Menu ]
```
> `Settings` = this generator's model/params overlay  
> `Downloads` = this generator's workflow/download manager overlay  
> `Gallery` = image history for this context, full-screen overlay

#### Video Context *(future)*
```
[ Generate ]  [ Edit ]  [ Audio Sync ]  [ Settings ]  [ Downloads ]  [ Gallery ]  [ ← Main Menu ]
```

> Sub-menus can be added per-context as tools grow. Each context is self-contained.

---

### Layer 4 — Overlays (MpiOverlay Primitive)

**Overlays are NOT new pages.** They slide over the active workspace using the Stash Pattern. The background workspace stays alive.

| Overlay | Triggered by | Notes |
|---|---|---|
| **Media Library** | Entering existing project / Gallery in radial | Full-screen overlay |
| **Settings** | Radial → Settings | Tool-specific, shows model/params for active context |
| **Downloads** | Radial → Downloads | Tool-specific download manager |
| **Upscale / Enhance / Edit** | Radial → tool action | Each is an overlay over the generator |

Overlays are dismissed with **Escape** (hooked into `OverlayManager`) or by selecting another radial option.

---

## 🎮 First-Run & New Project State

When a user creates a new project and enters the workspace for the first time, the screen shows:

- Empty canvas/workspace background
- Radial menu **already open** at root
- Center text: *"I'm your radial menu. Hold **Tab** anytime to call me."*

This teaches the gesture on first use without documentation.

---

## 🏗️ Components Needed

### New (to build)
| Component | Tier | Description |
|---|---|---|
| `MpiRadialMenu` | Primitive | Floating radial nav, context-aware, Tab-hold trigger. Shows/hides with animation. Receives a `context` prop and renders the correct option set. |
| `MpiWorkspaceShell` | Block | Persistent HUD wrapper. Renders the top-left label, top-right meters, and the status bar. Mounts once on project entry. |
| `MpiImageWorkspace` | Block | The Image Generator workspace. Full-screen canvas area + floating `MpiPromptBox` at bottom. This is the base layer for the Image context. |
| `MpiMediaLibrary` | Block | The gallery overlay. Shown as an `MpiOverlay` over the active workspace. |

### Already built (use these)
| Component | Status |
|---|---|
| `MpiOverlay` (Stash Pattern) | ✅ Ready |
| `OverlayManager` (queue + Escape) | ✅ Ready |
| `MpiPromptBox` | ✅ Ready |
| `MpiButton`, `MpiBadge`, `MpiPopup` | ✅ Ready |
| Status bar (VRAM/RAM) | ✅ Already in shell |

---

## 🚀 Sprint 1 — Prove the Pattern

**Goal**: Build 2 screens that feel right. Fast, gamey, artist-focused. Don't implement all tools — prove the architecture.

### Step 1: `MpiRadialMenu` Primitive
- Hold `Tab` to show, release to hide (or click an option)
- Receives a `context` prop: `'root' | 'image' | 'video' | 'audio'`
- Renders the correct option set for that context
- Emits `select` event with the chosen action
- Animated appear/disappear (scale + fade, feels physical)
- Register `Tab` hold via `HotkeyManager`

### Step 2: `MpiWorkspaceShell` Block  
- Mounts once on project entry, wraps everything
- Top-left: project name + current tool label (updates via Events bus)
- Top-right: VRAM + RAM meters (move existing logic here)
- Bottom: existing status bar

### Step 3: Root Workspace State
- When no context is selected: blank canvas + radial menu open at root
- Onboarding text in center
- Selecting `Image` from radial → transitions to Image workspace

### Step 4: `MpiImageWorkspace` Block
- Full-screen dark canvas
- `MpiPromptBox` floating at bottom center
- Generation history fills the canvas (grid of recent gens)
- Radial menu in `image` context when Tab is held

### Step 5: Wire the first overlay
- `Settings` in Image radial → stub `MpiOverlay` with placeholder content
- Proves the stash works end-to-end in the new system

---

## 🎨 Design Principles (Strict)

1. **Artist-first**: Every pixel should feel like a creative tool, not a dashboard
2. **Full-screen canvas**: Tools take the whole screen. No wasted space.
3. **Gamey transitions**: Overlays animate in (scale, slide, fade). Nothing just "appears"
4. **Status bar is the help system**: Hovering any control emits its description to the status bar. No tooltips cluttering the canvas.
5. **Tab is sacred**: The radial menu trigger must feel snappy. `keydown` = show immediately, `keyup` = hide (or lock open if option selected)
6. **No purple** (per design rules in agent files)
7. **Dark, high-contrast**: Workspace backgrounds should be near-black. UI elements should pop with accent colors on interaction only.

---

## 🔗 Key Files to Read Before Coding

- `js/managers/overlayManager.js` — how overlays are queued
- `js/components/Primitives/MpiOverlay/MpiOverlay.js` — Stash Pattern implementation
- `js/managers/hotkeyManager.js` — how to register Tab hold
- `dev_docs/05_components.md` — component creation checklist
- `styles/01_base.css` — source of truth for all CSS tokens
- `js/events.js` — Events bus for cross-component communication

---

## ⚠️ What NOT To Do

- ❌ Do not modify `shell.js` sidebar or routing logic
- ❌ Do not modify legacy tool pages (`provisioning.js`, any `pages/*.js`)
- ❌ Do not add a visible button or widget to trigger the radial menu
- ❌ Do not build all 50 tools — just Image context as the proof-of-concept
- ❌ Do not use `innerHTML = ''` anywhere — always use the Stash Pattern via `MpiOverlay`
