# TTS in Vision: resolve Qwen3-TTS viability, then wire Chatterbox + Qwen as Flows

> ### 2026-08-23 SESSION 14 -- GATE 2 FLOW A IS BUILT. One gate left on it: Fabio listens.
>
> **The Voice Changer Flow exists in the repo and its GRAPH is proven on real audio.**
> `npm test` 728/728. Read `validation.md` from "session 14" down before touching any of it.
>
> Shipped: `comfy_workflows/{raw/,}flow_voice_changer.json` (5 nodes), the `flowVoiceChanger`
> op in all 4 registries (`appVersionIntroduced` 1.5.0), the `voice-changer` FlowDef
> (`requiredModels: []`, `mediaType: 'audio'`, **1.057GB** of deps), an inject-titles test
> case, and `docs/playbooks/add-flow/existing-flows/voice-changer.md`.
>
> **Proven live on the bench:** the SHIPPED runtime file, real clips, `status success`,
> 12.1s, `execution_cached: []`, and node 5 `Output_Audio` emitted a real flac in exactly the
> shape `_collectComfyAudioUrl` reads. **Perth marking is APPLIED** -- watermark 1.0 on the
> output vs 0.0 on the source control, which closes that checklist item.
>
> **THE ONE THING NOT PROVEN: the APP path.** Install button -> 1.057GB download -> gallery
> card -> save path -> group type. That is all MPI-573 machinery and none of it has ever run
> for an audio-producing GENERATION (MPI-573 proved the RECORDER's upload path instead).
> Nothing has been installed into any engine -- 1.057GB onto Fabio's disk is his call, and
> his app engine ALREADY carries the node pack, so the cheap route is him pressing Install in
> his own app rather than a scratch-engine build.
>
> **A HANDOFF INSTRUCTION WAS WRONG AND IS CORRECTED: do NOT declare `ComfyUI-MpiNodes` in
> `requiredDeps`.** It turned the MPI-258 B1 GC test red. `requiredDeps` means "nodes/weights
> NO MODEL requires" and every model declares MpiNodes; worse, a flow's deps are protected
> UNCONDITIONALLY (a flow is always "present", unlike a model), so naming a registry-wide dep
> pinned it for every uninstall. It installs anyway -- `getUniversalWorkflowDepIds()` returns
> every `type: 'custom_nodes'` dep and the boot gate installs that whole set regardless of any
> model or flow, which is why `ComfyUI_Fill-ChatterBox` is already in the app engine with
> nothing declaring it. **Flow B must not declare it either.**
>
> **NEXT ACTION: Fabio listens** to `D:\WORK\Images\Outputs\audio\MPI607_VC_flowtest_00001.flac`
> (his own expressive take -> the gravel senior-male character). Then either the app-side
> install/run, or `/mpi-flow-graphics` for the tile + hero, then Flow B.
>
> Flow B is untouched and still waits on the ~5-8 performance clips. Do not start it here.
>
> **UPDATE -- Fabio INSTALLED it from his own app, and that surfaced TWO real bugs, both
> now fixed. `npm test` 729/729.** The 1.0GB landed byte-exact, but the install bar stuck at
> 100% with Cancel showing, then the button came back after a restart.
>
> ONE root cause in TWO halves, both about `dep.targetPath`:
> 1. `_localModelsCheck` (`routes/comfy.js`) duplicated path resolution and omitted the
>    `targetPath` branch that `resolveComfyPath` has -- so it hunted under the MODELS root,
>    where a targetPath weight can never be. FIXED.
> 2. `syncModelInstalled` (`js/data/modelRegistry.js`) projected deps to
>    `{id,type,filename}` and **dropped `targetPath`**, so half 1 fired for nobody. FIXED in
>    all THREE projections (models/flows/plugins).
>
> Hidden until now because RIFE -- the only prior targetPath dep -- is an `engineAsset`, so
> its state comes from the engine boot gate (which DOES use `resolveComfyPath`) and never
> reaches this path. The chatterbox weights are the first targetPath deps owned by a FLOW.
> Guarded by `tests/targetpath-dep-install-state.test.cjs` (both halves, with a count
> assertion so a drifted regex cannot silently stop checking).
>
> **METHOD LESSON, worth more than the bug: verifying a route with a hand-built payload
> proves NOTHING about the caller.** My first fix verified green against full dep objects
> and shipped a still-broken app, because the app sends a stripped projection. Reproduce the
> caller's payload.
>
> **NEXT ACTION -- Fabio approved the remote recommendation. Implement it:**
> `_isImageResident` (`routes/remoteModels.js:225`) returns true for EVERY `targetPath` dep.
> Narrow it to `dep.targetPath && dep.bakedOnPod`, and add `bakedOnPod: true` to `rife47`
> (true per `cubric-vision-pod/Dockerfile:376`). Verified facts behind it: chatterbox appears
> NOWHERE in `c:\AI\Mpi\mpi-ci` (no node pack, no weights, neither image), and `bakedOnPod`
> already exists on 7 engineAsset weights while rife47 carries only the blanket rule.
> `targetPath` = WHERE ON DISK; `bakedOnPod` = WHETHER THE POD HAS IT. Chatterbox then reports
> not-installed on remote, which fails CLOSED. Do not bake chatterbox into the image.
>
> Still open after that: Fabio has not LISTENED to the output yet, and the flow has no UI --
> he wants a record button (MPI-573 recorder), a voice selector off the library, and a
> custom-voice item. That is a `/mpi-brainstorm`, not a field list: the voice library does not
> exist and Flow B needs the same picker. Preview art (`/mpi-flow-graphics`) also pending.



## Current State

Project mode: scalable-foundation.

> ### 2026-08-28 (session 31, close-out) — 🔴 A CLAIM AUDIT CAUGHT ONE FALSE STATEMENT.
>
> **The claim:** commit `b39ebe06`'s message, and two files written the same day, said
> DramaBox's voice slot is legitimately optional *"because its loader carries
> `block_if_empty: false`"*. **That is FALSE.** `MpiLoadAudio#11` carries **`true`**,
> exactly like every other loader in the repo.
>
> **The real mechanism is LAZINESS.** `Input_Audio` is an `MpiString` (#13) whose ONLY
> consumer is `MpiAnyChecker#14`; that checker's boolean drives `MpiIfElse#15` between
> `DramaBoxSampler#9` (takes `voice_ref`) and `#10` (does not). `MpiIfElse` declares its
> arms lazy, so an empty slot takes the false arm, `#11` is never requested, and its
> blocker never fires. The flag is real and simply unreachable.
>
> **Why it matters beyond wording.** The sweep's own test asserted DramaBox's exemption
> via a `block_if_empty` walk that returned `false` — the right answer for the wrong
> reason, since the walk stops one hop out and never reached #11. It would have said the
> same thing about a chain where the loader really was reachable. The case now asserts
> the WIRING (string → checker → if/else → two samplers, exactly one taking `voice_ref`)
> and is mutation-checked: rewiring the checker into a loader kills it.
>
> **The sweep itself stands.** Re-checked: in all twelve flipped slots the titled node IS
> the blocking loader, with no lazy gate in front, and none of those flows has a
> prompt-only route. DramaBox was the only exemption and it stayed exempt.
>
> `b39ebe06` is pushed, so its message cannot be corrected — this entry is the record.
> Fixed in `tests/flow-required-media.test.cjs` and `docs/playbooks/add-flow/02-media-io.md`;
> `drama-box.md` had it right all along ("`MpiAnyChecker#14` forks to a sampler with no
> `voice_ref`").
>
> Audit verdict otherwise: **33 claims PROVEN**, 1 unproven (the DramaBox safetensors
> video-key count, which no tool in the auditor's shell could inspect — it was measured
> directly this session by reading both files' safetensors headers).

> ### 2026-08-28 (session 31) — 🟢 THE STRIP IS DONE AND PUSHED (`126cbdba`).
>
> **Text to Speech is now a line, a voice and a language**, verified in the real UI on an
> isolated instance: the run slide renders `THE LINE` and `LANGUAGE` only, the Inputs
> slide offers one voice slot, and the console is clean. DramaBox's range input reports
> `step="1"` with the readout at `5`. `773/773` (two emotion cases deleted, one new) and
> `npm run lint` green.
>
> **The eight-item list, item by item:**
>
> 1. ✅ `flowsRegistry.js` — `emotion` field, `voiceEmotion{}`, `libraryVoiceOnly` and
>    `disabledNote` all gone; `derived[]` and the single `audio1` slot kept. The header
>    comment now carries the measured reason the VC arm died, and the `cfg_weight` 0.5
>    lesson survived the rewrite because it is about the TTS nodes, not the VC.
> 2. ✅ `MpiBaseFlow.js` — `_deriveVoiceEmotion`, `_libraryVoiceRegister`, its `_run` call,
>    the `libraryVoiceOnly` branch and the `toWavFile` import deleted. `derived[]` in
>    `_collectInputs` untouched.
> 3. ✅ `commandRegistry.js` — the `audio2` mediaInput dropped. **This is the load-bearing
>    one:** `Input_Audio_2` is the only thing `MpiAnyChecker#57` reads, so an unmapped
>    role IS the VC bypass. `flowVoiceChanger` keeps its own `audio2` — different flow.
> 4. ⏸ **FABIO'S** — the dead graph nodes. Unreachable already; deletion is his re-export.
> 5. ✅ `tests/flow-voice-emotion.test.cjs` → **`tests/flow-derived-fields.test.cjs`**. The
>    derived-language case moved across intact; the two emotion cases are replaced by one
>    that pins the strip — exactly one declared role and exactly one mapped `mediaInput`,
>    so re-adding `audio2` anywhere fails a test rather than quietly re-arming the VC.
> 6. ✅ The `voiceId`/`register` thread is gone from `MpiMediaPicker._pickVoice` and
>    `MpiBaseFlow._handleFiles`. The emotion was its only consumer, and `autoFromVoice`
>    — named in the comment that justified it — does not exist anywhere in the repo.
> 7. ✅ DramaBox `Input_Duration` `step: 0.5` → `1`.
> 8. ⏸ **FABIO'S** — `#54 MpiLoadAudio.block_if_empty` if the optional voice is wanted.
>
> **Two things beyond the list, both consequences of it:**
>
> - **`declaredFields.js`:** the radio `disabled` widening had exactly one consumer (the
>   voice-range picker, already pulled) and went. The **select-branch `f.note` STAYS** — it
>   reads as MPI-607 code but its live caller is **MPI-620's `canvasSize`**, whose `note`
>   sat unrendered from `f1880430` until that branch existed. Deleting it with the rest of
>   the emotion work would have silently un-fixed that. The comment now says so.
> - **The docs were stale from session 30, not from this strip.** `chatter-box.md` still
>   described the "Other languages" toggle and two audio slots; both sections rewritten
>   (175 lines, under the 200 budget). `UNRELEASED.md`'s Text to Speech paragraph told
>   users to turn on a switch that no longer exists, and promised the second voice slot.
>
> ### What is left on this card
>
> - **Fabio's re-export** of `flow_chatter_box.json` (items 4 and 8). Then re-bake with
>   `COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs` and verify by
>   SEMANTIC diff. ⚠️ **`tests/inject-params-titles.test.cjs` asserts the
>   `FL_ChatterboxVC#31` ← `#52` wiring** (mutation-checked in session 29) — deleting the
>   VC nodes will fail that case, and the case should go with them, not be worked around.
> - **Fabio's own smoke test of both flows through the overlay.** Nothing has been
>   generated end to end on the final shape; this session proved the UI renders, not that
>   a run completes. DramaBox's voice-reference arm is still unexercised in the app.
> - The three flagged-but-not-taken items from session 30 still stand: the global
>   `[hidden]` rule (Fabio's call), the `diffusers` FutureWarning note in
>   `python_deps.in`, and the unexplained Chatterbox mel-length warning — which concerns
>   REFERENCE clip length and is probably moot now that VC is gone.

> ### 2026-08-28 (session 30) — 🔴 FABIO KILLED THE EMOTION/VC FEATURE. Next session STRIPS it.
>
> **THE DECISION, and it is final:** *"I had enough of this. Even if we do that, it's still
> gonna be inconsistent, I'm pretty sure of it. Let's ship something that works, not
> something that may work sometimes. Let's strip all emotions out. Let's strip VC. Let's
> leave it as TTS normal or TTS multilingual only."*
>
> **Text to Speech's end state: a line, a voice, a language. No emotion, no VC, no second
> audio role.** Do not re-propose the role swap — it was offered, considered and rejected
> on the grounds that it would still be inconsistent. This is not an open question.
>
> **WHY it died, measured — keep this, it is the whole justification.** The emotion clip is
> the VC `target_voice`, and VC takes TIMBRE from the target, so the OUTPUT IS THE CLIP'S
> SPEAKER and the chosen voice is overwritten. The 30 clips carry **30 DISTINCT SEEDS**
> (`qwen3-tts-voicedesign`) — 30 different people, not 6 emotions from 5 speakers. Young
> Male (R3, 201-250 Hz) + `perf_R3_cheerful` (seed 2010, 272.5 Hz) came out a child, as it
> must. Register matching bounds PITCH, never identity: a register is a band, not a person.
>
> ### NEXT SESSION — the strip list
>
> 1. **`flowsRegistry.js` chatter-box:** delete the `emotion` field, `voiceEmotion{}`, and
>    the `libraryVoiceOnly`/`disabledNote` keys. KEEP `derived[]` (the language boolean)
>    and the single `audio1` slot — both are good and unrelated.
> 2. **`MpiBaseFlow.js`:** delete `_deriveVoiceEmotion`, `_libraryVoiceRegister`, its call
>    in `_run`, the `libraryVoiceOnly` branch in `_buildFlowFields`, and the `toWavFile`
>    import. **Keep** the `derived[]` block in `_collectInputs`.
> 3. **`commandRegistry.js`:** drop the `audio2` mediaInput and rewrite its comment.
> 4. **The graph:** `Input_Audio_2`, `MpiAnyChecker#57`, `MpiIfElse#53`, `#56` and
>    `FL_ChatterboxVC#31` all become dead. **FABIO'S EDIT — `raw/` is his.**
> 5. **`tests/flow-voice-emotion.test.cjs`:** delete the two emotion cases, KEEP the
>    derived-language one (move it to a surviving test file).
> 6. **`MpiMediaPicker.js` / `_handleFiles` register thread:** only the emotion needed it.
>    Harmless to keep, but delete if nothing else claims it.
> 7. **DramaBox `Input_Duration` step `0.5` -> `1`** (Fabio, this session): 0.5 is fiddly,
>    and single- vs double-digit readouts resize the slider so it *"looks like it's buggy"*.
>    A 1s granularity is enough. `flowsRegistry.js`, one number.
> 8. **Still open from earlier:** `#54 MpiLoadAudio.block_if_empty` -> `false` if the
>    optional voice is still wanted. Fabio's re-export.
>
> ### What SURVIVES from this session and must not be undone
>
> - **The "Other languages" toggle is gone**, the boolean DERIVED from the language select,
>   so the one state a user could get wrong is unreachable. 21 dead hovers removed.
> - **The Voice Library panel fix.** `grid.hidden = true` never hid anything —
>   `.mpi-media-picker__grid { display: grid }` outranks the UA `[hidden]`. Latent since
>   MPI-531, invisible until a project HAS media. **Third occurrence of this trap in the
>   repo.** A global `[hidden] { display: none !important }` in `01_base.css` would end the
>   class of bug — flagged, NOT taken, Fabio's call.
> - **DramaBox:** `Voice to match (optional)`, `rows 3 -> 6`, and copy teaching the real
>   prompt format — quotes = spoken, outside = performed. His `[He laughs]` was the wrong
>   syntax; the pack wants bare prose.
> - **`#56.block_if_empty` -> false**, his own edit, re-baked as `4e0dc50f`.
> - Double-click on a voice card was tried and REMOVED at his request; `MpiVoicePicker.js`
>   is a zero diff.
>
> `774/774` + lint clean at handoff. Detail: `validation.md` session 30.

> **2026-08-28 (session 29) — BOTH AUDIO FLOWS ARE WIRED, ILLUSTRATED AND PUSHED. What is
> left is Fabio's own smoke test through the Flow overlay.** Everything below was dispatched
> straight to the engine, which exercises the graphs but NOT the flow's media routing,
> `.preview-assets` storage or reuse.
>
> **🔴 THE FIND OF THE SESSION: every Chatterbox run produced SILENCE, including the SHIPPED
> Voice Changer flow.** A real `.flac`, zero duration, −91 dB, and ComfyUI reporting
> `success`. Three swallowed failures: `setuptools` resolved to 83 (via torch) and setuptools
> dropped `pkg_resources` in 81 → `resemble-perth` cannot import → perth's `__init__` swallows
> that and sets `PerthImplicitWatermarker = None` while `import perth` still SUCCEEDS, so the
> pack's `PERTH_AVAILABLE` guard reads as fine → `ChatterboxTTS.__init__` calls the None, and
> `FL_Chatterbox*` catches the `TypeError` into its `message` output (which no graph wires)
> and returns its placeholder `{"waveform": zeros((1,2,1)), "sample_rate": 16000}`. Fixed with
> `setuptools<81` (`0340df4f`). **The tell is the file: 16 kHz stereo, one sample.**
> `python_deps.in` already warned about this exact removal breaking `cupy-wheel` at BUILD
> time — same removal, biting at RUNTIME.
>
> **DramaBox ships (`0588d7a2`, art `e1d567a2`).** Op in all four registries, FlowDef, 17 deps
> = 15.23 GB HF-primary/`noMirror`, verified against the HF API (4 LFS oids match local
> sha256, 10 non-LFS match on size, every primary 200). GENERATES FOR REAL: 6.09 s of audio
> in 32 s on the app engine.
>
> **Chatterbox ships with all 23 languages (`55b28d67`, art `20e165ef`).** They are ONE
> checkpoint (`t3_mtl23ls_v2` = "multilingual, 23 languages"), so shipping every language
> costs what shipping one would — there was never a list to trim. 14 deps, 6.95 GB, both arms
> measured working after the fix (en 2.88 s/−22.1 dB, zh 2.91 s/−22.4 dB, ja 2.67 s/−20.9 dB).
>
> **A REAL GRAPH BUG was found and fixed:** `FL_ChatterboxVC` read straight off the English
> TTS instead of the `Input_Is_Multilingual` selector, so on the TTS → VC route — the settled
> architecture — the language pick did NOTHING and the output was always English. Silent,
> because `MpiIfElse` is lazy so the selector was simply never evaluated. Fabio gave explicit
> permission to edit the raw graph. The regression test is MUTATION-CHECKED.
>
> **FABIO CORRECTED THE COPY (`ac977451`, `eb1541d1`):** both flows are text-to-speech, so
> leading DramaBox with "hear your line performed" made the pair read as duplicates. The real
> split is in the graph — Chatterbox REQUIRES a voice, DramaBox FORKS on the slot and its
> prompt-only arm builds a speaker from the words. Copy now leads with DIRECTION: describe the
> speaker and the performance in the line, emotion in the text not a slider.
>
> **Peer-session hazard, cost two rebuilds:** the engine's `output/` directory is SHARED and a
> peer agent's instance wiped it twice, seconds after successful runs. Fetch generated files
> over `/view` in-process; never read them off disk later.

> **2026-08-27 (session 28) — FABIO SAID YES. DramaBox ships as a Flow, and the reason is
> IDENTITY:** *"it sticks to the reference a lot better than Chatterbox, especially when we add
> our performances to Chatterbox. Chatterbox just deviates a lot from the original voice."*
> Two flows now, both audio-only: **DramaBox** (prompt + duration slider + a voice source) and
> **Chatterbox**. His testing CORRECTED earlier sessions twice: an explicit duration is the
> single biggest quality win (it stops the model reading the prompt aloud, and stops over-long
> clips where the delivery should be fast), and the chain order is **TTS -> VC**, not VC -> TTS,
> with `cfg_weight` back to **0.5** — the 0.3 was compensating for the wrong order and is void.
>
> **Both graphs are staged in `comfy_workflows/raw/`** as `flow_drama_box.json` and
> `flow_chatter_box.json`, with five real bugs fixed on the way in (`validation.md`, session 28)
> — the worst being an `Input_Negative` node whose baked value `_buildParams` wipes on EVERY
> run. **Chatterbox's API twin is BAKED AND VALIDATED** against the live engine (0 missing
> required inputs, 0 dangling links). **DramaBox's is not**: the engine has no DramaBox classes
> until it restarts and installs the pack.
>
> **`ComfyUI-MelodramaBox` is now a MadPony FORK** —
> https://github.com/MadPonyInteractive/ComfyUI-MelodramaBox @ `9ebb44b`, public, Apache-2.0,
> carrying the three patches upstream has nowhere to receive. Pinned in `node_lock.json`,
> declared in `nodesDeps.js`, four uncovered requirements added to `python_deps.in`.
>
> **NOTHING ELSE IS WIRED.** No FlowDef, no op, no weight deps, no registry edit. The graphs,
> the fork and its dep entry are the whole of it.

> **2026-08-27 (session 27) — DRAMABOX IS INSTALLED AND GENERATING ON THE BENCH, and the
> evaluation is now a QUALITY question, not a plumbing one.** Three DramaBox packs exist, not
> one; the card's rejection was scored against the worst of them. `ComfyUI-MelodramaBox` 2.1.0
> is installed and working, weights (16.36 GB) in `G:/CubricModels`. Three pack bugs patched
> (shared text-encoder root, `.gguf` listing, a missing `IS_CHANGED` on the unload node).
> **Fabio's own VRAM fix beat mine — one `Mpi Clear Vram` at the end of the graph, our own
> node — so neither of my unload nodes is needed.**
>
> **DramaBox is ENGLISH-ONLY (HF language tag, no multilingual claim), so the multilingual arm
> is untouched and this is an English-EXPRESSIVENESS play only.** Zero-shot clone measured at
> **-0.53 semitones** median-f0 vs its reference in ONE stage, against the Chatterbox chain's
> winning 1.20 st that needed TTS->VC — the direct argument for dropping the VC stage for
> English, still pending Fabio's ear.
>
> **Fabio's ear tests (they outrank every measurement):** accent on a supplied reference is a
> LOTTERY not a block (Australian and strong British landed on two elderly-male samples, failed
> on `deep_male_5`); prompt-only runs open with a long silence needing an output-side trim;
> chained references BLEND the voices — because `extra_ref` concatenates waveforms and discards
> the inner node's `strength`, and only the first 10 s is encoded, so his 9 s performance clip
> WAS the reference; single reference plus a prompted emotion delivers "not greatly, but that
> might be prompting".
>
> **`Audio8_TTS` evaluated (Fabio's link): NOT a DramaBox replacement — a
> `chatterbox_multilingual` one.** Apache-2.0 code AND weights, 0.6B, **2.57 GB**, 11 languages,
> 22,736 HF dl/30d, pushed two days ago. **But no prompt-driven emotion/accent/style control at
> all**, which is the whole reason DramaBox was re-opened. No ComfyUI node exists. No Portuguese
> — the one language Fabio actually validated the multilingual arm on.
>
> Detail: `validation.md` 2026-08-27 sessions 27. **Nothing has been wired into the app — no op,
> no FlowDef, no registry edit — and that is still correct while the design is unproven.**

> **2026-08-25 — THE VC QUALITY QUESTION IS ANSWERED, and the library is now MPI-622.**
> Chatterbox VC moves a voice roughly HALFWAY and stops. Proven bias-free: a stranger's
> clip converted into the gravel character was described cold as "35, deep but not too
> deep", between the 25-year-old source and the 50+ target. Not self-recognition, not a
> bad pairing (three targets incl. cross-gender all still read as Fabio), and not fixable
> by iteration (three passes perceptually identical on the unbiased pair; on Fabio's voice
> pass 3 only hallucinated rumble). **The CAMPPlus cosine is DISQUALIFIED as a perceptual
> gate** — it scored that clip 0.92, because x-vectors are pitch/prosody-invariant by
> construction, which is exactly what a listener judges on. New gate: cosine AND median-f0
> delta.
>
> **Two long-open questions closed the same day.** Text CANNOT select emotion (neutral
> reference + angry words = soulless at exaggeration 0.5, and the WRONG emotion at 1.0),
> so emotion needs performance clips and the "60 voices, emotion free at runtime" collapse
> is dead. Character consistency across performers HOLDS (two performers 0.47 apart drove
> one character 93 Hz apart and still read as one actor), so the shared-clip collapse
> survives. **Route decides the voice:** direct TTS lands on the character, TTS->VC lands
> on a consistent other voice — so a per-line neutral-bypass would switch actor mid-scene.
>
> **Flow A is NOT dropped** (Fabio's call): the obligation is truthful guidance, not a
> better model. Direct TTS with no VC is already excellent for the DICTATION register —
> his tutorial voice came back "exactly the same thing" — which retires the earlier
> "direct sounds robotic" note as emotion-scoped only.
>
> **The library moved to its own card: MPI-622 "Voice library"**, `todo`/`planned`, with an
> approved design in its `brief.md` and a 5-phase plan. Its Phase 0 is a sourcing gate:
> Fabio can only perform emotion in his own voice (~100 Hz), and **a live voice changer
> cannot carry emotion — it mangles pitch, which is what emotion rides on.** MPI-607 keeps
> the VC/TTS findings, Flow A's UI, and Flow B.

> **2026-08-23 STEP 2b PASSED — Fabio heard it: "the A to B clones are all really
> good, spot-on".** A Qwen-designed synthetic voice clones through Chatterbox well
> enough to build on, so the design-then-speak chain holds and the VCTK/GLOBE fallback
> stays parked. Clips in `D:\WORK\Images\Outputs\mpi607\`; detail in `validation.md`.
>
> **2026-08-23 — Qwen3-TTS VoiceDesign now RUNS LOCALLY on the bench, and option B's
> core gate PASSED with it.** `G:\ComfyUi\_qwen_tts_rt\` holds a transformers-4.57.3
> venv built by `virtualenv` off the bench's EMBEDDABLE python, inheriting torch
> 2.12.0+cu130 — 4 packages, ~13 MB, bench ComfyUI untouched on 5.13.0. Model loads in
> 3.1s, generates in 6-33s on Fabio's GPU. Pack is
> `flybirdxx/ComfyUI-Qwen-TTS` (**Apache-2.0**, `FB_Qwen3TTSVoiceDesign`), used for its
> bundled `qwen_tts` only — its `transformers>=4.57.0,<5.0.0` ceiling means it can never
> load in-process in the bench or the app engine. Detail + two gotchas in `validation.md`.
>
> **Options (a) Pod bake and (c) hosted DashScope are REJECTED by Fabio (2026-08-23).**
> His lean: "a small voice library created by us is probably the best approach and safest
> — voice library, chatterbox, done." Option (b) the local isolated runtime stays open and
> is now much cheaper than costed, but the library does not depend on it: authoring runs
> on the bench either way, and only the finished `.wav` files ship.
>
> **2026-08-23 — ARCHITECTURE SETTLED. Read `validation.md` from
> "THE SETTLED ARCHITECTURE" down.** Vision ships **Chatterbox only** (Qwen is a bench
> authoring tool, never shipped). Runtime pipeline is
> `FL_ChatterboxTTS(text, audio_prompt=<performance clip>, cfg_weight=0.3,
> exaggeration=1.2)` -> `FL_ChatterboxVC(target_voice=<character clip>)`.
> **Library = ~60 neutral character clips + ~5-8 shared emotional performance clips.**
>
> Locked: `cfg_weight` 0.3 (default 0.5 kills emotion), VC-source `exaggeration` 1.2
> (higher breaks identity), identity gate cosine >= 0.70 via
> `research/speaker_similarity.py`. `exaggeration`/`cfg_weight` are COUPLED -- one
> intensity control in the Flow, never two sliders. **No accent axis** (closed negative).
>
> **Two things remain, and neither blocks the other.** (1) The library taxonomy --
> ~60 voices over gender x age x delivery-type, tags not folders; a `mpi-brainstorm`-shaped
> design conversation that has not happened. (2) **Step 3, ship Chatterbox** -- unblocked
> since the start of the day and still not begun; it needs none of the library settled.

> ### 2026-08-23 SESSION 13 -- STEP 3 STARTED. Gate 1 (engine onboarding) is DONE.
>
> **The first Vision repo code exists.** Read `validation.md` from
> "Step 3 Gate 1" down before touching any of it -- it carries two traps that both fail
> SILENTLY and one pre-existing bug that was fixed on the way.
>
> **Step 3 is two gates, not one `/mpi-add-flow` pass.** Nothing was wired, so a node pack,
> 8 python leaves and 4.25GB of weights had to land first. Gate 1 is that. Gate 2 is the
> Flow.
>
> **Gate 1, shipped:** `ComfyUI_Fill-ChatterBox` pinned at `596850bc` in `node_lock.json`
> + `nodesDeps.js`; 6 declared leaves plus **`resemble-perth`** in `python_deps.in`, lock
> regenerated; 7 weight deps in `assetDeps.js` as **`targetPath`** deps; a junk-folder-key
> bug fixed in `routes/yamlHelper.js`.
>
> **The three facts that decide Gate 2's shape:**
> 1. **Chatterbox is a FLOW WITH `requiredDeps`** -- not a ModelDef, not a Plugin. It
>    declares `requiredModels: []` and owns all nine dep ids. `head-swap` is the precedent.
> 2. **The weights MUST stay `targetPath`.** The pack ignores `extra_model_paths.yaml` and
>    `hf_hub_download`s anything missing from `<ComfyUI>/models/chatterbox/` -- move them to
>    `mpi_models/` and it silently pulls 4.25GB outside the download manager.
> 3. **Perth is opt-in and fails silently.** `resemble-perth` is commented out of the pack's
>    requirements and every import is wrapped in try/except. It is pinned in
>    `python_deps.in` for Art. 50; Gate 2 must prove the marking is actually APPLIED.
>
> **Nothing has been installed or run on a real engine** -- deliberate, see validation.md
> "What Gate 1 is and is NOT verified by". The live proof belongs at Gate 2, where one
> scratch-engine run proves both halves for the price of one.
>
> **GATE 2 SPLIT IN TWO -- Fabio drove the bench workflow and it reordered the ship.**
>
> - **Flow A -- VOICE CHANGER. Ships FIRST.** Record a performance (the MPI-573 recorder
>   already exists) -> pick a target voice -> `FL_ChatterboxVC` -> audio card. No text, no
>   TTS model, **1.0GB** of weights, and it needs NEITHER the performance clips nor the
>   ~60-voice library, because the user's own recording IS the performance clip. That is the
>   asset Flow B is still waiting on, so Flow A is the one that can ship today.
> - **Flow B -- TEXT TO SPEECH.** `FL_ChatterboxTTS` -> `FL_ChatterboxVC`, 4.25GB, needs the
>   ~5-8 authored performance clips.
>
> **Accent routing (Fabio's call): the accent selector picks the MODEL, not a parameter.**
> `accent == none -> FL_ChatterboxTTS` (fast default); `accent == <lang> ->
> `FL_ChatterboxMultilingualTTS` (slower, imposes the accent). Both feed the same VC stage.
> Adding accents means shipping a THIRD weight set (+3.0GB, 7.2GB total) -- whether that can
> be optional is unresolved and belongs to Flow B, not Flow A.
>
> **TURBO IS NOT SHIPPED -- and the reason is REDUNDANCY, not weakness.** Read the caveat
> before repeating the verdict: the node hides `exaggeration` AND `cfg_weight` and runs both
> at **0.0**, so Turbo was never measured fairly -- `cfg_weight` is this card's central
> finding and 0 means no guidance toward the reference at all, which explains the missing
> emotion and the invented British accent in one stroke. It is dropped because **VC passes
> laughs, coughs and shushes through natively**, so Turbo's nine paralinguistic tags win
> nothing, and reaching a tuned baseline would need a node patch plus another 2.8GB.
>
> **VC PASSES NON-VERBAL SOUND THROUGH -- a Flow A exclusive.** Fabio shushed and coughed and
> both arrived in the target voice. Flow B structurally cannot do this: its stage 1 generates
> from TEXT, so only Flow A converts real mouth sounds. "Your laugh, your breath, your
> timing, in someone else's voice" is Flow A's copy, and Flow B has no answer to it.
>
> **Flow A user guidance -- four rules, all evidence-backed:** perform but do not push · pick
> a target that sounds nothing like you · meet its pitch · hold that pitch steady. Rules 3
> and 4 are new this round (pitch matching confirmed; pitch DRIFT within a take drifts the
> output). Rules 2 and 3 only look contradictory -- distance in TIMBRE is what makes the
> conversion audible, distance in PITCH is what you compensate for.
>
> **ACCENT IS A RUNTIME PARAMETER after all** -- the multilingual `language` selector
> imposes one on any reference. This does NOT reopen Qwen VoiceDesign (still a closed
> negative). Two lines in this plan and `validation.md` said accent must be baked at design
> time; both are corrected in place.
>
> **The core tension, now measured from BOTH ends: performance and identity trade against
> each other.** Fabio by ear: a flatter input picks up the target voice better, a strong
> performance bleeds the source through. That is the same curve as the measured
> exaggeration cap (1.2 -> 0.79-0.87 identity, 1.5 -> 0.70, 2.0 -> 0.61). Similar
> source/target voices make the conversion nearly inaudible; a large pitch gap strains it.
> His verdict: it works, the gap is USER INSTRUCTION, not capability.
>
> Full detail on all of it: `validation.md` § "session 13 -- Fabio drove the all-nodes
> bench workflow".

Research session 2026-08-22/23 evaluated Chatterbox, Qwen3-TTS, DramaBox and VibeVoice.
The bench work (`G:\ComfyUi`, port 8188) still stands; as of session 13 the Vision repo
carries Gate 1 as well.

> **2026-08-23 update — read `## Plan Drift`, `validation.md` and `research/voice-library-0*.md`
> before the sections below.** The API-patching route is abandoned and Step 1 is
> withdrawn; the Qwen blocker described below is real but is no longer the thing being
> solved. **Branch B is the chosen direction** (branch A parked as too risky to ship).
> Four research agents have reported and the branch-B corpus question is ANSWERED.

> ### 2026-08-23 LATER — Fabio changed the requirement. READ THIS BEFORE THE BLOCK BELOW.
>
> **The goal is a voice DESIGNER the user drives, not a library the user picks from.**
> His reason: the objective is that a user creates their own characters in the character
> sheet and then **voices them**. A picker limits them to our voices; a character deserves
> an original voice. (Product thread: memory `project_lora_free_character_system` -- the
> character sheet is the keystone artifact, and a voice is one more per-character asset.)
>
> **This reopens branch A in substance.** Offline authoring only works for a fixed
> library. If the user designs a voice on demand, Qwen3-TTS has to run **at user request**
> -- which is exactly what was parked as too risky to ship.
>
> **The likely resolution, NOT yet decided: run voice design on the RunPod Pod.**
>
> - **Voice design is text-in / audio-out. It sends NO reference clip.** So it carries no
>   biometric data, and the GDPR/Pod concern in `research/voice-library-03` does not apply
>   to it at all -- that concern is about *cloning*, which stays local.
> - The Pod image can **bake** a `transformers==4.57.3` venv at build time. That removes
>   every specific risk Fabio objected to: no self-provisioning venv on a user's machine,
>   no `virtualenv`-on-embeddable gamble, no download-manager or progress plumbing, no
>   second runtime in the portable archive.
> - Cost: voice design becomes **remote-only** (needs a Pod). That is a product decision
>   Fabio has not made. A local path can follow later via the branch-A vendor if wanted.
>
> **The library work is not wasted** -- offline-authored synthetic voices still make good
> defaults/starters, cost nothing at runtime, and give the designer somewhere to start
> from. It stops being the whole answer and becomes the seed set.
>
> **Step 2b's clone test still matters, unchanged**: if a Qwen-designed voice does not
> clone well through Chatterbox, the whole design-then-speak chain breaks whatever the
> hosting decision is. Do it first.

**The answer for a LIBRARY, in one line: build it from SYNTHETIC voices, authored offline.**
(Superseded as the primary goal by the block above; still correct for the seed set.)

Both the legal research and the prior-art research converge on it from opposite
directions:

- A curated library of REAL voices puts Vision in the *Lehrman v. Lovo* posture -- the
  entity that collected, held and commercially distributed voice profiles. Primary
  liability moves from the user to us, per voice, for ever. A licence does not cure
  right-of-publicity or GDPR Art. 9 biometric consent.
- A library with **no real person in it** has no right-of-publicity subject, no biometric
  data, no consent chain, no takedown surface. Independently corroborated: Kokoro v1.0
  ships 54 voices commercially precisely because they are designed rather than cloned,
  and ElevenLabs' own library is voice-design voices plus owner-verified clones -- never
  third-party curation.

**And it costs users nothing, because Qwen3-TTS VoiceDesign is an AUTHORING tool here,
not a shipped dependency.** We run it once, offline, on the bench; we ship the resulting
`.wav` files. The isolated transformers-4 runtime is fine on a bench that never reaches a
user. So Fabio's "design a voice" Flow survives branch B intact -- it becomes
browse-a-library-we-designed. A 50-voice library of 10s clips is **under 10 MB**.

**One cheap gate before committing:** does a Qwen-generated clip clone well through
Chatterbox? Synthetic audio may have spectral characteristics that degrade cloning.
Test via the HF Space (`Qwen/Qwen3-TTS-Voice-Design`) -- no local install, no vendoring,
one afternoon.

**Fallback if it does not clone well:** VCTK (CC BY 4.0, 48kHz, 109 speakers, 11 accents,
speakers anonymised as `p225`, and the corpus was purpose-built for voice cloning) is the
lowest-exposure real-voice option, optionally widened with GLOBE (CC0, 23,519 speakers,
164 accents).

**Two compliance facts that are now live and are not optional:**

1. **EU AI Act Art. 50 has been in force since 2026-08-02.** Vision is the *provider*;
   synthetic audio output must carry machine-readable marking. Perth covers the shape;
   conformance to the forthcoming Code of Practice is UNVERIFIED. Penalty EUR 15M / 3% of
   turnover. Fabio's watermarking principle turns out to be a legal requirement.
2. **The RunPod Pod is unresolved GDPR surface.** A user's reference clip sent to the
   remote engine is biometric data leaving their machine. Local-only cloning keeps the
   user as controller; the remote path may not. Resolve before any Flow ships.

Chatterbox is unblocked today and ships first regardless.

**Model verdicts.**

| Model | Licence | Verdict |
|---|---|---|
| Chatterbox | MIT | Ship first. Clone-only, ~8 light deps, no transformers move, 1.97M HF dl/30d |
| Qwen3-TTS | Apache-2.0 | Only model that DESIGNS a voice from text. Blocked, see below |
| DramaBox | LTX-2 Community | ~~Rejected: 240 HF dl/30d, stale since 2026-05-23, 24GB VRAM, no weight sharing~~ **RE-OPENED 2026-08-27 by Fabio. The VRAM and weight-sharing halves were scored against the `kat3ri` pack; a THIRD pack (`ComfyUI-MelodramaBox` 2.1.0) measures 13.5 GB peak with a Q8_0 GGUF DiT and DOES honour `extra_model_paths.yaml` for 2 of its 3 components. See validation.md 2026-08-27 session 27** |
| VibeVoice | MIT | Only NATIVE multi-speaker (4 spk / 90 min), but hard-excludes transformers 5 |

**The Qwen blocker.** `qwen-tts` pins `transformers==4.57.3`; Vision's engine is on
`transformers==5.13.0` (`dev_configs/python_deps.txt`). Three 4->5 breaks were found and
fixed on the bench clone (`2 files changed, 47 insertions(+), 3 deletions(-)`):

1. `check_model_inputs()` -> decorator factory in 4.x, plain decorator in 5.x
2. `config.pad_token_id` -> `PretrainedConfig` dropped pad/bos/eos token ids in 5.x
3. `ROPE_INIT_FUNCTIONS["default"]` -> removed in 5.x along with `_compute_default_rope_parameters`

After those, model classes construct cleanly on 5.13. **But loading is not generating.**
Upstream PR #201 (closed unmerged) patched the same rope break, then measured
**67-99% silence** on transformers 5.x and concluded API patches cannot fix it. Parts of
that write-up reason sloppily (it claims a KeyError causes a silent fallback, which is
not how KeyError works), so it is a strong signal, not proof. It is cheap to settle.

**Dependency facts (proven, not assumed).** Vision installs one curated lock in a single
`--no-deps` pass, so a node's `requirements.txt` is never read -- but `uv pip compile`
DOES resolve the closure, so adding `qwen-tts` to `python_deps.in` fails the compile
loudly. Leaf deps compile clean with zero movement in numpy/transformers:
`librosa soundfile soxr sox s3tokenizer conformer pyloudnorm resemble-perth`.
`sox` is required (pysox, imported at module level by the 25Hz tokenizer) -- an earlier
session note wrongly dismissed it.

**Watermarking.** Fabio wants Perth ON (his position: AI video should be labelled).
Perth is MIT, resolves from PyPI at 1.0.1, and applies to any wav -- so one MpiNode can
stamp both engines' output uniformly. Qwen has no watermarker of its own.

**Multi-speaker is a Flow feature, not a model feature.** `FL_ChatterboxDialogTTS` is a
196-line Python loop over `SPEAKER A:`-prefixed lines calling `tts.generate()` per line.
Its per-speaker stems (silence-padded, time-aligned) are the right shape for a video
timeline and worth keeping. Its limits: 4 hardcoded branches, exact case-sensitive
prefixes that `continue` silently on a mismatch, butt-joined clips with no inter-turn
pause, and a `keep_model_loaded` param that is never referenced in the body.
Per-speaker/per-line emotion IS possible -- `generate()` takes
`exaggeration`/`cfg_weight`/`temperature` per call; filliptm just did not expose them.

**Bench state (ready to test).** ComfyUI 0.31.0 matches `node_lock.json`. Bumped to the
engine's pins: `transformers 5.13.0`, `timm 1.0.28`, `huggingface-hub 1.26.0`
(rollback line in the session scratchpad). Installed + verified building:
`custom_nodes/ComfyUI-QwenTTS` (1038lab, patched) and `custom_nodes/ComfyUI_Fill-ChatterBox`
(filliptm, unmodified). Three workflows staged in `user/default/workflows/`:
`TTS_Chatterbox_all-nodes.json`, `TTS_Qwen3_voice-design.json`, `TTS_Qwen3_voice-clone.json`.
No weights downloaded yet. A ComfyUI-Manager update to the Qwen pack reverts the patches.

## Implementation

- [ ] Settle Qwen viability, then wire the TTS foundation down the branch it selects.
      **Verify:** a real generation from each shipped engine, with the Qwen output's
      silence ratio measured numerically rather than judged by ear.

## Completed

- [ ] Nothing yet.

## Remaining Work

- ~~**Step 1 (blocking).** Measure the Qwen silence ratio on the bench.~~ **WITHDRAWN
  2026-08-23** -- wrong pack, abandoned route. See `## Plan Drift`. Superseded by the
  TTS-Audio-Suite evaluation, which is DONE and recorded in `validation.md`.
- ~~**Step 1' (blocking, a DECISION not a build).** Fabio picks between branch A and
  branch B.~~ **DECIDED 2026-08-23: branch B.** Fabio's reason: branch A "still sounds a
  bit dangerous to our app" -- a self-provisioning second Python runtime inside a shipped
  desktop app is risk the feature does not justify. **Branch A is parked in the backlog,
  not rejected**; it stays costed below and becomes live again only if branch B's corpus
  question comes back negative.
- ~~**Step 1'' (blocking, RESEARCH).**~~ **DONE 2026-08-23** -- four agents reported,
  findings in `research/voice-library-01..04`, conclusion at the top of `## Current State`.
  Original scope: settle branch B's viability:
  can a licensed, redistributable, reasonably diverse voice-reference library exist at
  all? Four parallel research agents dispatched, covering (1) the RVC hubs weights.gg /
  voice-models.com, (2) permissively licensed speech corpora, (3) the voice-cloning legal
  and regulatory landscape incl. whether a curated library changes our exposure versus
  bring-your-own-clip, and (4) prior art -- existing voice packs, TTS-Audio-Suite's
  `CharacterVoicesNode` data model, library UX metadata, and whether a **fully SYNTHETIC**
  library sidesteps consent entirely. Findings land in `research/`.
- **Step 2, branch A (keep Qwen voice design) -- BACKLOG, not active.** Kept costed so it
  can be revived without redoing the work. Vendor NARROWLY from
  `diodiogod/TTS-Audio-Suite` (MIT) into `ComfyUi-MpiNodes` via `/mpi-nodes-sync`: its
  `utils/runtimes/` subsystem (`bootstrap.py`, `launcher.py`, `session.py`,
  `protocol.py`, `profiles.py`, `qwen3_tts_proxy.py`, `workers/qwen3_tts_worker.py`) plus
  the `qwen3_tts_transformers4_dedicated` profile. Do NOT take the pack's
  `requirements.txt` or `install.py`. The ComfyUI process never imports transformers 4,
  so an engine bump cannot break it -- that is the whole point. Open sub-questions, in
  order: does `virtualenv` bootstrap correctly off the Windows **embeddable** interpreter
  (no `venv` module, `python313._pth` disables `site`); how does the runtime reach the
  Pod, which has no such bootstrap; and how does a runtime that installs itself at first
  use surface in the download manager and progress UI instead of hanging silently.
- **Step 2, branch B (drop Qwen) -- ACTIVE DIRECTION.** Cover both Flows with Chatterbox cloning plus a
  voice-reference library. Retires the transformers 4-vs-5 problem permanently and adds
  no second runtime. Gated on the licensing/consent question below, which becomes the
  next research step if this branch is chosen. TTS-Audio-Suite's `CharacterVoicesNode` /
  `RefreshVoiceCacheNode` are the reference implementation of the library shape and are
  worth reading either way.
- **Step 2b (NEW, blocking the library only).** The one gate: generate a voice via the
  Qwen3-TTS VoiceDesign **HF Space**, feed the clip to Chatterbox on the bench, listen.
  Proves or kills the synthetic-library route without installing Qwen anywhere.
  If it holds: author 30-50 VoiceDesign prompts across
  `{young, middle-aged, senior} x {male, female} x {American, British, Australian, Indian, neutral} x {conversational, narration, character, dramatic}`,
  3 samples each, keep the most consistent (the model is NOT deterministic), store the
  prompt as `description_prompt` so a voice can be regenerated or varied later.
  If it fails: fall back to VCTK + GLOBE per `research/voice-library-02`.
- **Step 2b' (NEW, blocking the DESIGNER -- the live question).** Decide where user-driven
  voice design runs. Leading option: **bake a `transformers==4.57.3` venv into the Pod
  image** and expose voice design as a remote op (`c:\AI\Mpi\mpi-ci\cubric-vision-pod\`,
  see `docs/runpod-remote-engine.md`). Sub-questions: is remote-only acceptable for this
  feature; does the wrapper need a new endpoint or does it fit an existing graph dispatch;
  what does the UI do when no Pod is running. A local path stays available later via the
  branch-A narrow vendor, now demoted to a follow-up rather than the primary route.
- **Step 2c (NEW, compliance -- do not skip).** Confirm Perth marking is applied to every
  audio output path (EU AI Act Art. 50, live since 2026-08-02, Vision is the provider),
  and resolve whether reference audio may go to the RunPod Pod at all. Both are recorded
  in `research/voice-library-03`.
- **Step 3.** Ship Chatterbox first regardless of the branch -- it is unblocked today.
  Build the dialogue splitter as an MpiNode rather than reusing `FL_ChatterboxDialogTTS`:
  speaker count as a parameter not 4 branches, warn instead of silently dropping an
  unmatched line, inter-turn pause, per-speaker and per-line emotion, keep the stems.
- **Step 4.** Flow A UI: `MpiRadioGroup` for short enumerations (gender, age band, emotion),
  `MpiDropdown` for longer ones (accent, texture), composing into the prompt string, plus a
  raw prompt box. Qwen's "Voice Instruct" node is only a prompt builder -- its output is
  plain text (`gender / age / pitch / speed / volume / clarity / fluency / accent /
  texture / emotion / tone / personality / style note`), so the same vocabulary serves both.
- **Step 5.** Add the probe scripts to the bump-engine checklist. `layer_type_validation`
  is scheduled for removal in transformers **v5.20** and `rope_config_validation` already
  warns as removed, so the 1.6 ComfyUI bump can break Qwen again at new call sites.

## Plan Drift

- **2026-08-23 (session 13) — VOICE CHANGER becomes its own Flow and ships FIRST.** Fabio's
  call, after driving VC on the bench: *"VC is a flow by itself. We already have a record
  button. All the user has to do is record the performance, choose a voice, and that voice
  comes out with his performance."* It needs 1.0GB (not 4.25), no TTS model, no performance
  clips and no library — the user's own recording IS the performance clip. Supersedes the
  assumption running through this whole plan that TTS is the thing being shipped and VC is
  merely its second stage. Flow B (TTS) is unchanged and follows.

- **2026-08-23 (session 13) — TURBO closed NO-GO, and ACCENT reopened as a RUNTIME
  parameter.** Both from Fabio driving the all-nodes bench graph. Turbo: 4s reference
  fails, 13s works, British accent on nearly everything, and mid-clip British→American
  drift — unstable identity, which is the one thing the pipeline exists to protect. Accent:
  the multilingual `language` selector imposes an accent on any reference, so the library
  needs no accent axis and a user's own voice inherits accents for free. **Two written
  conclusions were falsified and are corrected in place** (this file's multilingual bullet
  below, and `validation.md` § "ACCENT must be baked in at DESIGN time"). Qwen VoiceDesign
  accent stays a closed negative — do not confuse the two.

- **2026-08-23 (session 13) — the multilingual duration anomaly has a named suspect.** The
  "22-30s for ~12 words" on the card is trailing NOISE, per Fabio. `repetition_penalty`
  exists ONLY on the multilingual model (`mtl_tts.py:293`, default **2.0**); plain
  `tts.py` has no such parameter and does not do this. Sweep 1.2/1.5/2.0 with seed,
  reference and text fixed. Gates the accent path only.

- **2026-08-23 (session 13) — Step 3 is TWO gates, and the plan's Step 3 text was wrong
  about what it costs.** It reads "ship Chatterbox first regardless of the branch — it is
  unblocked today", which is true, and then describes only the dialogue splitter. It never
  said that NOTHING was wired: no node pack pin, no python deps, no weight deps. The
  add-flow playbook assumes the model a Flow runs on is already installed (`ltx-foley` and
  `ltx-extend` own no weight at all), so `/mpi-add-flow` alone could not have shipped this.
  Gate 1 (engine onboarding) is now done; Gate 2 is the Flow. Detail in `validation.md`.

- **2026-08-23 (session 13) — the leaf-dep list in `## Current State` was from the wrong
  source and is superseded.** It named
  `librosa soundfile soxr sox s3tokenizer conformer pyloudnorm resemble-perth`, which is the
  closure of the `chatterbox-tts` PyPI package. `ComfyUI_Fill-ChatterBox` VENDORS its own
  `local_chatterbox`, so that list was neither necessary nor sufficient: `sox`/`pysox` is
  NOT needed (the earlier note insisting it was required is moot for this pack), `pyloudnorm`
  is Turbo-only behind a try/except, and `resampy` + `diffusers` + `omegaconf` were missing
  from it. The authority is `compile-node-deps.mjs --check` plus an `ast` pass over the
  pack's imports, both recorded in `validation.md`.

- **2026-08-23 (session 13) — Chatterbox is a FLOW WITH `requiredDeps`, not a ModelDef.**
  All three entities were checked. A ModelDef forces dead fields and a model-picker entry;
  a Plugin is by its own definition "not a tile in the Flow Library". `head-swap` already
  ships the right shape — a FlowDef declaring the weights and node pack that are its own.
  This closes the "does TTS need a ModelDef" question the plan never asked. Carries a GC
  hazard: `flowRequiredDepIds()` is what protects a flow's deps, so the FlowDef must land
  before anything installs those seven weights.

- **2026-08-23 — ARCHITECTURE SETTLED: TTS-then-VC, and the library collapses to ~60 + ~5.**
  Fabio confirmed VC carries emotion at exaggeration 1.2. Pipeline is
  `FL_ChatterboxTTS(text, audio_prompt=<performance clip>, cfg_weight=0.3,
  exaggeration=1.2)` -> `FL_ChatterboxVC(target_voice=<character clip>)`. The library
  becomes ~60 NEUTRAL character clips plus ~5-8 shared emotional performance clips, so
  emotion is a pipeline property and not a library one -- a new emotion costs one clip, and
  a user's own uploaded voice inherits the whole emotional range because it is only ever a
  VC target. Supersedes the earlier 60 x N sizing worry entirely.

- **2026-08-23 — speaker identity became MEASURABLE, and it reshapes the library plan.**
  `research/speaker_similarity.py` loads Chatterbox's own CAMPPlus x-vector encoder out of
  the s3gen checkpoint, so "same voice?" is now a cosine score in the exact space
  Chatterbox clones from. That is the library's QA gate: score every authored emotion
  variant against its neutral base, auto-reject under ~0.70. Findings: identity survives an
  emotion change ONLY if `pitch`/`speed`/`volume`/`clarity`/`texture` are frozen and the
  emotion lines alone vary, and even then it is voice-dependent (an ordinary timbre held at
  0.68-0.88, an extreme gravelly bass fell to 0.45-0.61). The SEED barely matters -- the
  prompt determines identity. Chatterbox VC carries a performance onto a character at
  0.78-0.83 (level with no-VC) and sounds MORE natural than direct, but attenuates emotion;
  pre-compensating by pushing the source is capped at exaggeration ~1.2 before identity
  degrades.

- **2026-08-23 — emotion works, and `cfg_weight` was the whole problem.** The node
  default 0.5 suppresses emotional transfer; 0.3 lets it through, confirmed by ear across
  sad, angry and cheerful. `exaggeration` and `cfg_weight` are COUPLED (the pack calls
  cfg_weight "Pace/classifier-free guidance"), so raising intensity alone produces the
  "fast and mechanical" artefact that made round 1 look like a model limit. Two product
  consequences: the Flow must default cfg_weight to 0.3, and it must expose ONE coupled
  intensity control rather than two independent sliders. Per-emotion sweet spots differ --
  sad is most natural at exaggeration 0.5 and unnatural at 0.8, angry keeps improving to
  1.2 -- so intensity defaults belong in the library metadata, per voice.

- **2026-08-23 — accent cannot be authored with VoiceDesign. Closed after 22 generations;
  do not reopen without new information.** Prose, the pack's own structured `accent:`
  grammar, intensity wording, city anchors and phonetic traits were all tried. One
  convincing British accent appeared and did not reproduce at three fresh seeds; two more
  were "mild"; every non-British accent (Italian, Russian, French, German, Dutch, Spanish)
  came back American. The model has a strong American English prior. **Gender, age and
  delivery-type are unaffected and work well** -- only the accent axis fails, so the
  library ships without author-designed accents. Still OPEN and now the deciding question:
  whether a genuinely accented reference survives Chatterbox cloning, which would let
  accents come from user-supplied clips or a licensed accented corpus instead.

- **2026-08-23 — DECISION, and it closes the hosting question for good: Qwen is NOT
  shipped.** Vision ships Chatterbox plus a self-authored voice library; Qwen3-TTS
  VoiceDesign is demoted to a bench authoring tool at `G:\ComfyUi\_qwen_tts_rt\`.
  Fabio's reason is architectural, not cost: a second Python environment inside an app
  that swaps models constantly is a fragile ecosystem, and the isolated runtime is cheap
  ONLY because it inherits torch from the engine -- which is precisely the coupling that
  breaks on an engine bump. Branch A / option (b) is therefore closed for the shipped app,
  though the runtime itself is built, works, and stays useful on the bench.
  Three findings came with it: `FL_ChatterboxMultilingualTTS` gives Chatterbox 23
  languages WITH a reference clip; ~~accent cannot be requested at runtime (no voice prompt)
  so it must be baked into the library at design time~~ **— WRONG, corrected 2026-08-23
  session 13: the multilingual node's `language` selector DOES impose an accent at runtime,
  so no accent axis is baked anywhere. See `## Plan Drift` and `validation.md`** —; and the multilingual clone
  durations are anomalous and unverified.

- **2026-08-23 — the hosting question narrowed to one option and stopped blocking.**
  Fabio rejected the Pod bake and the hosted DashScope API outright, and leaned to a
  self-authored voice library plus Chatterbox. Meanwhile the local isolated runtime
  (plan branch A / "option (b)") was BUILT on the bench and works, so its cost is now
  measured rather than estimated: 4 packages, ~13 MB, torch inherited, base env provably
  untouchable by pip. Two findings that any future isolated-runtime design must carry:
  `virtualenv --system-site-packages` **silently fails to inherit** off an embeddable
  interpreter (the base `Lib\site-packages` never reaches `sys.path`, despite
  `include-system-site-packages = true`) and needs an explicit `.pth`; and
  `generate_voice_design(language=...)` wants `"english"`, not `"en"`.
  **The library route does not depend on any of it** — authoring happens on the bench and
  only `.wav` files ship, which is why it is the safe answer.

- **2026-08-23 — the blocking Step 1 is withdrawn, not deferred.** It measured the wrong
  pack down an abandoned route. Two things landed on the same day:
  1. The bench run of `TTS_Qwen3_voice-design.json` never reached the forward pass. It
     died at `TypeError: create_causal_mask() got an unexpected keyword argument
     'input_embeds'` — transformers 4->5 break **#4**, with **#5** (`cache_position`
     dropped from the signature entirely) waiting behind it. So PR #201's 67-99% silence
     was never reproduced here, and API patching is an unbounded series against an
     unresponsive upstream.
  2. `1038lab/ComfyUI-QwenTTS` is the wrong pack regardless — GPL-3.0, already ruled out
     for vendoring. Fourteen community packs wrap Qwen3-TTS; **none is from Comfy-Org**
     (checked against ComfyUI-Manager's registry on the bench). Six share the name
     `ComfyUI-Qwen3-TTS`, two flagged UNSAFE by Manager, one REMOVED.
- **2026-08-23 — `diodiogod/TTS-Audio-Suite` evaluated instead.** MIT, 55 nodes, and it
  covers Chatterbox, Qwen3 voice design, VibeVoice, a character-voice library, and RVC.
  Verdict in `validation.md`: **not adoptable wholesale** (numpy `<2.3.0` vs Vision's
  `==2.5.1` fails the compile; forcing Vision's pin still costs +113 packages, 21 version
  moves, three rival opencv distributions, and `sentry-sdk`/`wandb`). Its
  `utils/runtimes/` isolated-runtime subsystem IS validated prior art and is far cheaper
  than this session first estimated: `inherit_base_site_packages=True` means torch is
  shared, so the Qwen transformers-4 runtime is a **44-package** closure, not a ~3 GB
  duplicate stack.
- **2026-08-23 — a Vision-side fact worth keeping.** The Windows engine python is the
  **embeddable** distribution and has no `venv` module (verified: `ModuleNotFoundError:
  No module named 'venv'`, 3.13.12, `python313._pth`). Any isolated-runtime design has to
  bootstrap through pip-installed `virtualenv`, which is what TTS-Audio-Suite already
  does. Unverified against the embeddable interpreter.
- **2026-08-23 — Step 2b RAN. The HF Space named in the plan is dead; a better one replaced it.**
  `Qwen/Qwen3-TTS-Voice-Design` is a DashScope **API proxy** on `cpu-basic`, not a model
  demo, and it errors instantly for everyone (browser UI included, not just the API).
  Switched to **`Qwen/Qwen3-TTS`** — official, `zero-a10g`, running the real open weights.
  Three voices designed, all cloned through Chatterbox on the bench against a real-human
  control and a no-reference baseline. Numbers in `validation.md`; Fabio's listen pending.
  Two facts worth carrying forward:
  - **VoiceDesign open weights are real and Apache-2.0** —
    `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` + `Qwen/Qwen3-TTS-Tokenizer-12Hz`. The bench
    pack downloads and `from_pretrained`s them; it never calls DashScope. Step 2b' still
    has something to host.
  - **The official Space is a proven recipe for the Pod bake** — `transformers==4.57.3`
    on `torch==2.8.0` + `accelerate==1.12.0` + `kernels`/`sox`/`onnxruntime`, serving
    the 1.7B VoiceDesign model on an A10G today. That is the venv to bake, and it is no
    longer a guess.
  - **A hosted route exists as a third option** and was not on the board before:
    DashScope's `qwen-voice-design` is a paid API needing no local runtime at all. It
    trades a per-call cost and a hard dependency on Alibaba for zero hosting work. Not
    recommended without a look at terms and pricing, but it should be named when 2b' is
    decided rather than discovered later.

## Verification

**Verify mode:** user-ux

Audio quality is a human judgement -- Fabio must hear the output. The silence ratio is
measured numerically, but "is this a usable voice" is not. Both Flows also have a UI
surface he must exercise in the running app.

## Preservation Notes

- **Reference clips must be single-speaker — open, and it has a UI consequence.**
  Step 2b's real-human control used a two-speaker conversation by mistake; Chatterbox
  produced a voice matching neither speaker rather than picking one. Likely cause is
  speaker count, but the clip was also 33.6s/44.1kHz so it is not isolated. If a user
  can supply their own reference, the Flow probably has to reject or warn on
  multi-speaker audio instead of silently returning a voice that is nobody. One
  deliberate experiment before Step 3's UI is designed.

- **Open question, worth resolving before Step 2 branch B:** downloadable voice-reference
  libraries. If users can browse and fetch reference clips, Flow A becomes browse-and-fetch
  rather than generation, cloning covers everything, and Qwen becomes optional -- which
  would retire the whole transformers 4-vs-5 problem. Fabio's specific idea (2026-08-23):
  RVC hubs (weights.gg, voice-models.com) are enormous and every entry ships a PREVIEW
  clip you can play. The `.pth` voice-conversion model is irrelevant to us; the preview
  audio IS the clone reference Chatterbox wants. Three things to check, in order:
  1. **Licensing/consent** -- the deciding constraint. Much of that catalogue is cloned
     celebrity and character voices with neither consent nor redistribution rights, which
     sits badly beside Vision's watermarking stance. A permissive corpus route exists as
     the fallback (LibriVox, Mozilla Common Voice, VCTK, LJSpeech) -- real clips, licensed
     for exactly this, no consent exposure.
  2. **Download capability / API** -- whether previews are fetchable per site, or only
     streamed behind a player.
  3. **Clip suitability** -- Chatterbox wants ~10s clean single-speaker audio; a preview
     with music or effects under it is a bad reference.
- Session scratchpad holds the reusable probes: `probe_qwen_transformers.py` (symbol
  surface), `probe_qwen_build.py` (class bodies via stubs), `probe_qwen_construct.py`
  (model __init__ paths), `verify_bench_packs.py`, `validate_staged_workflows.py`,
  `patch_rope_default.py`, plus `bench_freeze_before.txt` / `bench_rollback.txt`.
  Copy anything worth keeping into the repo before the scratchpad is lost.
- On close-out: `docs/README.md` needs a TTS subsystem doc route, and the transformers
  4-vs-5 finding belongs in `.claude/rules/comfy_engine.md` or the new doc -- not in memory
  (it is codebase knowledge).
