# MPI-645 — DramaBox clips the line at short durations

> Reported by Fabio, 2026-08-28, running the shipped flow after MPI-607 closed:
>
> > *"In DramaBox, I noticed that when asking for three seconds, I always get a
> > two-second clip clipped at the end without the whole sentence."*

## The cause, traced (not a guess)

`DramaBoxSampler` takes the duration RAW whenever it is non-zero —
`custom_nodes/ComfyUI-MelodramaBox/dramabox_nodes/generate.py:178-182`:

```python
if len(chunks) == 1 and duration_seconds > 0:
    duration = duration_seconds
else:
    duration = sampling.estimate_duration(chunk["text"], duration_multiplier)
```

And the estimator it skips carries **two protections** — `sampling.py:44-46`:

```python
def estimate_duration(prompt: str, multiplier: float = 1.1) -> float:
    return max(3.0, round(estimate_speech_duration(prompt) * multiplier, 1))
```

1. a **hard 3.0 s floor** — upstream never asks for less, whatever the text;
2. a **×1.1 pad** on the sentence-aware estimate — headroom so a line finishes.

**Our slider's `min` is `1`** (`js/data/flowsRegistry.js`, drama-box
`Input_Duration`), and it is always non-zero, so the estimator branch is *never*
taken. A user picking 3 s gets the bare minimum upstream would ever choose, with
none of its headroom; anything under 3 s is below a floor the model's own author
put there. The line simply runs out of window and is cut.

## 🔴 Do NOT "fix" this by restoring the estimator

`duration_seconds: 0` selects the estimator, and MPI-607 removed that
deliberately. Fabio, measured by ear across two sessions: the estimate is what
makes the model **read the prompt aloud** and stretch a line that should be
delivered fast. An explicit duration was recorded as *the single biggest quality
control* on the flow. Reinstating `0`, or defaulting to it, re-opens that.

The current copy also teaches the opposite: `flowsRegistry.js` says the slider
"starts at 1, never 0 — the estimator is not an option the user should be able to
pick back up."

## Options, none decided — this is a product call

- **Raise the slider `min` to 3** to match upstream's floor. Smallest change,
  removes the unreachable range, but does not help a long line at 3 s.
- **Pad the injected value** (the ×1.1 the estimator would have applied) before
  it reaches the node, so the user's number is a target rather than a hard cut.
  Changes what the number means; the label would have to earn it.
- **Both**, which is probably the honest answer: a floor plus headroom.
- Leave it and say so in the copy. Weakest — the failure is silent and looks like
  a broken model rather than a setting.

Whichever way it goes, **check what the output length actually is**: Fabio asked
for 3 s and got ~2 s, so the delivered clip is SHORTER than the requested window,
not merely cut at it. That gap is unexplained and may be a second bug (trailing
silence trimmed? vocoder rounding?). Measure before assuming the window is the
whole story.

## Measure it properly

`docs/models/` conventions apply, and the audio-measurement traps are recorded in
memory `tool_measure_generated_audio`: **`ebur128` integrated LUFS reports the −70
silence floor on anything under ~10 s**, so use `volumedetect`; ffmpeg writes
analysis to **stderr on success**; and `-v error` suppresses `volumedetect`
outright. There is no ffmpeg on PATH — use the engine's.

## Done when

- A 3-second request returns a complete sentence, or the UI makes clear it cannot.
- The requested-vs-delivered gap is explained.
- `docs/playbooks/add-flow/existing-flows/drama-box.md` § "The duration slider is
  the single biggest quality control" reflects whatever lands — it currently
  documents the raw-duration behaviour as purely a win.

## Ownership

`js/data/flowsRegistry.js` (drama-box `Input_Duration` only) and
`docs/playbooks/add-flow/existing-flows/drama-box.md`. A graph change means
Fabio's re-export — `comfy_workflows/raw/` is his and the sync script refuses to
write there.
