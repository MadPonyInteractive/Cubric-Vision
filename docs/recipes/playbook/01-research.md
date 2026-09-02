# 1 — Research

**Input:** target model name + version. **Output:**
`docs/recipes/research/{model-id}/sources.md` + `research.md`.

Two sources of truth, in this order. **Web search always runs** — it is what
makes this phase autonomous and what catches a model that changed since anyone
last looked. NotebookLM reinforces it when Fabio has curated a notebook.

---

## 1.1 Web search (always, first)

Search for the target model's actual prompting practice. Aim for **3–6 sources**
that survive the hierarchy below. Useful query shapes:

```
"<model> <version>" prompt guide
"<model>" prompting best practices site:docs.<provider>.com
"<model>" prompt structure OR "prompt format" OR "token limit"
"<model>" vs <sibling model> prompt comparison
```

Prioritise, and record which tier each source is:

1. **Official documentation** — the provider's own prompt guide, API docs, or
   release notes describing prompting behaviour.
2. **Official examples / showcases** — published example prompts from the
   provider or its featured creators.
3. **High-signal community research** — deep-dives with side-by-side
   comparisons (r/StableDiffusion, r/aivideo, model-specific subreddits),
   GitHub issues where a prompting quirk is reported *and resolved*.
4. **Competitor / tool comparisons** — benchmarks that expose failure modes.

Reject: SEO "100 best prompts" listicles with no attribution, posts that
restate provider docs without testing, anything older than ~6 months for a
fast-moving model.

**Already have notes on this model** (e.g. `dev-docs/enhancer_prompts.md`)?
Still search. The job then is to **confirm or contradict**: for each existing
claim, either find a current source that backs it or mark it stale in
`research.md`. An unverified inherited claim is not evidence.

## 1.2 NotebookLM (reinforcement, when a notebook exists)

NotebookLM grounds answers in Fabio's curated sources, so it does not
hallucinate model-specific behaviour. **Fabio curates** the per-model notebook;
**the agent queries** it via the CLI:

```bash
notebooklm list --json                                 # find the notebook id
notebooklm source list -n <notebook-id> --json         # record provenance
notebooklm ask -n <notebook-id> "<question>" --json    # cited answer
```

Always pass `-n <id>`. **Never `notebooklm use`** — it writes shared context
(`~/.notebooklm/context.json`) that races when recipes are authored in parallel.
On a Windows `charmap`/`UnicodeEncodeError`, add `--json`.

**No notebook for this model is not a blocker.** Proceed on web search alone and
note the absence in `research.md`. (Before 2026-07, a missing notebook stopped
the phase; it no longer does — that gate is what made recipe authoring need a
human before it could start.)

---

## 1.3 The questions to answer

Ask these of the web sources, and of the notebook when there is one. Record each
answer **with the source it came from**.

1. **Output format** — prose paragraph, keyword list, structured tags,
   timeline? Typical word/token length, and is there a hard limit?
2. **Structure order** — what sequence of elements do the sources recommend?
   List the exact order.
3. **Vocabulary** — what terms does this model respond to, for camera, motion,
   lighting, style? Concrete words, not categories.
4. **Failure modes** — the most common mistakes; do's and don'ts.
5. **Negatives** — does it support or benefit from a negative prompt? What
   belongs there vs. in the main prompt?
6. **What is unique** — what does this model do unusually well or badly
   compared to a generic model?
7. **Examples** — 2–3 complete example prompts from the sources, verbatim, for
   simple scenes.

Follow up when sources are rich: t2v vs i2v differences, token-ordering
effects, resolution/aspect/duration constraints that change how you write.

**Question 1 is the one that must produce a number.** The word budget in
[02-draft.md](02-draft.md) is machine-checked, so "fairly short" is not an
answer — resolve it to a range. If no source states one, derive it from the
example prompts in question 7 and say so.

---

## 1.4 Measure it against real prompts — documentation is not evidence

Everything above is **reading**. Reading tells you what a provider recommends;
it does not tell you what people actually write, and for anything vocabulary-
shaped that gap is total.

**Measured, MPI-19, 2026-07-28.** Two vocabulary sets were authored from
documentation and intuition, then checked against **209 deduplicated real
prompts**. Both measured at ~zero — including the one nobody thought needed
checking:

| Guessed term | Hits in 209 real prompts |
|---|---|
| `anamorphic` | 2 |
| `chromatic aberration`, `rule of thirds` | 1 each |
| `god rays`, `teal and orange`, `leading lines` | 0 |
| `off-centre`, `dutch angle`, `unposed`, `mid-action` | ~0 |

The lesson is **not** "that one register was hard to research". It is that
**guessing misses**, and it misses just as badly on the vocabulary everyone
believes they already know. Documentation-only research is what let both sets
through.

**So: whenever a finding is a list of words, measure it.**

- A prompt corpus lives at `docs/recipes/research/_corpus/` (gitignored). The
  analysis is plain Node over local JSON — no network, no VPN, no Civitai.
  **Pulling a *new* corpus is the opposite:** `npm run corpus` hits Civitai, which
  region-blocks the UK, so it needs Fabio's VPN — ask, wait, run, then tell him.
  The VPN also skews the clock ~14h, so every date you write while it's on is
  wrong. Read `CLAUDE.md` → "VPN + the skewed clock" before asking.
- **Split the corpus before you count.** A whole-corpus frequency hides the
  split that matters: `grain`, `film grain` and `depth of field` all look like
  markers of one register until the corpus is separated, at which point they are
  simply universal.
- **Match whole words.** `washed out` scored 11% and turned out to be *"washed
  black denim"*.
- Record the measured split per term you keep, **and what you excluded as
  non-discriminating and why** — the exclusions are the part a later author will
  otherwise re-add.

Worked example: `docs/recipes/research/candid-vocabulary-evidence.md`.
Where the measured vocabulary lands: [06-registers.md](06-registers.md) §6.5.

---

## 1.5 Provenance contract

Before a recipe may rely on a finding, `sources.md` must state:

- **Model version researched** — exact ("Krea 2", not "Krea").
- **Research date** — when the sources were accessed.
- **3–6 sources**, each with authority tier + access date + URL.
- **Claim-to-source notes** — which source each finding came from, so conflicts
  are visible and resolvable in the draft phase.

Community findings **supplement** official ones; they do not override them. When
two sources disagree, record both — the draft takes the more restrictive
constraint and [03-test-loop.md](03-test-loop.md) settles it empirically.
