# TTS in Vision: resolve Qwen3-TTS viability, then wire Chatterbox + Qwen as Flows

## Current State

Project mode: scalable-foundation.

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

Research session 2026-08-22/23 evaluated Chatterbox, Qwen3-TTS, DramaBox and VibeVoice.
Nothing in the Vision repo was edited. All changes so far are on the standalone bench
(`G:\ComfyUi`, port 8188) and in a session scratchpad.

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
| DramaBox | LTX-2 Community | Rejected: 240 HF dl/30d, stale since 2026-05-23, 24GB VRAM, no weight sharing |
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
  languages WITH a reference clip; accent cannot be requested at runtime (no voice prompt)
  so it must be baked into the library at design time; and the multilingual clone
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
