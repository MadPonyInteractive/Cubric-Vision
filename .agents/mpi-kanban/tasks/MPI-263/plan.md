# MPI-263 — Reuse Prompt: split Apply for app cards

## Problem
`_applyPromptReuse` (MpiGroupHistoryBlock.js:963) calls `if (openAppFromReuse(payload.item)) return;`
at line 968 — **before** any `includes` are read. So on an app-generated card (`item.appId`),
Reuse Prompt ALWAYS reopens the app and the 6 checkboxes are dead. User also wants to inject
prompt/images into the Prompt Box.

## Decision (locked)
- Non-app card → single **Apply** (unchanged from today).
- App card → three same-color buttons: **Cancel** / **Apply to Prompt Box** / **Apply to App**.
  - Apply to Prompt Box → honors checkboxes, does NOT open app.
  - Apply to App → opens app (today's behavior), ignores checkboxes.
- One event with a `dest` field. No radio/destination selector.

## Files
- `js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.js` — button logic + `dest` in emit.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — gate `openAppFromReuse` behind `dest === 'app'`; pass whether card is an app card into the dialog.
- `js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.css` — 3-button row layout if needed.
- `js/components/types.js` — document new prop + `dest` in apply payload.
- `docs/releases/UNRELEASED.md` — changelog line.

## Steps
1. **Dialog gets `isAppCard` prop.** Mount site (line ~942 + the non-`ask` path) passes
   `isAppCard: !!payload.item?.appId`. verify: prop present in types.js + read in setup.
2. **Dialog renders buttons by `isAppCard`.**
   - false → Cancel + Apply (emit `apply` with `dest: 'promptbox'`, includes, source). Same as today.
   - true → Cancel + Apply to Prompt Box (`dest: 'promptbox'`) + Apply to App (`dest: 'app'`).
     Both same color (primary). App button omits includes/source (ignored downstream).
   verify: app card shows 3 buttons; non-app shows 2.
3. **Block honors `dest`.** In the `dialog.on('apply', ...)` handler, thread `dest` into
   `_applyPromptReuse`. Change line 968 to `if (dest === 'app' && openAppFromReuse(payload.item)) return;`.
   The `dest: 'promptbox'` path falls through to the existing prompt-box injection.
   verify: app card + Apply to Prompt Box → prompt/images land in PromptBox, app NOT opened.
4. **`ask === false` (no-dialog) path.** Today it calls `_applyPromptReuse(payload, ...)` directly
   with no dest → app cards still auto-open. Preserve: default `dest = 'app'` when undefined so the
   quick-reuse (no dialog) path keeps opening the app for app cards. verify: ask=false + app card → app opens.
5. **CSS** — ensure 3 buttons fit `min(420px)`; shrink labels or allow wrap. verify: no overflow in Electron.
6. **Changelog** + move card to done on ship.

## Verify (end-to-end, real app)
- App card, dialog: 3 buttons, same color. Apply to App → opens app w/ restored inputs. Apply to
  Prompt Box → checkboxes honored, injects, app stays closed.
- Non-app card: single Apply, behaves as before.
- Quick reuse (ask=false) on app card: opens app (no regression).

## Notes
- Checkboxes stay live on app cards; they only bind to the Prompt Box button — no disable logic.
- `dest` default = `'app'` protects the no-dialog fast path. This is the one subtle bit.
