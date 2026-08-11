# LTX-2.3 t2v Black Bars + NAG for Negatives

> Concluded 2026-07-01 (live-proven, RTX 4060 Ti). Two independent findings from the same
> session. See also the `/64 rule` footnote in [tiers.md](tiers.md).

---

## Black bars = t2v-only compositional artifact (NOT a pipeline or dimension bug)

Black bars (letterbox, top+bottom) at LTX-2.3 t2v output are the **model choosing a
cinematic/letterbox composition**, baked into the **stage-1 latent** (visible pre-upscale).
They are NOT a resolution-snap problem, NOT the spatial-upscaler, NOT the app or
`generate_ltx.py`, NOT the LoRA.

**Root cause:** LTX-Video was trained with pure-black pixels (RGB 0,0,0) as a
"generate-here" sentinel and had letterboxing stripped from training data — so on some
seeds/prompts (especially ones with `cinematic`, `anamorphic`, `widescreen` framing
words) the model spontaneously frames sub-canvas and fills the margin black.

**It is seed/composition-dependent, not dimension-dependent.** The same 2560×1408
dimension produced bars on one run and clean on another (in-app vs browser); the variable
was seed/composition, not the number. A full session of divisibility theories was falsified
by this A/B. (**Note:** /64 is still a REAL pipeline constraint — see
[tiers.md § /64 rule](tiers.md#the-64-size-rule) — but it is NOT the
cause of black bars.)

**i2v does NOT bar** — the start frame pins composition edge-to-edge, leaving no black
region to invent (live-verified: i2v stage-1 latents clean at the same seed/prompt that
barred in t2v). Since i2v is the primary usage path, this is a **cosmetic t2v-only
footnote, not a blocker.**

Things that DON'T fix it (all live-tested): (a) negative-prompt terms (`letterbox, black
bars, pillarbox, vignette`) — even with NAG forcing negatives to fire; (b) stripping
`anamorphic`/`cinematic composition` from the positive — still barred; (c) sampler/
scheduler swap (the ComfyUI #13 euler+Mochi patch targets a DIFFERENT artifact — white
borders + end-logos, not seed-dependent black bars). The only dimension-preserving hard fix
is post-gen crop-detect + inpaint-fill — deferred; not worth it while i2v is clean.

---

## NAG required for negative prompts on distilled LTX-2.3 (CFG=1)

The distilled LTX-2.3 (`ltx-2.3-22b-distilled`) effectively runs at **CFG=1 → negative
prompts are IGNORED** by default (official Lightricks position, HF LTX-2 discussion #42).

**Not merely ignored — never computed.** `comfy/samplers.py:610` sets `uncond_ = None`
when `cond_scale` is 1, so the negative pass does not run at all. Two consequences:
a `ConditioningZeroOut` on the CFG negative saves **zero** sampling time (there is
nothing there to skip), and no amount of prompt-side work can revive the CFG path.

**Fix = KJNodes `LTX2 NAG` node** (Negative-guidance At Guidance-1). It works *inside
cross-attention* — patching `attn2` from `nag_cond_video` and `audio_attn2` from
`nag_cond_audio`, on every transformer block — which is exactly why it survives
distillation while CFG does not.

**Wiring:** NAG sits on the MODEL line, AFTER the LoRA stack, BEFORE the sampler/preview-
override: `LoRA merge → LTX2 NAG → Preview Override → sampler`. Its `nag_cond_video` /
`nag_cond_audio` inputs come from the **NEGATIVE** encodes.

> ⚠️ **That last sentence was true as intent and FALSE in the shipped graph from
> 2026-07-01 until 2026-08-07.** `nag_cond_video` was wired to `CLIP Text Encode
> (Positive Prompt)`, so LTX's negative prompt did nothing at all and NAG was steering
> *away* from what the user asked for. `validate-injection-rules.mjs` checks titles, not
> semantics, so nothing caught it. **Verify this against the dispatched graph
> (`/history` on `:48188`), never against this page.** See memory
> `feedback_doc_right_artifact_wrong`.

**Two independent negatives, both user-driven (MPI-474).** `Input_Negative` feeds the
video side; `Input_Negative_Audio` feeds the audio side through `Negative Audio (NAG
only)`. The prompt box cycles positive → negative → negative audio to reach them.

**The baked audio-defect list was REMOVED, and the advice that produced it was wrong.**
An earlier pass replaced a shot-specific ban list with "universal audio-defect terms
only" (`underwater, echo, muffled, hiss, crackle, static, tinny, low-quality, hum,
buzz`). NAG steers **away** from its cond, so that list is an instruction to sound like a
clean studio recording — which is precisely where LTX's unwanted background **music**
comes from. It also removed creative range: `echo`, `muffled`, `distortion` and `robotic`
are things a user may deliberately want. The widget is now empty and user-driven.

**Empty is not neutral — gate, do not zero.** An empty `CLIPTextEncode` still produces a
real embedding, and NAG would steer away from *that*. So each side is gated on its string
being non-empty (`MpiAnyChecker.has_value` → `MpiIfElse`), and when **both** are empty
(`MpiBooleanCompare` mode `one_is_true` → false) the whole NAG node is bypassed and the
unpatched model goes to the sampler. `MpiIfElse` is lazy, so the untaken branch never
executes and the per-block attention cost is genuinely not paid. This is why the app
injects `Input_Negative_Audio` **even when empty** — a cleared box must reach the node to
switch NAG back off.

**Dependency-cycle trap:** if NAG's cond comes from a `CLIPTextEncode` whose CLIP traces
back through the same LoRA-model-clip node that NAG's model output feeds, ComfyUI reports
"Dependency cycle detected." Keep the model path (LoRA→NAG→sampler) and the cond path
(neg-encode→NAG) one-directional, never crossing back.

KJNodes is installed local AND on the Pod (WAN uses it too). NAG did NOT fix the black
bars (above) but is kept because it is the only thing that makes a negative prompt
functional at all on this model.

---

## Why cfg 1 in the first place — and why raising it is not free (MPI-4, 2026-08-11)

NAG exists because **cfg 1 kills the negative prompt**: `do_uncond()` is
`not math.isclose(cfg_scale, 1.0)`, so at cfg 1 no uncond pass runs and the
`(cfg-1)*(pos-neg)` term is zero. NAG steers at the attention level instead, which is why
it is *the* cfg-1 answer for negatives rather than one option among several.

### The cfg-1 `uncond_pred = None` crash trap

Core assigns `uncond_pred = None` under its cfg-1 optimisation. `MultimodalGuider` line 269
replicates the `sampler_post_cfg_function` hook and reads `noise_pred_neg`
**unconditionally**, so the crash needs **both** cfg 1.0 on both modalities **and** some
node registering a post-cfg function. Dropping AUDIO cfg 6 → 1 to fix distorted audio is
exactly what armed it; the reference-audio branch was what registered the hook.

**The fix is to use core `CFGGuider` at cfg 1 on that branch, not `MultimodalGuider`** —
core guards the None, and at cfg 1 `MultimodalGuider`'s `stg` and `modality_scale` are
inert anyway. This is already what `ltx_i2v_t2v_template.json` ships.

### cfg is NOT a gain control (measured)

Swept `#118 CFGGuider.cfg` API-only, seed held at 45 on `t2v_004.mp4`:

| cfg | mean_volume | max_volume |
|---|---|---|
| 1.0 | -39.7 dB | -10.9 dB |
| 1.5 | -39.5 dB | -9.2 dB |
| 2.0 | -39.3 dB | -8.9 dB |
| 3.0 | **-33.2 dB** | **-1.5 dB** |

From 1.0 to 2.0 the mean moves 0.4 dB — nothing — while the peak creeps 2 dB. At 3.0 the
mean jumps 6.5 dB and the peak 7.4 dB. **It moves transients, not the body of the track**,
which is how Lightricks' cfg 6 produced `max_volume 0.0 dB` clipping: not "too loud" so much
as transient-blown. The usable window is narrow and **3.0 sits at the top of it** — the
shipped value, judged by ear. Adding NAG on top cost 0.4 dB of peak, leaving 1.1 dB of
headroom; a more percussive clip is the case that would force 2.5.

> **This is why normalisation was abandoned:** the reference graph has no gain stage, and
> the only core option (`AudioAdjustVolume`) is a fixed dB gain with no peak detection, so a
> gain sized for one render clips the next.
