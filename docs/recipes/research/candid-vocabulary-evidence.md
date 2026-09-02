# Candid register — vocabulary evidence from real prompts

First **evidence-based** (as opposed to documentation-based) recipe research.
Pulled 2026-07-28 via `npm run corpus` from Civitai image pages. Feeds
[MPI-19](../../.agents/mpi-kanban/tasks/MPI-19/brief.md)'s style axis.

**Corpus:** 147 prompts from Chroma (86), Krea2-SAT-DirtyRealism (45) and
Krea 2 IntoRealism (16). `--nsfw Soft`, `sort=Most Reactions`.

## Headline: the guessed vocabulary was wrong

MPI-19's brief proposed a candid vocabulary from first principles. Checked
against real prompts, **most of it does not exist**:

| Proposed in the brief | Occurrences in 147 prompts |
|---|---|
| `off-centre` / `off center` | **0** |
| `dutch angle` | **0** |
| `unposed` | **0** |
| `mid-action` | **0** |
| `looking away` | **0** |
| `on-camera flash` / `direct flash` / `harsh flash` | **0** |
| `cut off` | **0** |
| `poorly lit` / `washed out` / `harsh shadow` | **0** |
| `disposable camera` / `point and shoot` | **0** |

This is exactly the failure the corpus was meant to catch. Authoring three
vocabulary sets from intuition would have shipped a candid style built on
terms nobody uses.

**Also zero: `taken on a phone`** — the specific Chroma trigger Fabio cited.
Absence here is NOT disproof; he has observed it working, and this sample is
"Most Reactions / Soft" which may simply not be where those users are. Flagged
as unresolved, not refuted.

## What candid prompts actually say

A second, larger pull (5 model versions, ~1,012 scanned, 708 with prompts)
brought the total to **250 unique prompts**. Raw lift on that set was
**contaminated** — `warmers`, `calves`, `zebra`, `shibuya`, `thighhighs`,
`stiletto` all scored 15×+, and were one user's near-duplicate prompt series
dominating a small bucket. After collapsing near-duplicates (>65% shared rare
words): **209 prompts, 27 candid.**

The table below is the deduplicated result, and every term in it also appeared
in the independent first pull:

| Term | n | candid % | rest % | lift |
|---|---|---|---|---|
| `candid` | 21 | 78 | 0 | 40× |
| `amateur` | 9 | 33 | 0 | 18× |
| `snapshot` | 9 | 33 | 0 | 18× |
| `spontaneous` | 6 | 22 | 0 | 12× |
| `authentic` | 8 | 30 | 1 | 10× |
| `smartphone` | 5 | 19 | 0 | 10× |
| `casual` | 11 | 41 | 3 | 9× |
| `unpolished` | 4 | 15 | 0 | 8.4× |
| `selfie` | 4 | 15 | 0 | 8.4× |
| `imperfect` | 5 | 19 | 1 | 8× |
| `everyday` | 4 | 15 | 1 | 6.6× |
| `canon` (brand, named) | 4 | 15 | 1 | 5.4× |
| `moment` (as "in the moment") | 6 | 22 | 3 | 5.1× |
| `taken` (as "taken on/with") | 5 | 19 | 3 | 4.3× |
| `camera` | 15 | 56 | 11 | 4.4× |

Artifact words, whole-corpus frequency: `grain` 22%, `tilted` 10%, `cropped` 3%,
`motion blur` 2%, `overexposure` 2%, `out of focus` 1%.

**Terms that did NOT survive dedup** (they were the duplicate cluster):
`instagram`, `social`, `autofocus`, `bitrate`. Do not use them.

### Candid prompts are NOT shorter

Deduplicated averages: **candid 132 words, everything else 136.** Statistically
indistinguishable. This settles a disagreement from the MPI-19 brainstorm — the
agent proposed candid should get a *lower* word budget; Fabio pushed back that
the register should be equally directed, only inverted. **The evidence supports
Fabio.** A candid prompt spends the same words, on different things.

### The shape this implies

Real candid prompts work through **four moves**, none of which is the
cinematography-inverted prose the brief imagined:

1. **Declare the register outright** — `candid`, `amateur`, `snapshot`,
   `casual`, `spontaneous`. Blunt and literal; the words carry the weight.
2. **Grant permission in the abstract** — `authentic`, `imperfect`,
   `unpolished`, `uneven`, `real`. This is the brief's "permission to be ugly",
   and it is *abstract* — never a described defect.
3. **Name specific capture artifacts** — `grain`, `overexposure`, `tilted`,
   `motion blur`, `cropped`. Short technical nouns, not descriptions.
4. **Name the device** — `smartphone`, `selfie`, `canon`. Naming a real camera
   does more than describing a lens.

Plus an **ordinariness** cluster (`everyday`, `moment`, home/cozy/sitting) —
candid is signalled partly by mundane subject matter, not only by technique.

The pattern to carry into the recipe: candid is expressed in **short declarative
labels and abstract permissions**, not in the described-imperfection prose the
brief imagined ("the horizon is tilted six degrees and her elbow is cut off").
Nobody writes that. They write "candid amateur snapshot, authentic, imperfect".

## Second pass, 2026-07-28 — the CINEMATIC vocabulary was invented too

Re-run locally over the same 209 deduplicated prompts (no VPN needed — the
corpus is already on disk; `scratchpad/vocab-disputed.js`). The brief's
cinematic column turns out to be exactly as fictional as its candid one:

| Proposed cinematic term | n / 209 |
|---|---|
| `anamorphic` | 2 |
| `chromatic aberration` | 1 |
| `rule of thirds` | 1 |
| `volumetric` | 1 |
| `god rays` | **0** |
| `teal and orange` | **0** |
| `leading lines` | **0** |

What the community actually writes for that register (share of candid prompts /
share of the rest):

| Term | candid % | rest % |
|---|---|---|
| `cinematic` | 30 | 39 |
| `dramatic` | 7 | 26 |
| `silhouette` | 11 | 18 |
| `moody` | 11 | 15 |
| `atmospheric` | **0** | 10 |
| `high contrast` | **0** | 8 |
| `epic` | **0** | 4 |
| `rim light` | **0** | 3 |
| `chiaroscuro` | **0** | 2 |
| `golden hour` | **0** | 1 |

So the failure mode is not "candid is hard to research" — it is **guessing**.
Both guessed sets missed. Evidence research is not a candid-specific step.

### Splitting by register also corrects the artifact list above

The artifact frequencies in the table further up are *whole-corpus*, which hides
the thing that matters. Split candid vs rest, most of them are not candid
markers at all:

| Term | candid % | rest % | verdict |
|---|---|---|---|
| `grain` | 26 | 40 | universal — **not** a candid marker |
| `film grain` | 26 | 19 | universal |
| `depth of field` | 22 | 13 | universal |
| `motion blur` | 19 | 7 | weak |
| `tilted` | 4 | 7 | **not** candid |
| `cropped` | 0 | 2 | **not** candid |
| `harsh` | 0 | 7 | **not** candid |
| `overexposed` | 11 | 1 | keep |
| `lo-fi` | 19 | 1 | keep |
| `casual` | 52 | 6 | keep — the strongest after `candid` |

`washed out` looked like an 11% candid hit until the matches were read: they are
`washed black denim`. Prefix matching without reading the context manufactures
evidence — check the surrounding phrase before believing a count.

This distinction is load-bearing for the recipe. A term shared by both registers
cannot go in the banned list, or honest output fails the check; and the recipe
*requires* every prompt to name a shot type, so `wide shot` / `low angle` /
`close-up` can never be banned from candid either. That is MPI-16's bug class
(a conditional `dont` colliding with an unconditional required element).

**Where the three sets ended up:** `js/data/recipes/krea-2.recipe.js`,
`styleVocabulary`. Every term there traces to a row above.

## Two findings beyond the candid question

**1. Real Krea 2 prompts are far longer than our budget allows.**
Corpus averages: DirtyRealism **186 words**, IntoRealism **195 words**. Krea 2's
recipe currently targets ~90 with a 150 hard ceiling — a number
`research.md` Q1 flags as *"our own test-design number, not a model
constraint"*. The community writes roughly **2× longer**. Worth re-opening
before the style work locks the budget in. (Caveat: realism finetunes may
over-specify relative to base Krea 2.)

**2. Chroma's community solves photorealism with a LoRA, not with words.**
`<lora:chroma_profphotos…>` appears in 31 of 86 Chroma prompts (36%). We cannot
ship a LoRA, so any photoreal register we build has to close that gap with
vocabulary alone — a structural disadvantage worth knowing before judging our
own output against community examples.

## Caveats

- **16 candid prompts is a small sample.** Treat the lift table as direction,
  not settled fact. A larger targeted pull was queued the same session.
- These are checkpoint/LoRA-culture prompts (tag syntax, weights). Krea 2's
  Qwen3-VL encoder wants prose, so this is mined for **which nouns and phrases
  recur**, never for syntax to copy. Official-source syntax research stands.
- `sort=Most Reactions` selects for popular, which skews toward polished work —
  probably *under*-counting candid.

## Reproduce

```
npm run corpus -- --model 3169321 --match "candid,snapshot,amateur" --limit 400 --nsfw Soft
```

Needs Fabio's VPN (Civitai geo-blocks the UK) and `CIVITAI_TOKEN`. See
`scripts/prompt-corpus.ts`.
