# MPI-694 — Stable Audio 3: SFX, one-shots, instruments, instrumental music

Split out of **MPI-664** (Music Maker / MiniMax Music 3) on 2026-09-05, after Fabio
evaluated Stable Audio 3 on the bench across all four modes and approved it.

> *"This model is good, and the audio quality is really good as well. I tried everything.
> Instrumental, effects, one-shot, and music: it's very good… **We can use it for everything
> else but sung songs.**"* — Fabio, 2026-09-05

**Every bench fact lives in `../MPI-664/research/stable-audio-3-bench.md`. Read it, do not
re-derive it.** This card carries only what is new since the split.

## What this card is

Stable Audio 3 takes **SFX, one-shots, instruments and instrumental music**. MiniMax keeps
**vocals**, the one thing Stable Audio does not claim. A split by capability, not a
replacement — and SFX/one-shots are a capability Vision has **no route to today**.

The delivery shape is Fabio's, and it is not "a second flow": **ONE FLOW, TWO MODELS, ONE
ANNOUNCER.** That design sits on MPI-664 until he names the two outcomes he left blank.
This card owns getting Stable Audio 3 itself shippable.

## 🟢 GATE 1 CLEARED — both licences read whole, 2026-09-05

Not a summary. Both agreements, plus both policies they incorporate by reference, read
end to end: the Stability AI Community License Agreement (Last Updated 2024-07-05), the
Stability Core Models list (2026-05-20), the Stability AUP (effective 2026-09-30), the
Gemma Terms of Use (2026-04-01) and the Gemma Prohibited Use Policy (2024-02-21).

**Both weights we hold are in scope and both are permitted. Neither licence restricts by
territory, and neither puts a bar on outputs.** But shipping carries **five concrete
obligations**, and they are files and UI strings, not a legal opinion:

### Stability AI Community License

- **Coverage confirmed.** The Core Models page names **Stable Audio 3.0 Small** and
  **Stable Audio 3.0 Medium** explicitly. Both files on disk are covered. Anything not on
  that page falls outside the Agreement and back to its own licence — check the list before
  adding a fourth Stable Audio weight.
- **Commercial use is free under USD $1M annual revenue** (§III), counted across You and
  Affiliates, *"regardless of whether that revenue is generated directly or indirectly"*.
  Crossing $1M **terminates the licence on that date** and needs an Enterprise licence.
- 🔴 **REGISTRATION IS MANDATORY, and it has no revenue floor.** §III: *"If You are using
  or distributing the Stability AI Materials for a Commercial Purpose, You must register
  with Stability AI."* Shipping Vision is a Commercial Purpose. **Do this before release,
  not after** — it is an action, not a condition we already satisfy.
- 🟢 **OUR USERS ARE COVERED BY US.** §III's last sentence: *"If you receive Stability AI
  Materials, or any Derivative Works thereof, from a Licensee as part of an integrated end
  user product, then Section III of this Agreement will not apply to you."* Vision's users
  need no registration and no licence of their own. This is why the answer to
  [[project_model_licences_can_be_territory_restricted]] is benign here.
- 🟢 **OUTPUTS ARE THE USER'S.** §IV(c)(iii): *"you own any outputs generated from the
  Models"*, and §V excludes model output from "Derivative Work" entirely. No revenue bar
  and no territory bar reaches a generated clip. **The AUP still governs how outputs may
  be used** (§IV(b) incorporates it by reference), and outputs may not be used to *"create
  or improve any foundational generative AI model"*.
- 🔴 **THREE SHIPPING OBLIGATIONS, §IV(a), triggered by distribution** — and Vision does
  distribute: it pulls the weights onto users' disks and ships a product that uses them.
  1. Provide a copy of the Agreement to the recipient.
  2. Ship a **`Notice` text file** carrying, verbatim: *"This Stability AI Model is licensed
     under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights
     Reserved"*.
  3. **Prominently display "Powered by Stability AI"** on a related website, user
     interface, blogpost, about page, or product documentation.
- No trademark licence beyond obligation 3. Governing law California. Revocable on breach.

### Gemma Terms of Use — they DO apply

`t5gemma_b_b_ul2` is the text encoder **every arm needs**, and **T5Gemma is named in the
Appendix** of the Gemma Terms. Confirmed, not assumed.

- **§3.2 Use Restrictions is short**: no use for anything in the Gemma Prohibited Use
  Policy (incorporated by reference), and no use in violation of law. Google reserve the
  right to restrict usage *"remotely or otherwise"*.
- 🟢 **§3.3: Google claim no rights in Outputs.** No revenue bar, no territory bar.
- 🔴 **§3.1 adds two obligations on top of Stability's** — again triggered by distribution:
  4. **Our own terms of use must carry §3.2's restrictions as an *enforceable provision***,
     and users must be given notice that Gemma is subject to them. This is the only
     obligation on either licence that reaches our **EULA text**, not just a bundled file.
  5. The `Notice` file must also carry, verbatim: *"Gemma is provided under and subject to
     the Gemma Terms of Use found at ai.google.dev/gemma/terms"*, and a copy of the Gemma
     Agreement goes to recipients.
- ⚠️ The Gemma PUP bars sexually explicit content *"except … scientific, educational,
  documentary, or artistic purposes"*. Worth knowing before this meets the abliterated
  announcer: t5gemma encodes **every** audio prompt, so the PUP reaches the audio prompt
  path whichever LLM writes it.

**Net: one `Notice` file serving both, two licence copies bundled, one "Powered by
Stability AI" string in the UI, one EULA clause, and one registration with Stability.**
None of it blocks the build. All of it blocks a release.

## 🟢 GATE 2 MEASURED — the two-node VRAM fix, and it is NOT two nodes

Measured on the bench (8188, RTX 4060 Ti 16 GB), reprompter ON — the only condition under
which the 4.55 GB Qwen weight is resident at all. Peak read from ComfyUI's own
`/system_stats` (`vram_total − vram_free`) polled at 200 ms, **not** `nvidia-smi`. Runner
and raw results: `../MPI-664/bench/stable_audio_vram.mjs` + `.results.json`.

| arm | `MpiClearVram` | decode | peak VRAM | wall |
|---|---|---|---|---|
| **A** — the blueprint as shipped | — | plain | **12.35 GB** | 19.0 s |
| **C** — unload only | ✅ | plain | **6.44 / 6.19 / 6.44 GB** | 19.7 / 18.0 / 15.3 s |
| **D** — chunked decode only | — | tiled | **12.16 GB** | 33.2 s |
| **B** — both | ✅ | tiled | **6.33 / 6.35 / 6.35 GB** | 38.7 / 31.9 / 32.6 s |

🟢 **`MpiClearVram` IS THE WHOLE WIN: 12.35 GB → 6.4 GB, −5.9 GB (−48%), for +0.7 s.**
It confirms the co-residency the bench note predicted (qwen 4.55 + t5gemma 1.19 + audio
~4.6) and removes it. Ship it. It goes on the `TextGenerate → encoder` edge, which keeps it
inside `ComfySwitchNode`'s lazy branch, so with the reprompter off it never runs.

🔴 **`VAEDecodeAudioTiled` DOES NOT PAY AT 60 s, AND THIS REVERSES THE PLAN.** Once the
unload is in, chunking saves **nothing** on peak (6.35 vs 6.19–6.44 GB, inside the noise)
and costs **+15 s — roughly the whole generation, reproduced three times**. At 190 s it
saves 0.44 GB for +4.2 s. The 6.49 → 5.14 GB figure Stability publish is real but it is
measured against an un-chunked decode with everything else still resident, which is arm
D — and arm D is 12.16 GB, i.e. the decode was never the thing pinning the card. **The
reprompter was.**

So: **ship node 1, do not ship node 2 by default.** Chunked decode is a long-duration /
small-card fallback, and the threshold has only been probed at 60 s and 190 s on a 16 GB
card. Fabio's call whether that fallback is worth wiring at all.

## Still open

- The two blank outcomes on MPI-664's flow list. **Ask, do not guess.**
- One announcer: recommendation is keep ours (`qwen3vl-abliterated-clip`, 4.88 GB, already
  shipped, shared with the Image Describer plugin) and port Stability's four category
  recipes onto it. Theirs is 4.55 GB — 330 MB apart, so consolidation is **not** a VRAM
  win; the cost of two is users downloading **both, 9.43 GB**.
- Whether Stability's example-dense recipes (47/80/58/36 worked examples per category)
  contradict MPI-664's one-example ban, or reframe it as a question of **salience**.
- A direct A/B against MiniMax on one instrumental brief, before deciding which engine owns
  instrumental music.
- Does the reprompter beat a hand-written prompt? Untested; every clip judged good so far
  was made with it **off**.
