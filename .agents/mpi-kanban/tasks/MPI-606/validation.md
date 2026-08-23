# MPI-606 Validation

**Verify mode:** user-ux. Five of the six bugs were driven and confirmed in a REAL running
app; the sixth has no live surface today. Fabio's own pass on the paint step and the five
history tool-option panels is the part still outstanding — see § Still needs Fabio's eyes.

## Automated

- `tests/flow-frame.test.cjs` — **16 tests, 16 pass**, all new here (14 in the first commit,
  2 more in the second). That delta is the stable number and the claim auditor confirmed both
  halves of it independently.
- `npm test` — green throughout, 0 fail. **Do not read the absolute counts as fixed**: they were
  686 → 700 → 702 → 703 across this session, and the last change was not mine. MPI-567 is editing
  the same working tree in parallel, so the suite total moves under both of us. The auditor
  flagged 686/700/702 as unconfirmable for exactly this reason; each was true runner output when
  recorded, and none of them is true now.
- `node --check` clean on all four touched JS files.
- `npx eslint` clean on all four.

### Mutation-checked, not merely green

Green tests prove nothing until they can go red. Eight mutants, one per fix, each breaking a
single line; **all eight turned `tests/flow-frame.test.cjs` RED**:

| Mutant | Result |
|---|---|
| bug 4 — revert the picker emit to bare | RED |
| bug 4 — drop the `rAF` guard | RED |
| bug 3 — `allowWhileTyping: true` on `flow.step.back` | RED |
| bug 2 — stop killing Space on a ticker tick | RED |
| bug 3 — bind the arrow key with no video yield | RED |
| bug 5 — delete the `promptRequired` guard | RED |
| bug 6 — write the step store directly again | RED |
| bug 1 — stop persisting a media change | RED |

Originals held in memory and restored in a `finally`, then **verified byte-for-byte by
sha256** — the run must not be able to leave a mutated source file on disk. Restore verified OK.

## Live, in a real app

Own isolated instance (`npm run app:isolated`, port 49998, own profile) driven with
`playwright-cli`. The user's app on `:3000` was never touched — HTTP 200 before and after,
and the instance was killed by the launcher PID (25940) I started, never by a name pattern.
A throwaway project was created **inside the scratchpad**, not in the user's Documents, and
its entry was removed from the shared `project-paths.json` afterwards (confirmed).

| # | What was driven | Result |
|---|---|---|
| 1 | `ltx-extend`: typed a prompt on the step, **no run** | `s_flowInputs['ltx-extend']` populated with `positive`, `negative`, `injectionParams` |
| 1 | Closed the flow (destroys it, MPI-345) and reopened | prompt came back in the field |
| 1 | `head-swap` (**second flow**): real `drop` of a PNG on slot 2, **no run** | persisted as `role: 'image2'` — its own slot, not packed to the first |
| 1 | Closed and reopened `head-swap` | `filled: [false, true]` — the image is still in **its** slot |
| 2 | Real click on `#flow-next` | step 0 → 1, focus **stays** on the arrow (the bug condition) |
| 2 | Trusted `press Space` with that focus | step stays 1 — nothing moved |
| 2 | Trusted `press Enter` with that focus | step 1 → 2 — the button is still keyboard-operable |
| 3 | `ArrowRight` then `ArrowLeft` | 0 → 1 → 0 |
| 4 | `MpiColorPicker` mounted inside the live flow overlay, trigger clicked | popup opened, **flow stayed mounted** |
| 4 | Control: bare `ui:close-all-popups` emitted straight after | flow **destroyed** — proving the reason payload is what saved it |
| 4 | Console over the whole session | no `getBoundingClientRect of null` |
| 5 | `character-sheet` (`promptRequired: true`), empty prompt, Generate clicked | `ui:warning` "Character Sheet needs a prompt before it can run." and `generationQueueCount` 0 → 0 |

The only console errors in the session were two 404s for module paths I guessed while probing
and the `flow-scribble-object.webp` that MPI-567 has not made yet. Neither is this card's.

## Not verified live, and why

- **Bug 6 (shared field id).** No flow declares the same id on a gizmo step *and* the run
  slide today — MPI-567 wrote exactly that, caught it by reading, and reverted it. There is
  nothing in the app to click. Covered by unit tests and the mutant above; the first real
  consumer will be MPI-567's prompt, which this unblocks.
- **Space actually ACTIVATING a button, pre-fix.** Not re-run as a control: the click →
  focus-retained state was observed live and is the whole cause, and reverting the fix in the
  running app to watch it break adds nothing the mutant does not already prove.

## Second pass — two things Fabio found after the first commit (2026-08-23)

Both were real, both came out of the first fix, and both are now closed and re-verified live.

### The picker rendered UNDERNEATH the overlay

Fixing the close did not make the picker usable: it opened *behind* the flow, showing only a
sliver below the overlay's bottom edge. **Root cause is one number.** The popup portals to
`document.body`, so it shares a stacking context with the overlay and its `z-index` is the only
thing keeping it on top — and it was **9999, one below `overlayManager`'s `BASE_Z` of 10000**.
There is an established portal layer at **11000** (`MpiDropdown`, `MpiTreePicker`,
`MpiStylePicker`, and `MpiModelManager`'s flag popup, whose comment names it: *"above this
library's body-mode overlay (10010), below toasts (20000)"*). The picker now sits there, as
`.mpi-popup.mpi-color-picker__popup` — double-class, because the popup carries **both** classes
and `.mpi-popup` is also 9999, so a single-class rule only ties and load order would decide.

This was invisible for the picker's whole life because until the close was fixed there was
nothing left to be behind.

**Then the fix exposed the next one:** measured live, the popup was `bottom: 1033` in a 1000px
viewport — the HEX field off-screen. `positionPopup` only ever corrected **horizontal**
overflow. It now flips above the trigger when it will not fit below, and clamps when it fits
neither way. Re-measured on the real paint step: top 273, bottom 627, hex field visible,
`elementFromPoint` at the popup's centre returns a node **inside the popup**, `z-index` 11000
vs the overlay's 10010, flow still open.

### Arrow keys died on the last step

Fabio: *"once I get to the final stage, I can't go back with the keys anymore."* **My own guard
caused it.** `_stepKey` yielded on `_videoBar || _compareView`, reasoning that a video surface
binds the same key. But `_compareView` is non-null for an **image** compare too —
`MpiCompareView` only calls `_bindHotkeys()` when `isVideoA || isVideoB` (`MpiCompareView.js`
:176) — so a **replayed** image result (MPI-587 seeds one on open) mounted a compare view that
binds nothing, and ArrowLeft went dead on the Generate slide.

**The guard is deleted, not narrowed.** The collision is mostly not one: result surfaces live on
the run slide only, so a middle step has no rival; on the run slide ArrowRight is already a
navigation no-op (`_goTo` clamps at the last index) so a video keeps forward frame-stepping; and
ArrowLeft going back is what was asked for. The losing handler is harmless — the video bar's own
`_canDrive()` sees the slide it lives on already torn down. Two tests now pin this: one that the
gate is absent, one on `MpiCompareView`'s video-only binding, so if that ever becomes
unconditional the reasoning is caught.

**Re-verified live in the exact reported state** — scribble flow, image dropped, a replayed
compare result seeded into `s_flowResults`, landed on step 3 with `.mpi-base-flow__result-compare`
mounted: ArrowLeft walked 3 → 2 → 1 and ArrowRight walked back 1 → 2 → 3. And typing is still
inert: a **real** click into the prompt field, `type "a tiger"`, then two ArrowLefts moved the
caret 7 → 5 with the step unchanged at 1. (A first attempt used `.focus()`, which does not stick
in this browser context — `activeElement` stayed BODY — so that run proved nothing and was
redone with a real click.)

702 tests pass. Own isolated instance again (port 50261); the user's `:3000` answered 200 before
and after, killed by launcher PID 8808, probe project unregistered from the shared
`project-paths.json`.

## Still needs Fabio's eyes

The two items that need a photo and the History workspace, from plan.md § Verification:

4. ~~Paint step → click the colour swatch~~ — **done in the second pass**, on the real
   `MpiStepPaint` swatch with an image in the slot: picker opens on top, fully on screen, flow
   stays.
5. History paint / crop / resize / remove-bg / mask-adjust tool options → the picker still
   opens and closes normally. **Still the one outstanding check** — and now it carries the
   z-index change too, not just the reason payload. Both are safe for these five in theory
   (11000 is above nothing they sit inside, and the flip only fires on overflow), but a panel
   near the bottom of the window is exactly where the new flip could surprise.

**Static sweep of all six consumers,** done rather than assumed: `MpiStepPaint` is the one
inside an overlay (the bug). The other five — `MpiToolOptionsCrop`, `MpiToolOptionsMaskAdjust`,
`MpiToolOptionsPaint`, `MpiToolOptionsRemoveBg`, `MpiToolOptionsResize` — are all mounted by
`MpiGroupHistoryBlock`, a Block in the main workspace and not an overlay, which is exactly why
a bare emit was harmless for the picker's whole life. The emit is unchanged in every other
respect, and the picker's own listener stays unconditional, so a second picker still closes.
The one visible change for them: an unrelated `MpiSlideOver` or PromptBox popup left open
elsewhere now survives a colour swatch being clicked.

## Scope decision to record — `promptRequired`

**Honoured in the flow frame only.** Every Flow declares its prompt as a field with
`id: 'positive'`, so one check covers all of them, and a test fails any flow whose op declares
the flag but names its prompt something else. The wider option — `enqueueGeneration`, beside
its `_findMissingMediaSlot` and `_needsMaskButHasNone` siblings — was rejected because it
would start refusing `i2i` / `inpaint` / `edit` / `krea2Edit` / `qwenEdit` / `promptEnhance`
runs that ship today, on surfaces nobody reported and no test covers.

**The residual is real and is not closed:** the flag stays inert on the eleven non-flow ops
that declare it. It is written into the code comment and into `carousel-frame.md` so it cannot
read as complete.

## Claim auditor — one claim corrected

24 claims proven, 2 flagged, both re-verified against the files rather than taken on trust.

**OVERSTATED, and it is right.** The commit body and `plan.md` § Bug 1 both say
`state.s_flowInputs` had *"exactly ONE write site in the whole codebase"*. There are **two**:
`MpiBaseFlow.js` (now `_persistInputs`) and **`js/services/flowService.js:163`**, which seeds
the key from a saved history item on the Reuse path before opening the flow.

It does not change the diagnosis or the fix — the Reuse seed restores a card that was already
run, so nothing typed before a first Generate was ever captured, which is the bug. But the
sentence as written is wrong, and the accurate one is *"one site that captures live state"*.
`flowService.js:163` is untouched, still correct, and already does the top-level replace.

The wrong wording came from the card's own plan text and was repeated into the commit body,
which is now immutable history; corrected here instead. `tests/flow-frame.test.cjs` asserts the
single-writer rule against `MpiBaseFlow.js` only, which was always the right scope — its comment
now says so explicitly so the ambiguity cannot be re-read as the codebase-wide claim.

**UNPROVEN** — the absolute test counts. Addressed under § Automated above.

## Ownership

No file claimed by MPI-567 was edited. `commandRegistry.js` and `flowsRegistry.js` are READ
only — by the frame at runtime and by the new test.
