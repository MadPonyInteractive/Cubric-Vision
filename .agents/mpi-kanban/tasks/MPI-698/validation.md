# MPI-698 Validation

## Outcome: the swap was built, evaluated, and REJECTED

The NVFP4 AWQ encoder is not in the product and will not be. Closed `rejected`
rather than `complete` because the thing the card is named after — the swap —
does not ship. The work that survives is its reversal and cleanup.

**Why it lost** (Fabio, 2026-09-05): ~10 generations of entity duplication — a
third leg, a cup from nowhere — against a long clean int8_convrot baseline. The
censorship half of the original A/B held; the "IDENTICAL results" claim did not.
The original sample was too small to catch occasional structure corruption.

**What it cost to keep int8_convrot:** the 26.4GB build keeps the resident pair
near ~45GB, which is what gates H3 Pod smoke on a 54GB box. Accepted on the
quality evidence above.

## Revert — verified in place, not just claimed

- Both H3 models point at `h3-qwen3vl-32b-clip` (int8_convrot Heretic) —
  `fb57759e`, with the fl2va straggler caught by `f91438ca`.
- Baked runtimes `minimax_h3_fl2va.json` / `minimax_h3_r2va.json` name the
  Heretic build. Confirmed by grep at close-out, not inherited from the checklist.
- **The two raw `*_template.json` sources were checked and are CORRECT.** They
  each still contain the nvfp4 filename, but only inside `properties.models[]`,
  which is LiteGraph download-hint metadata. The selection lives in
  `widgets_values[0]` / `widgets_values_named.clip_name`, and both name the
  Heretic build. `generate_h3.py` reads the widget value. An earlier read of this
  session called it a live regeneration landmine; that was wrong, and the check
  above is what settles it. The stale hint metadata is cosmetic.

## R2 deletion — done 2026-09-07, authorised by Fabio

Supersedes the standing "THE R2 OBJECT IS NOT TO BE DELETED" note (his own,
2026-09-05). Reason given: the low tier is out of 1.5.0, so nothing is waiting on
this build, and it never appeared in a released version.

Safety check that made it safe, per `docs/playbooks/add-model/README.md` § 8 —
the hazard is a released build listing the dep and 404ing instead of skipping.
The dep landed 2026-09-05; v1.4.4 shipped 09-03. **No released build lists it.**

```
rclone --config C:/Users/Fabio/.secrets/rclone-r2.conf deletefile --s3-no-check-bucket \
  cubric-r2:cubric-models/vision/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
```

Verified after:
- `HEAD https://models.cubric.studio/.../qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` → **404** (was 200, 15,687,142,551 bytes)
- `HEAD https://models.cubric.studio/.../qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` → **200** (live encoder untouched)
- `rclone lsf` on `text_encoders/` lists the Heretic build and no nvfp4.

**No local copy exists.** `G:\CubricModels\text_encoders\` holds only the 26.4GB
Heretic file, so the playbook's "re-uploadable from `G:\CubricModels`" does NOT
hold here. Recovery = re-download from Comfy-Org/MiniMax-H3, which is still up.

## Dep entry — kept, URLs dropped

`h3-qwen3vl-32b-clip-nvfp4` stays in `DEPS` (playbook § 3) but lost its `url` and
`mirrorUrl`. That exact pair is what satisfies both constraints at once:

- `_orphanedDepIds` (`routes/downloadManager.js:307`) keys off `filename` and
  never reads a URL — the entry still lets an uninstall reclaim 14.61GB from a
  dev box that already pulled it.
- `check-dep-urls.mjs:52` skips any dep with no `url` — so the deleted object
  cannot redden `release:deps`.

Deleting the entry would blind the sweep; keeping the URLs would fail the gate.
Both URLs are preserved as comment text so a re-upload need not reconstruct them.

## Checks run at close-out

- `npm run release:deps` → **All 302 URLs reachable** (green after the edit; it
  would have failed with the URLs left in).
- `npm test` → **902/902 pass**.
- Consumer sweep: `grep -rn qwen3vl_32b_minimax_h3_nvfp4_awq` across `js/`,
  `routes/`, `scripts/`, `tests/`, `comfy_workflows/*.json`,
  `operation_registry.json` → zero hits outside the dep entry.

## Not done here

The 1.5.0 branch (`1.4.2`, worktree `C:/AI/Mpi/Cubric-Vision-1.4.x`) still ships
the NVFP4 encoder — its `assetDeps.js` calls the Heretic build "SUPERSEDED by
`h3-qwen3vl-32b-clip-nvfp4` and referenced by NO model", the exact inverse of
master. Porting the revert is part of the 1.5.0 work, not this card.
