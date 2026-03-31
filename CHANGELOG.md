# Changelog

All notable changes to MpiAiSuite are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org)

---

## [Unreleased — R8 Refactor in progress]

### Changed
- Big Bang refactor: replacing all legacy UI components with factory system
- New `js/utils/` utility layer
- New `js/events.js` centralized Event Bus
- Upgraded `state.js` with Project Templates support
- Git version control initialized

---

## [0.8.0] — 2026-03-31 (Pre-release snapshot)

### Summary
Full desktop app: 10 AI tools, local ComfyUI + LLM integration, Electron shell.

### Components (Factory System)
- C1: `factory.js` — core lifecycle engine
- C2: `MpiButton` Primitive (5 variants, 3 sizes)
- C3: `MpiIcon` Primitive (40+ icon registry)
- C4: `MpiIconButton` Compound (glassmorphism, toggle, icon-swap)
- C5: Component Gallery test page
- C6: Dynamic icon gallery (buildIconSection)
- C7: `/implement_new_component` agent workflow

### Additional Primitives
- MpiBadge, MpiInput, MpiPopup, MpiProgressBar, MpiSpinner, MpiToast

### Additional Compounds
- MpiDragList, MpiMediaDropzone, MpiPopupButton, MpiScrollableBox, MpiSlider

### Additional Blocks
- MpiDropdown, MpiPromptBox, MpiRatioSelector

### Architecture Refactor (R1–R7)
- R1: `js/toolUtils.js` — shared tool utilities
- R2: `js/toolRegistry.js` — centralized tool registry
- R3: Split `shell.js` (1527→862 lines)
- R4: Split `server.js` into `routes/*.js` (1601→62 lines)
- R5: Documented shared utility API
- R6: HTML template extraction (`templateLoader.js`, 15 templates)
- R7: Final audit — all tools verified green

### Tools
- LLM Chat, Descriptor, Translator, JSON Formatter
- Prompt Builder, Generator (SDXL/FLUX), Detailer, Upscaler
- Crop & Extract (video), Compare, Media Library

---

## Semver Strategy
- `0.x.y` — Pre-release development
- `0.9.0` — R8 refactor complete (factory components fully adopted)
- `1.0.0` — Electron packaging + final native installer
