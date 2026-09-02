# 09 — When Stage 2 comes back

[04-promote.md](04-promote.md) covers sending a recipe to Stage 2. This file
covers the **return path**: what to do when a real production has actually shot
with the model and its findings contradict a recipe that is Stage 1 green.

It exists because it happened. Fabio shot a ~100-clip western on `minimax-h3`
(`MadPony-Identity/production/cubric-western/findings/h3-prompting.md`, 1,854
lines) and its README names Cubric Prompt as its second audience:
*"Anything here that contradicts `minimax-h3.recipe.js` is worth a card on that
repo."* That file is the source of truth. **Read it, do not duplicate it.**

---

## The three rules that govern the merge

### 1. Field evidence outranks a Stage 1 green, always

A Stage 1 green measures the **instrument** — an enhancer LLM, a judge LLM and a
set of deterministic checks agreeing with each other. It never once saw a pixel.
A render is the thing the product is for. When they disagree, the render is
right and the sweep gets re-run.

This is not hypothetical humility: `pony` passed **every sweep it ever ran** at
judge 2/2/2 while emitting bracketed placeholders, a leaked quality word and an
emoji. The judge is an LLM with an opinion. A camera is not.

### 2. Evidence is scoped to the MODE that produced it

**The hardest discipline in the merge, and the easiest to lose.** A findings doc
reads as "how the model behaves"; it is really "how the model behaves in the mode
someone was shooting". The western was shot **reference-to-video only** — not one
i2v roll, not one t2v roll — so every measurement in it is an r2v measurement,
even though the file never says so on each line.

Practically:

- Tag every merged claim with the mode that produced it.
- A finding in the mode under discussion is *stronger* evidence, not equal
  evidence. The H3 `CUT 1 / TRANSITION / CUT 2` mandate is contradicted by 24
  shipped clips **in that exact mode** — that is as good as this process gets.
- A finding from another mode is a **hypothesis** for yours, never a result.
  Modes share a recipe file and shared rule consts, which is exactly why a claim
  will drift across them if nobody stops it.
- Say which mode the production actually used, in the merge notes, once, at the
  top. Everything else inherits it.

### 3. One format change per measurement

A vendor guide often documents more than you should adopt at once. Change the
output format **or** the content in a given roll, never both — a bad result from
a double change is unattributable and costs the roll twice. Fabio adopted H3's
`[Shot N]` cut syntax and its two sound fields surgically, on top of a shape that
had already shipped twelve shots, and deliberately did **not** adopt the other
four sections of the vendor's rewrite format. Copy that discipline.

---

## What a merge costs, and budget it up front

**Every recipe edit resets the twice-green counter.** A merge that touches three
modes owes six clean sweeps before the recipe is green again, plus the iteration
sweeps in between — measured at ~7 minutes each. Do not start a merge believing
the recipe stays green; it does not, and pretending otherwise is how an
unverified recipe gets reported as proven.

Order the work so the knowledge survives even if the sweeps do not finish:

```
1  Harvest into the card + the durable docs      <- cheap, permanent, do first
2  Rules that generalise -> .claude/rules/       <- survives card archival
3  The recipe edit itself                        <- resets green
4  Re-sweep, per mode, twice                     <- the long tail
```

---

## Model-behaviour laws worth carrying to the next video recipe

These came out of one production on one model, but none of them are H3-specific
mechanics — they are properties of how a generative video model resolves an
under-specified instruction. Treat them as the prior for the next video recipe.

**The cheapest satisfying path wins.** Given two ways to satisfy the prompt, the
model takes the cheap one. Bitten three times in one production: an aim written
as body-relative resolved to "forward"; a framing that could be reached by moving
the camera or the actor moved the actor; a voice reference containing the shot's
own line got played back verbatim, because reusing the take discharges the timbre
binding *and* the dialogue in one action. **If an instruction has a cheap wrong
reading, close it — do not restate the right one louder.**

**Given an impossible instruction, the model relocates something rather than
failing.** An orbit asked for inside a closed wagon bed moved the *subject* out
to where the move fit. A subject drifting somewhere absurd is the shape of a
move that cannot happen where it was asked for.

**Off-screen space does not exist.** "Behind the camera" has no pixels, so the
instruction gives the model nothing and it puts the thing wherever it can be
drawn. Write entrances and exits as **frame edges**.

**A negative is a positive token when the model has no negative field.** H3's
node takes one `String` called `prompt` — there is no negative conditioning
anywhere. So `no close-up` puts *close-up* into a shot that wants a large face.
Keep a generic tail that names nothing the scene ever wants (text, subtitles,
logos, watermarks, cartoon rendering, dissolves, warped anatomy, flicker) and
state everything else **positively**. The one exception is a **role ban** —
a negative about what a *reference* is for, not about scene content.

**Detail is a signal of importance, and the model pays for it with framing.**
Fine-grained prose about a small object returns an extreme close-up of it; a
verbatim descriptor on a background element promotes it to subject. Descriptors
are written for the frame the asset is the *subject* of, and carrying one
verbatim into a frame where the asset is background costs the shot.

**A reference is an identity, not a performance.** A picture reference is not a
pose and an audio reference is not a delivery. One take per character; the prompt
writes what changes shot to shot. Where the prompt is silent, the reference fills
in — including its own viewpoint, its own scale and its own softness.

**Every second has to be written, and a sustained action needs an end.** An
unbounded shout ran six seconds; an unwritten movement got invented to fill the
clip; a long move written with only a start and an end drifted in the middle.
**The same content at a different length is a different prompt, not the same
prompt with a different setting** — which is a real constraint on treating
duration as a pass-through generation setting.

**Naming a speed does not produce it; describing the movement does.** And a
named film term (`crash zoom`) lands harder than a description of one.

---

## Two reasoning failures the production logged against itself

Both are about evidence handling, and both are cheap to repeat.

**"It was fine before" is a memory, not a measurement.** A conclusion was
retracted and rebuilt around a control that had never been checked — the earlier
material had the same fault, it was merely *less noticeable*. A difference in how
much something is noticed reads exactly like a difference in whether it happened.
Re-examine the old material before treating it as a control.

**An absent knob and two failed rewordings rule out only what was tested.** A
finding was declared "not promptable" with an invented mechanism to justify it.
The conclusion happened to be right; the reasoning was not, and the control
experiment that would have settled it was never run even though earlier rolls
already contained the answer.

Same family as this repo's own rule that a green sweep is not a read output.
Write down what you measured, not what you concluded.
