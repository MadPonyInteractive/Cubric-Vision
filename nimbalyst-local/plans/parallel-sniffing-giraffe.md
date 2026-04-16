# Plan: Bundle Fira Code Locally for Electron

## Context

The app currently references `'Fira Code'` in CSS variables but has no `@font-face` declaration and no font files. Fira Code is referenced via Google Fonts in `index.html` only for Inter. The user flagged that shipping an Electron app with a Google Fonts dependency is problematic for offline use.

**User changed decision:** Instead of Fira Code, use **JetBrains Mono** for `--font-main`. Inter remains bundled for `--font-display`.

**Goal:** Bundle JetBrains Mono and Inter font files locally so the app works fully offline.

---

## Approach

### Step 1 — Download JetBrains Mono font files

JetBrains Mono is open source (OFL). Create `assets/fonts/` and install via npm (`jetbrains-mono` package), then copy the woff2 files:
- `JetBrainsMono-Regular.woff2` (400)
- `JetBrainsMono-Bold.woff2` (700)

> Note: We only need regular and bold weights — woff2 is the modern format with best compression.

### Step 2 — Add `@font-face` declarations to `styles/01_base.css`

Replace the bare CSS variable reference with proper `@font-face` rules using a local path to bundled font files:

```css
/* JetBrains Mono (monospace, used for --font-main) */
@font-face {
  font-family: 'JetBrains Mono';
  src: url('../assets/fonts/JetBrainsMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('../assets/fonts/JetBrainsMono-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}
```

Update the CSS variable to use the correct font name:

```css
--font-main: 'JetBrains Mono', monospace;
```

### Step 3 — Also bundle Inter locally (remove Google Fonts link)

Remove the Google Fonts `<link>` from `index.html` and add Inter woff2 files to `assets/fonts/`. This eliminates all network font dependencies.

**Inter weights needed:** Regular (400), Medium (500), SemiBold (600), Bold (700)
**JetBrains Mono weights needed:** Regular (400), Bold (700)

### Step 4 — Add `@font-face` declarations for Inter to `styles/01_base.css`

```css
/* Inter (used for --font-display) */
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
}
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
}
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}
```

### Step 5 — (Optional) Add electron-builder for production packaging

Currently there is **no build configuration**. The app runs via `npm start` with no packaging. To bundle `assets/fonts/` into a distributable Electron app, `electron-builder` config would be needed:

```json
// package.json
{
  "build": {
    "extraResources": [
      { "from": "assets/fonts", "to": "fonts" }
    ]
  }
}
```

**This step is only needed if you want to create a distributable .exe** — not required to run locally with bundled fonts.

---

## Critical Files

| File | Change |
|------|--------|
| `assets/fonts/Inter-Regular.woff2` | **Create** — copy from inter-ui npm package |
| `assets/fonts/Inter-Medium.woff2` | **Create** — copy from inter-ui npm package |
| `assets/fonts/Inter-SemiBold.woff2` | **Create** — copy from inter-ui npm package |
| `assets/fonts/Inter-Bold.woff2` | **Create** — copy from inter-ui npm package |
| `assets/fonts/JetBrainsMono-Regular.woff2` | **Create** — copy from jetbrains-mono npm package |
| `assets/fonts/JetBrainsMono-Bold.woff2` | **Create** — copy from jetbrains-mono npm package |
| `styles/01_base.css` | Add `@font-face` declarations for both fonts, update `--font-main` to JetBrains Mono |
| `index.html` | Remove Google Fonts `<link>` (both Inter and Fira Code) |

---

## Verification

1. Start the app with `npm start` — fonts should render without network access
2. Check DevTools → Network tab — no requests to googleapis.com for any font
3. In DevTools → Elements, inspect computed font-family on a text element — should show JetBrains Mono for code elements, Inter for UI text (both loaded locally, no external requests)