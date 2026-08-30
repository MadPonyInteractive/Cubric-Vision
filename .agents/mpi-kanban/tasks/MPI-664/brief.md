# MPI-664 — Flow: MiniMax Music 3 (text-to-music)

Wire MiniMax Music 3 as a Flow: the user describes a song, gets a song. Verified working locally
on the bench (127.0.0.1:8188) at fp16 — the user has generated tracks and is happy with the sound.

**This card is `needs-decision`, not `planned`.** The model half is settled. The open question is
the *interface*: how a Flow turns a few user-facing controls into the 3-block structured caption
the model actually wants.

## The decision to make

MiniMax Music 3 takes two text inputs — a **Caption** (three labelled blocks: Global Metadata /
Vocal Details / Arrangement) and **Lyrics** (with section tags). The stock ComfyUI template caption
is a dense ~200-word paragraph. That is not something to hand a beginner, and Flows are the
beginner surface.

The user wants dropdowns:

- music style
- has vocals / no vocals
- instrumental or not

...whose values feed the caption. Three candidate approaches, unresolved:

| | Approach | Shape |
|---|---|---|
| **a** | Pure template | Dropdown values interpolate into a fixed 3-block skeleton. Deterministic, offline, no new dependency. Ceiling: only as good as the phrasebook, and the model rewards prose, not slot-filling. |
| **b** | Pure LLM | A rewriter turning a one-line brief into a full caption — exactly what MiniMax's own `music-caption-rewriter` skill does. Best output, but needs an answer to *where an LLM runs in Vision*. |
| **c** | Hybrid | Templated skeleton from the dropdowns, LLM enriches into prose. Degrades to (a) when no LLM is reachable. |

**The blocking sub-question for (b) and (c): where would an LLM even run?** Vision ships no LLM
today, and prompt-gen deliberately lives in the sibling app (Cubric Prompt). Answering that is
probably the real decision; the caption format follows from it.

## Prior art worth copying

MiniMax ship an agent skill that does exactly the (b) job — genre router over 18 style families,
picks up to three references with roles Foundation / Modifier / Arrangement, emits the 3-block
caption. Read it before designing anything:

```bash
npx skills add MiniMax-AI/MiniMax-Music3 --skill music-caption-rewriter
```

## Full research

`research/minimax-music-3.md` — model facts, what it can and cannot do, quantisation leads, and
every source. **Read it before re-searching anything; it was all verified 2026-08-30.**

Sibling card: **MPI-663** (Stems flow). Generate here, stem there.
