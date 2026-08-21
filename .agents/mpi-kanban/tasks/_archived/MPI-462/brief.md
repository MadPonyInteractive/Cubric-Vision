# MPI-462 - Phantom partial bars, and weights that belong to nothing

## Symptom (user-reported 2026-08-06)

Model Library shows six models with a partial-install bar the user never started:
Chroma Flash 17%, Chroma Hyper 22%, Boogu Image Edit high 35% / balanced 49%,
LTX 2.3 high 33%, Wan 2.2 5B 36%. "Why do I have so many models partially
installed?" - none of them are.

All six percentages were reproduced exactly against the live disk state, so the
mechanism below is measured, not inferred.

## Defect 1 - the partial bar excludes on a STRICTER "installed" than anything else

`_computePartial` (MpiModelManager.js) discounts deps already owned by another
installed model, so a shared file does not read as progress (MPI-258 Bug A).
`_sharedOwnedDepIds` builds that exclusion set with:

```js
if (m.id === excludeModelId || m.installed !== true) continue;   // :610
```

`m.installed` is set at `modelRegistry.js:189` from the whole-universe check -
EVERY dep of EVERY op present. Nothing else in the app uses that meaning:

- the same component decides "is this installed" at :705, :1123 and :1307 as
  `model.installed === true || installedOps.length > 0` (>= 1 op),
- `modelRegistry.js:228-232` explicitly emits the installed set from
  `isModelUsable` (>= 1 op) and says why,
- and the BACKEND uninstall guard `_localSharedDepsMap` resolves ownership from
  `deriveInstalledOps` - the lenient one. Verified live: it currently protects 65
  dep ids.

So for any multi-op model the exclusion never fires, and its weights are billed to
its sibling tier. Measured 2026-08-06:

| Tile | Bar | The bytes it is counting |
|---|---|---|
| Wan 2.2 5B | 36% | `umt5_xxl_fp8_e4m3fn_scaled` 6.27GB - owned by Wan 2.2, which IS installed in the UI but is not universe-complete |
| LTX 2.3 high | 33% | 20.4GB of LTX shared assets (Gemma clip, both VAEs, upscaler, 3 LoRAs) downloaded by LTX 2.3 balanced |
| Boogu high / balanced | 35% / 49% | the same `boogu-qwen3vl-8b-clip` 10.59GB, counted twice |

Fix: build the exclusion from the same predicate every other install decision uses
(`isModelUsable` / `deriveInstalledOps`), not the raw `installed` flag. It is a
shared-primitive change - sweep every `m.installed === true` reader in the
component and in modelRegistry and classify each before touching one.

## Defect 2 - ~16GB on disk that no installed model needs, invisible in-app

- `text_encoders/qwen3vl_8b_fp8_scaled.safetensors` - 10.59GB, mtime **Jul 11**,
  wanted only by the two Boogu tiers, neither installed.
- Chroma family, 5.3GB - `controlnet/FLUX.1-dev-ControlNet-Union-Pro-2.0`
  (4.28GB, Aug 2), four `loras/chroma/styles/*`, `vae-flux-ae`; wanted only by
  Chroma Flash/Hyper, neither installed.

All COMPLETE files. `find G:\\CubricModels -name '*.cubricdl'` returns nothing, so
these are not abandoned partials - they are survivors of earlier installs.

**The guard is not the culprit.** Driving `_localSharedDepsMap` directly today:
uninstalling `boogu-edit-balanced`, `boogu-edit-high` or `chroma-flash` would
DELETE every one of those three suspects. So the files did not survive because
something protected them.

The user uninstalled **Boogu Image Edit balanced today** (high was already gone),
along with Krea2 and Qwen Edit. The Krea2 and Qwen uninstalls logged normally
(`uninstall krea2: removed 1, kept 9 universal, 16 shared`, 21:40Z) - **there is no
uninstall line for Boogu in any retained log** (Jul 30 -> now; note a coverage gap
15:35Z-20:45Z on 2026-08-06 where app.log rotated). The clip is still at its
original path with a Jul 11 mtime, so nothing even moved it to trash.

Candidate root causes, to be settled by repro, NOT by assumption:

1. The dep list POSTed to the uninstall route omitted the asset dep (the route
   deletes what the CLIENT sends; a resolution gap client-side is invisible to the
   guard).
2. The uninstall ran an op-level path that never covered common/asset deps.
3. It errored before the completion log line.

Repro: install Boogu Image Edit balanced, uninstall it with no other Boogu tier
installed, and watch whether `qwen3vl_8b_fp8_scaled.safetensors` is trashed and
whether the `uninstall <model>: removed N` line appears.

Even with Defect 1 fixed, Chroma would still draw a bar - nothing owns those bytes.
The 1GB floor (MPI-258 Bug C) was sized to stop SMALL support files drawing phantom
bars; a 4.28GB ControlNet and a 10.59GB clip sail straight past it.

## Product question attached to Defect 2

There is no in-app way to see or reclaim weights no installed model needs. Options:
a reclaim action in the Model Library, a line in Settings, or leave them so a
reinstall is instant. User decision, not a bug fix.

## Not this card

- MPI-320 (retire `_modelJobs`/`_depJobs`) and MPI-397 (card-move lag) are adjacent
  and neither covers this.
- MPI-258 Bug A/C built the exclusion and the 1GB floor being corrected here.

---

## Defect 1 — FIXED and measured 2026-08-06 (MpiModelManager.js `_sharedOwnedDepIds`)

Gate changed from the raw `m.installed` flag to `_installedOpsOf(m).length > 0` — the
same >=1-op predicate `_modelState` (:705), `_listSignature` (:1123), the section split
(:1307), `isModelUsable` and the backend uninstall guard already use. Sweep of every
`m.installed === true` reader: those three already union `|| installedOps.length > 0`,
and `modelRegistry.js:395/:423` are "no dep cache yet -> trust the server flag"
fallbacks. Only :610 gated on the flag alone. One line changed.

Second half of the fix, NOT in the original diagnosis: a >=1-op model is not
universe-complete, so unlike the old flag its universe can name deps that are NOT on
disk. Each owner's universe is now intersected with its own dep status, so an absent
dep stays in the target model's denominator instead of being excluded from both sides.

Measured against live disk (probe replaying both exclusion rules over the real
registry + dep status, then confirmed against the rendered tiles):

| Model | old | new |
|---|---|---|
| LTX 2.3 high | bar 33% (20.4 / 61.4GB) | no bar (0 / 41GB) |
| Wan 2.2 5B | bar 36% (6.27 / 17.2GB) | no bar (0 / 10.93GB) |
| LTX 2.3 balanced | no bar, 99%, all installed | unchanged (no regression) |
| Chroma Flash / Hyper | 17% / 22% | unchanged |
| Boogu high / balanced | 35% / 49% | unchanged |

The shrunken denominators (61.4->41, 17.2->10.93 = each model's own unique weight) show
the on-disk intersection did not over-exclude. Rendered tiles now show four bars where
six were. `npm test`: 467 pass, 0 fail.

Note the card's Defect-1 table mis-assigned Boogu: neither tier is >=1-op installed, so
no exclusion rule can clear those two bars. Boogu and Chroma are BOTH pure Defect 2 —
four bars drawn by bytes no installed model owns.

## Defect 2 — two of the three candidates are eliminated; Defect 2 remains OPEN

- **Candidate 1 (client POSTed a dep list missing the asset) — RULED OUT.**
  `resolveFullUniverse('boogu-edit-balanced', null, 'local')` returns
  `boogu-edit-transformer-balanced, boogu-qwen3vl-8b-clip, vae-flux-ae` + 4 nodes.
  The clip IS in what `_confirmWholeUninstall` sends.
- **Candidate 2 (an op-level path that never covers common/asset deps) — RULED OUT for
  this model.** `boogu-edit-balanced` is FLAT: `dependencies` array, no operation
  groups, no arch variants. So `hasOps` and `_hasArch` are both false,
  `draftDiffersFromInstalled` can never be true, the detail button is always
  "Uninstall" (:1070-1074) and `_applyUpdate`/`_opUninstallDepIds` is unreachable for
  it. (The common-deps-always-kept behaviour in `_opUninstallDepIds` is real — `keep`
  includes commonDeps — but no Boogu click can reach it.)
- **Candidate 3 (errored before the completion log line) — still live, and the log
  evidence CANNOT settle it.** The retained-log coverage gap is much bigger than the
  card claimed: `%APPDATA%\Cubric Vision\logs\` has no archive between
  `app-20260804-200240.log` and `app-20260806-133451.log`, and app.log is overwritten
  per session. Absence of the line proves nothing over that window.
- **New hypothesis 4, worth testing alongside 3:** the backend shared-dep guard kept the
  clip because the SIBLING tier still read as installed at that moment. Boogu's two
  tiers share the clip and `vae-flux-ae` and differ only by transformer, so whichever
  tier is uninstalled second is the only one that can free the clip. The card's
  "the guard would delete it today" check was run with BOTH tiers already gone — a
  different state from the one the uninstall actually ran in.

Positive evidence the model really was installed and really did go away:
`2026-08-05T06:05Z` ComfyUI's unet list contains `boogu_image_edit_turbo_int8_convrot`
(the balanced transformer); it is absent from disk now, while the clip survives at its
original path with a Jul 11 mtime. So something removed the transformer and not the clip.

Cheap repro (no 22GB download): the isolated engine-root harness —
`CUBRIC_ENGINE_ROOT` at a throwaway dir with fake dep files + DEPS swapped in
`require.cache` — drives the real uninstall route both directions, and can order the
two tiers' uninstalls to test hypothesis 4 directly.

---

## Defect 2 — mechanism found 2026-08-06. The guard is behaving AS DESIGNED; the gap is that nothing re-checks afterwards.

Two runs, both real code:

**1. Live, through the actual route.** POSTed `/comfy/models/uninstall` for
`boogu-edit-balanced` with just `boogu-qwen3vl-8b-clip` + `vae-flux-ae`, with no other
Boogu tier on disk — the card's exact repro condition:

```
uninstall: moved to trash G:\CubricModels\text_encoders\qwen3vl_8b_fp8_scaled.safetensors
uninstall: moved to trash G:\CubricModels\vae\ae.safetensors
uninstall boogu-edit-balanced: removed 2, kept 0 universal, 0 shared, 0 model files
```

So in TODAY's state the route deletes the clip and logs normally. Candidate 3 (it
errored) is not reproducible from this state — whatever happened needed a different one.

**2. Isolated harness over the real guard** (`guard-harness.cjs`, next to this brief —
`CUBRIC_MODELS_ROOT` at a throwaway dir, sparse files at the deps' real relative paths,
calls the real `_localSharedDepsMap('boogu-edit-balanced')`; no app, no port 3000):

| Disk state | Clip protected by | Uninstall balanced would |
|---|---|---|
| A both tiers complete | Boogu Image Edit (high) | KEEP — correct |
| B only balanced (today) | nothing | DELETE — matches the live run |
| C high transformer only, no clip on disk | Boogu Image Edit | (no-op — clip isn't there) |
| **D high transformer + clip on disk, high NOT usable** | **Boogu Image Edit** | **KEEP** |
| E only the clip left | nothing | DELETE |

**D is the state that orphans the clip, and it is intentional.** At
`routes/downloadManager.js:218` a sibling with zero installed ops falls back to
`resolveDeps(model, null, ...)` — its FULL universe — as long as it has any exclusive
dep on disk (`:213-215`). For `boogu-edit-high` the exclusive dep is its own transformer
`diffusion_models/boogu_image_edit_bf16.safetensors`. That is exactly the MPI-310 rule
written at `:205-206`: "a model whose shared encoder was deleted still has its own
transformer → still defends what it declares" — the rule that stopped 5.24GB of user
data being destroyed. Scenario C is the same mechanism and harmless (it names a dep that
isn't on disk); my expectation row for C was wrong, not the code.

So the sequence that produced the orphan needs no bug in the guard:

1. `boogu-edit-high`'s transformer is on disk (installed, or a part-finished install).
2. Balanced is uninstalled → the guard KEEPS the shared clip because high defends it.
   Correct at that instant, and it is why no `removed N` line mentions the clip.
3. High's transformer later leaves without a route uninstall (a cancelled/failed
   install cleanup, or a manual delete) → the clip is now defended by nobody, and
   scheduled for deletion by nobody either.

**The real gap: no step ever re-checks for deps that became orphaned after the fact.**
Uninstall only considers the model being uninstalled. Nothing reacts to a model
*ceasing* to be installed by any other route.

### Proposed fix — NOT implemented, needs a decision (MPI-310 precedent)

After any uninstall (and after an install is cancelled/cleaned up), sweep for deps that
are on disk and in NO model's universe where that model has >=1 installed op, then trash
them. That is precisely the scan run this session: it found 8 deps / 15.91GB with zero
false positives, correctly clearing `vae-flux-ae` (wanted by chroma x2, nvidia-pid,
boogu x2 — none installed) and correctly declining to touch anything owned by the six
usable models. It needs the `universal` exemption the route already applies
(`4x-AnimeSharp` was kept as universal) and the in-flight-install-job protection.

Briefing rather than shipping it because MPI-310 destroyed 5.24GB of user data with an
adjacent change to this same guard.

### Disk reclaimed this session

7 of the 8 orphans trashed via the app's own uninstall route (~15.85GB): the Boogu clip,
`vae/ae.safetensors`, the FLUX ControlNet Union and the four Chroma style LoRAs.
`4x-AnimeSharp` (65MB) was kept — the route classifies it `universal` and never deletes
those. All six phantom bars are now gone from the Model Library. Per the user, no
reclaim UI: a system that leaves no leftovers has nothing to clean up.

---

## The collector, built 2026-08-07 — and why "it must have existed before" is not what happened

The user's read was that a sweep existed and a refactor dropped it. History says otherwise,
and the real answer is worse:

- **No orphan collector has ever existed in this codebase.** `git log` has no removal.
- **"GC protection" in this repo means the opposite thing.** `33b09b3e` (MPI-310 step 0) and
  `tests/plugin-dep-gc.test.cjs` protect app/plugin deps *from* deletion by the uninstall
  guards. Protection lists, never a collector.
- **MPI-314 (2026-07-19) is this exact defect, and it was closed WITHOUT shipping code.**
  Title: "Orphaned-dep reclaim: ownerless weight files have no UI path to delete them". An
  agent ran a one-off read-only scan, found 8 ownerless LTX-2.3 deps = 18.62GB, deleted them
  by hand on the user's go-ahead, and closed the card with: *"NO code shipped and NO cleanup
  UI built ... this was a one-time fossil, not a live leak."*

**That verdict is now disproven.** 19 days later a different model family (Boogu + Chroma)
stranded a fresh 15.91GB by the same mechanism. Two independent occurrences in under three
weeks is a live leak. MPI-314 also specified the design that was never built, and this
implementation follows it: route the decision through the SAME protection primitives, never
write a second parallel notion of "orphan".

### What shipped

`_orphanedDepIds` + `_sweepOrphanedDeps` in `routes/downloadManager.js`, called at the end of
the LOCAL uninstall route, gated on `deleteFiles`. The orphan test is
`_localSharedDepsMap(null)` — the existing guard with nothing excluded, which already unions
every installed model's deps, live install jobs, flow deps and plugin deps. A dep on disk and
absent from that map is wanted by nobody.

Refusals, all tested: `custom_nodes` (work-not-bytes, and the local
`custom_nodes/ComfyUI-MpiNodes` is a SYMLINK to the node source repo — sweeping it would
destroy that repo), `targetPath` engine-anchored weights, universal workflow deps, and
anything resolving outside the managed models root. Trash first with a permanent-delete
fallback, same as the uninstall loop.

`tests/orphan-sweep.test.cjs` — 5 tests over the real functions against a throwaway
`CUBRIC_MODELS_ROOT`. Suite: 472 pass, 0 fail (was 467).

Read-only classification against the user's REAL disk: 65 deps protected, 41 orphan-eligible
registry-wide, **0 actually on disk** — the sweep would delete nothing right now, which is
correct because this session already reclaimed the 8.

### Deliberately NOT shipped — needs its own card

- **The REMOTE twin.** The engine-split rule wants both. The remote branch returns before the
  sweep, so a Pod volume can still strand deps. It needs `_remoteSharedDepIds` plus a volume
  file inventory, and it cannot be verified without a live Pod — shipping unverifiable
  deletion code at a user's volume is the wrong trade. Carded.
- **Cancelled/failed install cleanup as a second trigger.** An install that fetches a shared
  dep and is then cancelled can strand it. Uninstall is the mechanism proven to strand twice;
  this one is theoretical so far.
