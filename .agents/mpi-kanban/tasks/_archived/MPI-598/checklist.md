# MPI-598 Checklist — wire Klein 9B, update 4B

Derived from `docs/playbooks/add-model/README.md` § Checklist, narrowed to what this card
actually owes. `brief.md` holds the reasoning; `research/session-2026-08-22-assets-and-lanpaint.md`
holds the converter swap table and the `Input_is_9b` gate map. **Read both before ticking anything.**

Not a greenfield model — the graph is proven, the weight is decided (MPI-600), both 9B LoRAs
are downloaded and hash-verified. Playbook Phase 0 was already satisfied.

## Workflow (playbook 01)

- [x] Template edited **in the ComfyUI graph and re-synced** — Fabio saved it 2026-08-22;
      `node scripts/sync-raw-workflows.mjs` committed the raw source, converted to API,
      passed `validate-injection-rules.mjs`, and baked both runtimes
- [x] Converter applies the 9B swap — `generate_klein.py` now emits ONE runtime per size
      from the single template: `Input_is_9b`, `#27` UNETLoader, `#14` CLIPLoader,
      `#38` NSFW LoRA, `#143` refcontrol-depth LoRA. Swap targets bound by class with
      exact-count asserts, not by node id
- [x] Loader paths use the backslashed `flux2-klein\<file>` form and match the dep
      `filename` exactly — parse cross-ref run, 6 real loader paths per runtime, all hosted
- [x] Runtime filename all-lowercase and agrees with the `models.js` workflows key
      (`klein_9b_t2i.json`)
- [x] `Input_is_Turbo` and `#259` (4B outpaint LoRA) confirmed GONE from the shipped graph
      — both left with the fake-inpaint path LanPaint replaced
- [x] **Outpaint on 9B: DECIDED.** No 9B outpaint weight exists and none is needed — the
      LoRA left the Klein graph entirely on both sizes. The 4B dep entry and its R2 object
      stay; that retirement is MPI-603 and is untouched here

## Dependencies + R2 (playbook 02)

- [x] NEW dep `qwen3-8b-clip` (`qwen_3_8b_int8_convrot.safetensors`, 8.79GB) — nothing
      promotable (`qwen3-4b-clip` is 4B; `boogu-qwen3vl-8b-clip` is Qwen3-VL at type `boogu`)
- [x] NEW dep `klein-9b-transformer` (8.79GB). Described as plain **int8 tensorwise, NOT
      ConvRot** — header read confirms a scalar `weight_scale`. The ENCODER lies the same
      way; 4B is genuinely rowwise (`[3072, 1]`)
- [x] NEW baked-LoRA deps `klein-9b-lora-nsfw` (304.02MB) + `klein-9b-lora-refcontrol-depth`
      (158.03MB)
- [x] Hashes filled from the LOCAL copies — all four agree THREE ways: local sha256, HF
      `lfs.oid` via `paths-info`, and the research file. Zero null hashes across all 130 deps
- [x] `LanPaint` pinned + declared — `scraed/LanPaint` @ `9fe91955` (tag v2.1.0), GPL-3.0,
      upstream not forked. Bench copy verified byte-identical to that commit before pinning.
      Dep on BOTH 4B and 9B
- [x] `progressStages.js` — **no entry, deliberately.** Klein has none today for the same
      reason Chroma has none: one master graph whose per-op bar counts differ, so a wrong
      total renders "Stage 3/1" and reads as broken. 9B inherits that
- [x] **R2 upload of the four new weights (18.02 GB)** — approved by Fabio 2026-08-22, DONE,
      exit 0. Serialized `--transfers 1 --bwlimit 3M` per the capability doc, holding
      2.98 MB/s throughout (which also rules out VPN throttling). **All four verified over
      HTTP: 200 with byte counts matching their dep entries exactly.** ETags come back
      multipart (`-1800`, `-61`) so they are NOT sha256 — the byte count plus the
      pre-upload hash is the check

## Registry (playbook 03/04/05)

- [x] `klein-9b` ModelDef beside `klein-4b`; MPI-357 licence gate arms itself off the
      reserved id (test log confirms a live probe: `probe 401, LICENSE.md 200`)
- [x] Description carries the thin-headroom warning (~15GB peak, 16GB card, points at 4B
      on OOM) and the silent reference-placement failure
- [x] 9B ships **styleless** — `styleLoras: false`, `styleOps: []`, no `styleLora*` arrays.
      The rack nodes stay in the graph behind `Input_is_9b`, so styles are a later value
      change, not a rebuild
- [x] Both Klein cards share `modelFamily: 'FLUX.2-Klein'` with distinct `sizeTier`
      (low / balanced) so the L/B badge disambiguates
- [x] No new op ⇒ `operationRegistry.js` / `commandRegistry.js` / `operation_registry.json`
      untouched. No new `type` ⇒ no consumer sweep
- [x] No app version bump
- [x] `npm test` — 680 pass, 0 fail

## Klein 4B, same pass

- [x] 4B rebaked from the same template: LanPaint inpaint, no turbo node, no outpaint LoRA,
      gained the family key. Its four weight names are unchanged

## Verify (playbook 06)

- [x] Parse cross-ref — every loader path in BOTH runtimes maps to a hosted dep
- [~] **App launch + real generations. THREE of seven ops PROVEN** in Fabio's own app
      2026-08-22, all 896x1088, all recorded in their sidecars as `modelId: klein-9b`
      (the field is `modelId`, NOT `model` — a direct `d.get('model')` reads None):

      | op | ms | note |
      |---|---|---|
      | `t2i` | 6064–6283 warm, 11591 cold | ×5 |
      | `inpaint` | 31785 | **the new LanPaint path** — the one that most needed proving |
      | `kleinEdit` | 30981 | localised edit survived the template consolidation |

      That exercised the ModelDef, the MPI-357 licence gate live, dep resolution against
      `G:/CubricModels`, the LanPaint install into the app engine from the pinned commit,
      and the generated `klein_9b_t2i.json`. The model button renders **"FLUX.2 KLEIN B"** —
      the family + tier badge working.
      ~~**STILL UNPROVEN: `i2i`, `control`, `detail`, `upscale`**~~ — CLOSED by the Pod
      smoke below, 2026-08-22. All seven ops now have a real generation behind them:
      three in Fabio's app at 896x1088, four on an L4 at the smoke budget
- [x] Smoke per `docs/playbooks/bump-engine/01-smoke-run.md` — **PASS 7 · SKIP 0 · FAIL 0**
      on an L4 in EU-RO-1, 2026-08-22, engine proven 0.31.0 (gate 7 fired). The four
      unproven ops are closed: `i2i` 8s, `control` 21s, `detail` 4s, `upscale` 9s — and
      t2i / kleinEdit / inpaint re-proven on Pod. `covers klein-4b`, so 4B rides along.
      Evidence + the two findings (the Pod lock was behind; `checkPodLock()` over-reports
      for code-only nodes) → `validation.md`
- [x] **`klein-9b.webp`** — placed. Converted from Fabio's t2i at native 896x1088 (the fleet
      convention, matching klein-4b and krea2), webp q85, 95,878 bytes — in range against
      klein-4b's 83,216. Encoded from the PNG source, never from an encoded buffer. Verified
      every ModelDef `image` in the fleet resolves on disk
- [x] `docs/models/klein/9b.md` — NEW sibling holding the whole 9B delta (the 5-value swap,
      weights, both filename lies, the licence gate, styleless, the rejected turbo/KV results,
      LanPaint, and why the outpaint object must stay up). `README.md` gained a 4-line pointer
      and `docs/models/README.md` routes to it.
      **NOTE `klein/README.md` is now 205 lines, 5 over the 200 convention.** It was AT 200
      before. Two clean fixes, neither taken unilaterally: add it to the exemption list in
      `docs/README.md`, or split its "Which checkpoint ships" + "flipped twice" decision
      history (~37 lines) into a sibling. Fabio's call.
- [x] `docs/releases/UNRELEASED.md` — three entries: the 9B card + its VRAM warning, the
      licence-acceptance step (first time a user can perceive the MPI-357 gate), and Klein
      inpainting properly with removals now user-specified

## Out of scope — do not drift into these

- **MPI-602** — LanPaint integration as its own card. NOTE it is now partly overtaken:
  the pin and the dep landed here because the shared template needs them
- **MPI-603** — outpaint LoRA retirement (blocked on the Character Sheet flow). The weight
  left the Klein GRAPH here; the dep entry, R2 object and `models.js:969` listing are all
  still MPI-603's to remove, in that order, after a release
- **MPI-367** — the stale inpaint help copy (removals are now user-specified)
