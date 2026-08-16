# LTX-2.3 Prompt Contract (→ Cubric-Prompt recipe)

> Durable finding, 2026-06-23. This is the LTX prompt SHAPE Cubric-Prompt must
> generate. Recipe home (when the ship LoRA set is locked):
> `Cubric-Prompt/src/main/recipes/{model-id}.recipe.ts` + research under
> `Cubric-Prompt/dev-docs/recipe-research/`.

## VBVR / Singularity are PROMPT-CONTRACT LoRAs

No trigger word, no baked template (VBVR-V1 meta = `LTX2.3_reasoning_big`,
ai-toolkit; V4 = zero metadata). **The sequence STRUCTURE is the trigger.**

**Contract:** brief scene anchor FRONT-LOADED, then DISCRETE ORDERED literal motion
steps, named body parts, no run-on action piles.

- **i2v** = MINIMAL scene anchor (the start frame already carries the description;
  over-describing fights the pixels) + ordered steps.
- **t2v** = FULL scene description (no frame to lean on) + ordered steps.

Matches Singularity's "Cinematic Timeline" template shape: `[Scene & Style]` first,
then `[Action Timeline 0–Xs]`.

## Audio prompt rule

If ambient/diegetic sound is NOT described, the model defaults to placing **MUSIC**
over the clip. Always either:
- specify ambient sound ("room tone, footsteps, breathing, no music"), OR
- add `music, soundtrack, score` to the negative prompt.

(Durable → bake into the Cubric-Prompt recipe.)

### SUPPLIED AUDIO OVERRIDES THE PROMPT'S SPOKEN LINE (2026-08-16)

The `saying: "…"` contract holds only while the model is GENERATING the audio. With direct
audio live (`Input_Use_Input_Audio` / `#108=true`), the supplied recording's words come
through **verbatim** and the prompt's quoted line is ignored — measured and user-confirmed
on the foley bench, where `#12` asked for one line and the supplied file's line is what
played. Detail: `audio-input.md` § Direct audio.

So a Flow that accepts user audio must not also promise prompt-authored dialogue: the
prompt still steers ambience and delivery, never the words.

## Stereo needs ON-SCREEN MOTION — direction words alone do NOT pan (2026-08-15, foley bench)

**Six runs, and the only two that produced a stereo field both had a subject physically
crossing frame.** Three later runs on a STATIC close-up, all with explicit direction words in
the prompt, came back mono. So the driver is lateral movement in the video; the prompt's
spatial language is not sufficient on its own, and may not be necessary at all.

| run | video | prompt cue | MID/SIDE gap | result |
|---|---|---|---|---|
| `00025` | lizard, crosses R→L | EMPTY (`\n`) | 48.6 dB | mono |
| `00026` | lizard, crosses R→L | "from the right… to the left" | **14.7 dB** | **panned R→L** |
| `00027` | lizard, crosses R→L | same cue, sound-first phrasing | **18.1 dB** | **panned R→L**, +12 dB louder |
| `00028` | man, static close-up | "slightly to the left of frame" | 25.7 dB | mono — L/R trace flat 0.0 |
| `00030` | man, static close-up | off-frame speaker, no direction | 46.3 dB | mono |
| `00031` | man, static close-up | "somebody off frame **from the right**" | 35.2 dB | mono |

`00028`/`00030`/`00031` are the disproof of the simple "prompt drives stereo" reading: three
explicit spatial cues, three mono outputs. A static close-up gives the model no lateral
information, and it centres everything regardless of the words.

**Still unseparated:** on the two clips that DID pan, direction words and on-screen motion were
both present. Untested — the lizard clip with NO directional language: if it still pans, motion
alone is sufficient and the prompt contributes nothing.

**Product consequence:** do not promise prompt-controlled panning. Stereo emerges when the
SOURCE MOVES on screen. For a static shot, expect mono.

### The original three-run reading (superseded, kept for the numbers)

Same 5s lizard clip (`ref2v_ms_063.mp4`), `#108=false` so the source audio is discarded and
regenerated:

| run | prompt | MID/SIDE gap | result |
|---|---|---|---|
| `MpiVideo_Foley_00025` | EMPTY (`\n`) | 48.6 dB | **mono** — centred, no placement |
| `MpiVideo_Foley_00026` | shot-description, names "from the right… to the left" | **14.7 dB** | **panned right → left** |
| `MpiVideo_Foley_00027` | sound-first rewrite, same directional cue | **18.1 dB** | **panned right → left**, 12 dB louder mix |

Two seeds, two-for-two on the spatial behaviour — worth stating given how wide the
seed lottery is on this graph. Per-250ms L/R trace on 00026: `R-L` = +2.5/+3.0/+2.1 dB
over the first 0.75s, flat 0.0 through the middle, −3.9 dB at 4.75s. The pan tracks the
on-screen movement, but only once the prompt has named it.

**The surviving prompt axis is phrasing, not direction:**
- *Direction words* (`on the right`, `crossing to the left`) → **only when the subject moves
  on screen**; inert on a static shot (see the table above).
- *Sound-first phrasing* (name the SOUND, not the shot) → level and quality. 00027's
  rewrite went from a generic noise to an audible breath, and gained 12 dB of presence.
  A prompt that reads like a shot description (`a lizard scuttles into frame…`) still
  pans correctly but makes worse sound.

Cubric-Prompt recipe consequence: always emit a sound-led description. Add spatial cues only
when the shot has lateral movement — on a static shot they buy nothing.

### The model DOES see the video

Run 00025 had an empty positive prompt (`\n` only) and still returned coherent audio at
a normal level (−21.1 dB mean) against a near-silent source (−52.7 dB). Nothing but the
video conditioned it. So video-conditioned foley is a real capability of the shipped
graph — it simply defaults to centre. Untested: how good that audio is unprompted; it
was judged "mono" by ear and not evaluated for content.

### Closed — spatialising a close-up does NOT work

Tested 2026-08-15 across `00028`, `00030` and `00031`: a static close-up cannot be placed
off-centre by prompt alone, including an off-frame speaker explicitly placed "from the right".
All three came back mono. The user's cinematic expectation — an off-frame voice should come
from the side it is on — is NOT met by this model.

