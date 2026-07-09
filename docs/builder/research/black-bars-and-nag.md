# LTX-2.3 t2v Black Bars + NAG for Negatives

> Concluded 2026-07-01 (live-proven, RTX 4060 Ti). Two independent findings from the same
> session. See also the `/64 rule` footnote in [ltx-2.3-tiers.md](ltx-2.3-tiers.md).

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
[ltx-2.3-tiers.md § /64 rule](ltx-2.3-tiers.md#the-64-size-rule) — but it is NOT the
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

**Fix = KJNodes `LTX2 NAG` node** (Negative-guidance At Guidance-1), which injects
negative conditioning at CFG=1.

**Wiring:** NAG sits on the MODEL line, AFTER the LoRA stack, BEFORE the sampler/preview-
override: `LoRA merge → LTX2 NAG → Preview Override → sampler`. Its `nag_cond_video` /
`nag_cond_audio` inputs come from the NEGATIVE `CLIPTextEncode`.

**Dependency-cycle trap:** if NAG's cond comes from a `CLIPTextEncode` whose CLIP traces
back through the same LoRA-model-clip node that NAG's model output feeds, ComfyUI reports
"Dependency cycle detected." Keep the model path (LoRA→NAG→sampler) and the cond path
(neg-encode→NAG) one-directional, never crossing back.

NAG is now baked into the LTX template (both video + audio cond, per NerdyRodent). KJNodes
is already installed local AND on the Pod (WAN uses it too). NAG did NOT fix the black bars
(above) but is kept because it makes the negative prompt functional at all. The audio
negative prompt was also generalized this session: the old shot-specific one banned `music,
instruments, trumpet, cello, ...` + accents — a baked default that blocked legit gens;
replaced with universal audio-defect terms only.
