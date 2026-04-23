# Component Rule Violations Audit
**Date:** 2026-04-23  
**Scope:** `js/components/` (53 components)  
**Total Violations:** 87 across 27 files

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Warnings | 87 |
| Files Affected | 27 / 67 |
| Rules Violated | 4 |
| Highest Impact Rule | `mpi/no-raw-dom-query` (76 violations) |

### Violation Breakdown by Severity

| Rule | Count | Files | Priority | Remediation |
|------|-------|-------|----------|-------------|
| `mpi/no-raw-dom-query` | 76 | 22 | HIGH | Replace `querySelector`, `getElementById`, `querySelectorAll` with `qs`, `qsa`, `gid` from `js/utils/dom.js` |
| `mpi/no-window-hotkey` | 4 | 2 | MEDIUM | Replace `window.addEventListener('keydown')` with `Hotkeys.register()` |
| `mpi/no-hardcoded-hex-color` | 4 | 2 | MEDIUM | Replace hardcoded hex colors with CSS variables from `styles/01_base.css` |
| `mpi/require-destroy-on-events` | 3 | 3 | HIGH | Add `el.destroy()` cleanup for components using `Events.on()` |

---

## Violations by Rule

### 1. mpi/no-raw-dom-query (76 violations, 22 files)

**Why:** Raw DOM queries bypass caching and utility shorthands. Using `qs`, `qsa`, `gid` ensures consistent patterns and enables refactoring.

**Top Offenders:**
- MpiVideoPlayer.js: 19
- MpiVolumeControl.js: 9
- MpiNewProject.js: 7
- MpiRatioSelector.js: 6
- MpiHistoryList.js: 3
- MpiToolActionBar.js: 3
- MpiCanvasViewer.js: 3
- MpiCanvas.js: 3 (also includes color violations)
- MpiDragList.js: 3
- MpiOverlay.js: 3
- MpiRadialMenu.js: 3
- MpiToast.js: 3
- MpiToolbar.js: 2
- 9 files with 1 each

**Remediation Pattern:**
```javascript
// BEFORE
const elem = document.querySelector('.some-class');
const id = document.getElementById('my-id');
const list = document.querySelectorAll('.items');

// AFTER
const { qs, qsa, gid } = require('js/utils/dom.js');
const elem = qs('.some-class');
const id = gid('my-id');
const list = qsa('.items');
```

---

### 2. mpi/require-destroy-on-events (3 violations, 3 files)

**Why:** Components using `Events.on()` must unsubscribe on teardown to prevent memory leaks.

**Affected Files:**
- MpiRatioSelector.js (line 1)
- MpiModal.js (line 1)
- MpiPopup.js (line 1)

**Remediation Pattern:**
```javascript
// BEFORE
const setup = (el, props) => {
    Events.on('some-event', handler);
    // ... no destroy() defined
};

// AFTER
const setup = (el, props) => {
    const _unsubs = [];
    
    _unsubs.push(Events.on('some-event', handler));
    
    // Define destroy
    el.destroy = () => {
        _unsubs.forEach(fn => fn());
    };
};
```

---

### 3. mpi/no-window-hotkey (4 violations, 2 files)

**Why:** Raw keyboard listeners don't integrate with Hotkeys manager, causing conflicts and missed unregister.

**Affected Files:**
- MpiMemoryMonitor.js (lines 101–102)
- InputController.js (lines 196, 206)

**Remediation Pattern:**
```javascript
// BEFORE
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { /* ... */ }
});

// AFTER
Hotkeys.register('Escape', () => {
    /* ... */
});
```

---

### 4. mpi/no-hardcoded-hex-color (4 violations, 2 files)

**Why:** Hardcoded colors prevent theme consistency and break dark mode support.

**Affected Files:**
- MpiCanvas.js (lines 321, 330, 333)
- CropManager.js (utility; 1 violation)

**Remediation:**  
Extract colors to `styles/01_base.css` as CSS variables and reference them in code or inline styles.

---

## File-by-File Breakdown

### Critical (>5 violations)

| File | Violations | Rules | Focus |
|------|-----------|-------|-------|
| **MpiVideoPlayer.js** | 19 | dom-query | Replace 19 querySelector calls |
| **MpiVolumeControl.js** | 9 | dom-query | Replace 9 querySelector calls |
| **MpiNewProject.js** | 7 | dom-query | Replace 7 querySelector calls |
| **MpiRatioSelector.js** | 7 | dom-query (6), destroy (1) | Fix destroy() + dom queries |

### Moderate (2–5 violations)

MpiHistoryList (3), MpiMemoryMonitor (3), MpiToolActionBar (3), MpiCanvasViewer (3), MpiCanvas (3), MpiDragList (3), MpiOverlay (3), MpiRadialMenu (3), MpiToast (3), MpiToolbar (2), InputController (2)

### Minor (1 violation)

9 files with single violations.

---

## Recommended Follow-Up Tickets

1. **NIM-AUDIT-001:** Migrate querySelector → qs/qsa in components (76 violations, 22 files)
2. **NIM-AUDIT-002:** Add el.destroy() cleanup to event-using components (3 violations, 3 files)
3. **NIM-AUDIT-003:** Replace window.addEventListener('keydown') → Hotkeys.register (4 violations, 2 files)
4. **NIM-AUDIT-004:** Extract hardcoded colors to CSS variables (4 violations, 2 files)

---

## Notes

- **factory.js** excluded (locked file, non-editable).
- Video.js excluded (utility, not a component).
- Blocks (MpiGalleryBlock, MpiGroupHistoryBlock, MpiModelsModal) are clean.
- 40 components have zero violations.
