# MPI-384 Validation

**State:** implemented, engine-proven, **awaiting the user's live check in the app.**

---

## Proven on the live bench engine (127.0.0.1:8188, 2026-07-29)

Four runs of the converted `img_auto_mask.json` posted straight to `/prompt` with
`Input_Text_Mode` on, against `t2i_002.png` (a horned creature — two horns, two eyes).
Chip count = images out of `Output_Detected`.

| Prompt | `individual_masks` | Chips | What it proves |
|---|---|---|---|
| `horn:2` | **true** | **2** | the branch runs and splits per object (~3.2s) |
| `horn:2` | false | 1 | negative control — off, SAM3 unions into one mask |
| `horn` (bare) | true | **1** | **the `name:N` trap, live**: no cap = one detection |
| `horn:2, eye:2` | true | **4** | per-category stamping is required and works |

`person:2` on the same image also completed clean (1 detection), so the CLIP wiring on the
previously-unused `CheckpointLoaderSimple` output is real, not a lucky shape match.

## Automated

- `tests/mask-text-prompt.test.cjs` — NEW, 4 tests over the `name:N` stamper (per-category,
  user-typed `:N` stripped, empty → empty, nonsense counts clamp). All pass.
- `tests/auto-mask-inject-titles.test.cjs` — re-anchored the points lookup on the
  `SAM3 Points` title (a second `SAM3_Detect` made the class-only `find()` a coin flip) and
  added a text-branch wiring test. **Negative-control proven**: flipping
  `individual_masks` to false in the API JSON fails it; restored, it passes.
- `tests/mask-tool-registry.test.cjs` — 4/4; `maskText` is picked up automatically from the
  rail, and the brushless list now covers the new organism.
- Full suite: **239 pass / 9 fail**, and the failure LIST is byte-for-byte the known
  pre-existing 9 (`optional-media-placeholder`, `permodel-key-allowlist` ×3,
  `resolve-model-deps`, `remoteProxy` ×4). Nothing new broke.
- `eslint` clean on every touched file.
- `git status`: only the two `img_auto_mask.json` files moved — the converter's stray-template
  blast radius did not fire (single-file mode writes to stdout; redirected explicitly).

## NOT proven — needs the user

Everything above is the graph and the pure logic. The UI has never been mounted:

1. Mask group → the new **Text** icon (between Points and Detect). Type `bikini`, count `2`,
   press **Detect**.
2. Chips come back; clicking one paints it green **and unlocks the op strip** (that unlock is
   new behaviour this card added — worth watching, it also affects the Detect tool).
3. **Add** bakes it; place a second name and Add again to accumulate.
4. Empty prompt + Detect → toast "Type what to mask first", no run.
5. Swap Text → Points → Text: the mask is NOT cleared, right-click still opens the image
   context menu, and the typed text/count come back from tool settings.
6. Remote engine (Pod): the prompt must arrive as text, not as a media upload. The encoder is
   not in `PATH_MEDIA_CLASSES`, so this should be a non-event — but MPI-380 hit exactly this
   trap on the points branch, so it is worth one remote run.

---

## USER-VERIFIED LIVE — 2026-07-29

Five screenshots, all green:

- `bikini` / 2 → two chips, both bikinis masked cleanly **including the thin side-straps
  and hip ties** — the exact failure that carded this tool.
- `cup` / 2 → the glass masked as one clean object.
- `hair` / 2 → per-person hair, one chip each (the near-impossible YOLO class).
- `cup, earing` / 2 → **three chips** (two cups + one earring): multi-category stamping
  works end-to-end through the UI, not just the probe.
- Empty prompt + Detect → "Type what to mask first" toast, no run.

Chips render green on pick, Add bakes, the rail icon sits between Points and Detect.

**Card CLOSED on that.** The one remaining item — a remote (Pod) run — is NOT a defect and
NOT a blocker; it moved to the RunPod verification umbrella (MPI-385) with the other
Pod-only checks, so it gets done in one Pod session instead of forcing one per card.
