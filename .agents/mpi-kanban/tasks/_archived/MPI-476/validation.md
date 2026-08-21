# MPI-476 — validation

Everything below is **do X → see Y**. All four fixes are committed
(`d2800e4c`, `01014c1e`) and each was proved in a real DOM — but through the
**browser** build on `:3000`, driven by `playwright-cli`. Nothing has been
looked at in Electron by a human. That is the gap this file closes.

Open the desktop app, not the browser.

---

## 1. The Wan card has no Operations row

**Do:** Model Library → Wan 2.2 Smooth → open its detail drawer.
**See:** description, then **GPU weight** only if it has arch variants (it does
not, so nothing), then **Memory need**, **Disk**. **No "Operations" field, no
"Image to Video" toggle.**
**See also:** the memory table reads `12GB min → ~24GB`, then 16 / 24 / 32 / 40.
If it reads `8.28GB min`, the floor-row fix regressed; if it reads `16GB min`, the
card-ladder fix below did.

**Do:** the same on Krea 2, SDXL NSFW, LTX 2.3, MiniMax H3.
**See:** no Operations field anywhere. It exists on no model now.

**Do:** with Wan 2.2 Smooth already installed, press **Uninstall**, confirm, then
reinstall it.
**See:** it uninstalls and reinstalls the same set it always did. The flatten kept
the identical dep ids, so an existing install must still read **Installed** with
no "partial" bar on first launch — if Wan shows an Install chip or a progress bar
on a machine where it was installed, the flatten changed the resolved set and
that is a real bug.

> **The riskiest thing in this card.** `isOperationInstalled` gained a
> `supportedOps` guard so a flat Wan cannot answer "yes" for the deprecated
> `t2v_ms`. If you have an OLD Wan text-to-video card in a project's history,
> its Continue / Finish buttons must refuse with a toast, not open an error
> dialog and not dispatch. Worth finding one if a project still has it.

## 2. H3's VRAM table starts at 12GB

**Do:** Model Library → MiniMax H3 → detail drawer. Then MiniMax H3 Reference.
**See:** first row `12GB` with the **min** tag → `~44GB`, then 16 → ~40, 24 → ~32,
32 → ~24, 40 → ~16, 48 → ~8, 56 → —. Footnote: *"53GB of weights · min 12GB VRAM."*

> The first row read `~48GB` when this item was written. **2c** below changed the RAM
> rounding from 8GB to 4GB, which is the only reason it now reads 44 — not a regression.
> Every other row was already on a 4GB boundary and did not move.

**Note:** you guessed ~60GB of RAM at 12GB VRAM; the formula gives **44**
(53.15 weights + 1.3 overhead − 12 = 42.45, rounded up to the next 4). If 44 reads too
optimistic for a 12GB card in practice, the number to change is `minVramGb` or
the `OVERHEAD`/`K` constants in `js/data/modelConstants/footprint.js` — say so
and it moves.

**Do:** check any other model's table (Krea 2, LTX 2.3, SDXL).
**See:** the VRAM rows are unchanged from before, still on the 8GB grid above the
floor. Only H3 declares an override. (Their RAM figures did move — see 2c.)

## 2b. Three more cards were floored at 16 for the same reason (added 2026-08-07)

Reported while validating item 2: Wan's floor read 16GB, which is wrong for one of
the cheapest models we ship to run. The cause was not Wan — the computed floor was
rounded up onto the **8GB grid, which has no 12 in it**, so any fit just over 8 was
catapulted to 16. Fixed on the ladder, not per card.

**Do:** open the drawer on **Wan 2.2 Smooth**, **LTX 2.3 Balanced** and **Qwen Image
Edit**.
**See:** each starts at `12GB` with the **min** tag, then 16 / 24 / 32 / 40. The
footnote must say `min 12GB VRAM` — it and the first row now come from the same
number, and before this they could disagree (Wan's footnote said `min 8GB` above a
table starting at 16).

**See on Wan and Qwen specifically:** `12→~24GB`, `16→~20GB`, `24→~12GB`, `32→~4GB`,
`40→—`. The 12 and 16 rows must show DIFFERENT RAM figures. If both read `24GB`, the
RAM column is still rounding to 8GB.

**Do:** check a small model (SDXL NSFW) and LTX 2.3 High.
**See:** the FLOORS are unchanged — `8GB min` and `16GB min` respectively. Only the
three cards above changed floor. Every model's RAM figures moved though (see below).

## 2c. Every RAM figure drops by up to 4GB (added 2026-08-07)

Reported on the back of 2b: Wan read `12→24` and `16→24`, the same number twice, which
says a 16GB card buys nothing over a 12GB one. It does — 22.5GB vs 18.5GB — the 8GB
rounding was burying it. The RAM column now rounds up to 4GB. Still `ceil`, so still
only ever over-stating; the real margin is the OS-reserve footnote, not this rounding.

**Do:** open LTX 2.3 (High).
**See:** `16GB → ~48GB` — unchanged, because its raw figure already sat near an 8GB
step. 17 of 20 models DID move: e.g. Krea 2 `8→~20GB` (was 24), SDXL `8→~4GB` (was 8).
**See:** no row reads a LOWER RAM figure at a LOWER VRAM level anywhere. That would be
the one real bug this change could introduce.

## 3. The tier letter only appears when it disambiguates

**Do:** look at the prompt-box model button and the gallery card badges.
**See, with your current install set** (Krea 2 NSFW, FLUX.2 Klein, SDXL NSFW,
LTX 2.3, Wan 2.2 Smooth, MiniMax H3, MiniMax H3 Reference):

| Surface | Before | Now |
|---|---|---|
| Model button on H3 | `MINIMAX H3 H` | `MINIMAX H3` |
| Gallery card, Wan | `WAN 2.2 SMOOTH B` | `WAN 2.2 SMOOTH` |
| Gallery card, LTX | `LTX 2.3 B` | `LTX 2.3 B` — **kept**, if both LTX tiers are installed |

If only ONE LTX tier is on disk, LTX loses its letter too, and that is correct —
nothing to tell apart.

**Do:** Model Library → MiniMax H3.
**See:** `VIDEO · Balanced tier`, and it sits under the **Balanced** size filter,
not High. Same for MiniMax H3 Reference.

## 4. Chips relabel when the model changes

This is the one you reported, and the one your existing H3 generations can
exercise directly.

**Do:** select **MiniMax H3 Reference**, drop an image in the prompt box.
**See:** the chip badges **Picture 1**.
**Do:** switch the model to **LTX 2.3** without touching the chip.
**See:** the badge is gone and the chip now shows the **Start frame** pill.
**Do:** switch back to H3 Reference.
**See:** **Picture 1** again.

**Do:** switch to **Wan 2.2 5B** (if installed) with one image staged, then to H3
Reference.
**See:** Wan 5B shows no badge and no pill (its single-stage `i2v` declares no
end-frame slot); switching to H3 Reference must make **Picture 1** appear. This
is the fast-path hole specifically — a badge element that never existed could not
be created, so before the fix this transition painted nothing at all.

**Do:** stage 3 images on H3 Reference and drag one to reorder.
**See:** badges renumber Picture 1 / 2 / 3 in strip order, and the drag stays
smooth — no flicker, no thumbnails reloading. The fix must not have broken the
reorder fast path.

**Do:** on LTX with one image, click the **Start frame** pill.
**See:** it flips to **Last frame** as before.

---

## What would signal a real bug

- Wan (or anything) reading **Install** / showing a partial bar when it was
  installed before this change → the flatten moved the resolved dep set.
- An **Update** button appearing on a model with no GPU-arch variants → arch is
  the only draft axis left, so nothing else can make drafts differ.
- A **Continue/Finish** on an old Wan t2v history card opening the error dialog
  instead of a toast → the `supportedOps` guard is not doing its job.
- An off-grid VRAM row (`8.28GB`) on any model that does not declare
  `minVramGb`.
- A chip badge that is right on arrival but wrong after a model switch — i.e.
  the original report, unfixed.

## Not in scope here

MPI-475's own gates are untouched by this card: the judgement run on the correct
ref2va transformer, and swapping in a real ref2va preview clip. See
`tasks/MPI-475/validation.md`.
