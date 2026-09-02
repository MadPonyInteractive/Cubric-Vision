# 7 — When a rule will not hold (troubleshooting reference)

Not a pipeline step. This is what you read when a Stage 1 tier keeps failing and
the obvious fix has already failed twice — reached from
[03-test-loop.md](03-test-loop.md) §3.4.

**One ladder runs through all of it: reframe the operation before you strengthen
the constraint.** Every section below is that same ladder against a different
kind of constraint. Each is measured, not theorised.

---

## 7.1 A NUMERIC constraint will not hold

Krea 2's condense tier failed **every run of 13 iterations**. Five rewordings of
the word cap moved the mean by 7 words. What eventually worked was not a sixth
rewording. Work this ladder in order:

1. **Is the model in the wrong mode?** "Shorten this input" puts it in *editing*
   mode, where it walks the source clause by clause and anchors to the source's
   length. Reframing the operation — *do not shorten it; extract what matters,
   set the input aside, and write a fresh prompt from those notes* — moved the
   mean from 146 to 128 words on its own. Attack the operation before the number.
2. **Is the constraint in a unit the model can perceive?** A model cannot count
   words; that is tokenizer arithmetic it has no access to. It *can* notice
   finishing a sentence. Krea 2's output was a dead-constant ~22 words per
   sentence — only the sentence *count* varied. Switching the budget handle from
   words to sentences, and hoisting it into the top-level override block,
   produced the tightest run in the whole history (113/117/116).
3. **Only then, question the number** — and check whether the sources actually
   support it. Krea 2's 130-word cap turned out to be a test-design number with
   *no* source behind it, and it was ~15 words tighter than the model could hold
   while covering the recipe's own required elements.

### Rung 2, corollary: count the unit against the structure it serves

A unit can be perceivable and still be the **wrong size**. `ltx-2.3` failed
`bare` at 108 words against a 110 floor with a faultless six-sentence output —
the classic "lower the floor by two" case. Its `structureOrder` has **seven**
entries (six framework elements plus `Guardrails (inline)`) and the systemPrompt
asked for **six** sentences, so the guardrail element had nowhere to live and was
absent from every output. It had been surfacing as an appended
`**Guardrails:**` markdown block instead — §7.2c's heading-becomes-a-label bug
was the same off-by-one seen from the other side.

Moving to seven sentences took `bare` from 108–134 to 120–150 (floor margin 2 →
10), made the missing element appear in every run, and **the floor was never
touched**. Before adjusting a bound, check that the countable unit and the
required-element list agree on how many things there are.

**Order matters.** Loosening the constraint first would have turned the tier
green immediately and hidden four real defects found only because it was held.
But once mechanism is genuinely exhausted and no source backs the number,
holding it is not rigour — it is the wrong number. Record the reasoning either
way; that decision must be auditable.

**Second instance, `flux-2` (2026-08-05).** The same off-by-one, arrived at from
the opposite direction: five `structureOrder` elements against a four-sentence
cap. Every failing run wrote **five** sentences — the model obeyed the structure
and broke the count, which is the tell. Aligning the unit to five (plus "give
each element ONE detail, never a list of three" on the condense path) took
`overlong` from 119 words to 89/80/91 with the bound untouched. Two recipes now,
so treat "do the countable unit and the required-element list agree?" as the
**first** thing to check on any length failure, before reading a single output
for content.

### Then: how to tell when the number really is wrong

`flux-2` is also the worked example of the *other* half. After the unit was
fixed the tier still failed at 2/3 — and the temptation is to read one failing
run as noise. It is not; it is a **distribution**. Six condense runs measured
**89, 80, 91, 64, 105, 99** against a 100 ceiling: centred at ~90 and clipping
about one run in three. A tier sitting at 2/3 is not a tier that nearly passes,
it is a tier **passing on luck**, and a single lucky sweep would have recorded it
green.

So the discipline is: **collect the numbers across runs before touching a bound,
then justify the new one from a source, not from the failure.** `flux-2` moved
100 → 120 because the sources genuinely conflict (BFL `[klein]` 40–70, deAPI
40–120, earngenix <150 for the 4B), the draft had taken the most restrictive per
[02-draft.md](02-draft.md) §2.5 precisely so the loop could settle it, and 120
still sits inside a model-specific source. The *stated* ceiling in the
systemPrompt stayed at 75 — loosening the contract is not the same act as
loosening the instruction, and the aim-low gap is what keeps the model anchored
low. Widen one, never both.

## 7.2 A PROHIBITION will not hold — the same ladder

§7.1 is not about numbers. It is about **reframing the operation before reaching
for a stronger constraint**, and a banned word is a constraint like any other.
Two forms of the same failure, both measured on Krea 2's candid register
(MPI-19).

### A growing ban list means the operation is framed wrong

Banning `balanced` produced `centered` on the very next run. Whack-a-mole on
adjectives is §7.1 one rung down. The fix is never a longer list — it is giving
the model the sentence to write instead:

| Prohibition that failed | Positive instruction that worked |
|---|---|
| "never judge the framing as balanced / centred / composed" | **"say where the phone was and how it was held"** — arm's length, from across the table, from the doorway |
| "never describe the palette as a whole" | **"name two or three actual colours you can see"** — the turquoise water, white lounge chairs, a red towel |

The tier went 2/3 → 3/3, and the prose changed visibly. Both instructions also
happen to *supply* a required element (composition, colour), which is why they
beat a ban: **a ban leaves the slot empty and the model refills it its own way.**

### Never illustrate a prohibition with the sentence you are prohibiting

The directive banned a closing thesis and helpfully gave the example *"every
detail feels intentional"*. All three failing runs then wrote:

- "Every detail feels unpolished but intentional in this everyday moment."
- "…this authentic moment feels like a perfect slice of a summer afternoon."
- "Every detail feels authentic to an everyday summer afternoon."

**The ban was producing the behaviour.** A negative example of a *sentence
pattern* seeds that pattern — the model had `every detail feels ___` sitting in
its context and filled the blank. Reframed to *"end on a thing, not a thought:
your final sentence must describe something physically present in the frame"*,
**with the examples deleted**: 1/3 → 5/5.

If a rule must name the bad pattern, name its **shape** ("a closing line about
what the scene means"), never a usable instance of it.

## 7.2b Three more forms of the same ladder (MPI-25)

Measured across the v1.0 sweep, on `wan-2.2` and `sdxl`. All three are the §7.1
ladder again: **the operation was framed wrong, and adding constraint text made
it worse.**

### A job-scoped instruction bleeds into the other jobs

`wan-2.2`'s `bare` tier was undershooting, so a density floor —
*"each of your six sentences must name at least TWO concrete specifics"* — was
written **inside the sparse bullet only**. It fixed `bare` (73–89) and pushed
the *condense* tier from a 137 ceiling to **exactly 150**. Scoping an
instruction to one job does not keep it there.

Excluding it from the condense job then broke `directed` (50 words). Four
iterations, the failure moving each time. What actually worked was **deleting
all three per-job length rules** and leaving one unconditional rule governing
every job — the only change in the whole history that fixed two tiers at once.

**A growing set of per-job nudges is §7.2's growing ban list wearing a
different hat.** When the same failure keeps reappearing in a different tier,
stop patching and delete.

### An instruction to COUNT invites the model to show its counting

`sdxl`'s length rule said *"Count them as you go: nine entries, in that
order."* On the garbled `directed` input it produced a valid prompt, then:

- *"Wait, let me refine the slot structure based on your specific input…"*
- *"\*Self-correction based on the 10-slot rule:\*"* followed by all nine slots
  enumerated as commentary

460 words. `wan-2.2`'s equivalent — *"stop at the sixth full stop"* — never did
this in ~200 runs. **A stopping rule is safe; a counting rule is an invitation
to think out loud.** Phrase the countable unit as a place to stop, never as an
act of counting.

Two corollaries, both measured:

- **Never leave two different counts in one prompt.** `sdxl` briefly said "ten
  to fifteen slots" in its override block while the structure section said
  "slots 1 to 9". Output swung 21–76 words. With a single consistent count it
  collapsed to 34–40.
- **"No explanations *around* the output" is not enough** — the model complied
  literally and put its reasoning *between* the two blocks. Say: write it once,
  nothing before, between or after.

### A standing permission licenses the model out of the work

`sdxl` carried *"Not every slot is mandatory. Minimum reliable set: style +
subject + framing. Omit empty slots rather than padding them."* On a one-word
input the model took the minimum and stopped: **21 words**.

This is MPI-16's collision class in a third form. The first two were a
conditional rule versus a required element, and two conditional rules versus
each other. This one is a **permission** that silently outranks the expand job.
The fix is the §7.2 shape — say which slots are required and that filling them
from a sparse input *is* the job, rather than granting an escape hatch:

| Permission that failed | Positive instruction that worked |
|---|---|
| "Not every slot is mandatory… omit empty slots rather than padding them" | **"Every required element above is answered in a finished prompt — that sequence IS the prompt, and filling them from a sparse input is the expand job, not padding."** |

Audit every recipe for the word *optional*.

> That replacement originally read "**Slots 1 to 9** are all filled…". The
> numerals were removed later the same day — see §7.2c, where they turned out to
> be leaking into the output.

### The cheapest lesson of all: measure the budget, don't read it

`chroma` went Stage 1 green in **one** iteration; `wan-2.2` took **seven**. The
difference was not the model or the prompt — it was where the numbers came
from. Chroma's bounds were measured from 86 real prompts and therefore already
sat where output lands. Wan's came from a research doc's stated range, so every
iteration was spent fitting the model to a claim.

And when a number resists that hard, **check who set it and how they knew**
before spending more iterations (§7.1 rung 3). Wan's floor was a community
guide's assertion that prompts under 60 words hallucinate. Fabio, who ships
renders on that model, said basic prompts work fine. Seven iterations defended
a number the one person with first-hand knowledge did not believe.

## 7.2c The recipe's own scaffolding leaks into the prompt (MPI-25)

§7.2b established that a *counting instruction* invites the model to narrate its
counting. Two more forms turned up on the confirmation sweeps, and they
generalise it: **any part of the systemPrompt that describes the output's shape
can be emitted as part of the output.** The model cannot always tell your
scaffolding from your format.

### The numerals of a countable unit reach the prompt text

`sdxl` kept its nine-element unit but referred to it by number — *"one for each
of the numbered elements 1 to 9 below"*, restated as *"Slots 1 to 9 are all
filled"*. A `bare` run then emitted:

```
POSITIVE PROMPT: animal photography, cat, orange fur, green eyes, curious.
5. close up, 6. sun-dappled garden, 7. golden hour lighting, 8. eye level, 9. Sony A7 III
```

Literal list markers SDXL would tokenise. It passed **every** deterministic
check and the judge scored it a pass.

Keep the count — it is the countable unit that holds the budget — and **drop the
numerals from the instructions**. The reference list below may stay numbered
(that is what holds element order, [03](03-test-loop.md) §3.4); what leaks is
referring to the slots *by number* in the rules, plus the absence of a positive
statement of the output's shape. Adding one ("each block is a SINGLE line of
comma-separated phrases") makes `5. close up` structurally wrong without naming
it. Measured side effect: the sparse tiers moved from 32–39 words to 35–45 —
the numbering had been eating budget.

### A section HEADING becomes an output label

`ltx-2.3`'s guardrails section was headed:

> Guardrails (append at end of prose, positive direction):

In 2 of 15 runs the model appended exactly that — `**Guardrails:** smooth gimbal
stabilization, …` — as a markdown block, breaking the recipe's own no-markdown
rule. **A heading that describes an output *position* gets emitted as an output
*label*.** State such content as part of the prose instead, and close with a
stopping rule naming both bounds ("starts with X, ends at the end of Y") rather
than a list of formats to avoid.

The same replacement took `sdxl`'s `medium` tier 2/3 → 5/5, where the closing
rule had been an enumerated ban — *"never list or number the slots as
commentary… never write words like 'wait', 'actually'"* — and the model listed
and numbered the slots. §7.2's seeding rule applies to output *formats*, not
just sentence patterns.

### The corollary: a green sweep is not a read output

Both defects above, plus `ltx-2.3` copying the garbled `Thufpik` token straight
into a prompt, occurred in sweeps that reported **ALL PASS** with the judge
scoring 2/2/2. The deterministic checks are a floor, not a verdict.

Two habits fall out of it, and they cost minutes:

- **Read the actual outputs of a green sweep before recording it green.** All
  three defects were visible on sight and invisible to the exit code.
- **When you find one, ask whether a cheap check can catch the class**, the way
  `no reasoning` and `no list markers` now do. Verify the new regex against real
  outputs from the session — `LIST_MARKER` had to survive `unrealistic
  dream:1.4`, `f/2.8` and `bad hands 5` before it was worth having.

Worth knowing which way each recipe fails the `directed` tier: `sdxl` **drops**
the garbled skin-texture request, `ltx-2.3` **copies it through verbatim**. Same
tier, same judge, opposite failures, both scored 2/2/2. The judge does not
police that axis at all.

## 7.2d An UNDEFINED slot invents its own content (MPI-26)

§7.2b showed a *permission* letting the model out of the work. MiniMax-H3 showed
the mirror image: a required slot with **no definition of what belongs in it**.
The model always fills it — with whatever it can justify.

- The `TRANSITION:` slot said only "one transition between the two cuts". It
  came back as **dissolves** — which the same output's constraint line then
  forbade, a self-contradiction inside four lines — and once as a camera move.
- The constraint line was described as "…whatever this scene actually needs kept
  out". It came back as **`No tail flicking`, in a run whose own Shot 3 read
  "Its tail twitches"**. Both official templates only ever constrain *rendering*
  (text, logos, watermarks, cartoon look, dissolves); saying so fixed it.

Both are §7.2's shape again — **say what the slot is FOR** rather than trusting
the name to carry it. A ban leaves the slot empty and the model refills it; a
vague permission leaves it undefined and the model invents. The test: read the
slot's rule alone and ask whether it says what a *correct* answer looks like.

### A fixed shape with no home for a choice drops that choice

H3's `directed` tier passed 3/3 while dropping **"anamorphic lens"** and the
**"eye skin detail, pores"** request from every run. The jobs block already said
every choice the user made must survive — so this was **not** a wording problem.
The eight-line output shape had no line that invites a lens or a surface
texture, and what has no home evaporates. One rule naming the opening line as
their home fixed it, keeping both in 3/3.

Before strengthening "do not drop things", check that a slot exists to drop them
*into*. Same failure from the other side as §7.1's rung-2 corollary.

### The `donts` array never reaches the model

Worth knowing before writing a rule into the wrong field.
`composeSystemPrompt()` passes **only** `systemPrompt` to the enhancer LLM;
`dos` and `donts` are assembled into the **judge's** prompt as "Must do" /
"Must never". A rule that lives only in `donts` is *graded*, never *instructed*.

H3 emitted `Camera:` / `Audio:` / `Constraints:` labels in 3 of 3 runs while its
`donts` said "do not head the look, camera, audio or constraint lines" — and the
judge, holding that exact rule, passed all three at format 2/2. If a rule must
change the output, it belongs in `systemPrompt`.

## 7.2e The prompt's own SHAPE is imitated (MPI-25)

§7.2c is about scaffolding *leaking* — text you wrote about the output appearing
in the output. This is a different mechanism and it is easier to miss, because
nothing of yours appears anywhere: **the model imitates the shape of the prompt
it just read, and the strongest signal is the part it read last.**

Check this BEFORE reframing a rule a fourth time. Two forms, both measured on
`pony`, both invisible until you look at the systemPrompt as an artifact rather
than as a set of instructions.

### The final characters of the systemPrompt set the first of the output

`pony` welded a full stop onto its last tag — 5 of 12 runs, then 3 of 3 on the
`directed` tier. Four reframes were spent on it: a defined closing slot, a
positive statement of the ending, a character-level spec ("every character is a
tag or the comma-space joining two"), a clause about prose habits in the
condense job. Each moved the rate; none closed it.

The systemPrompt ended `…emit only the final line.` — a sentence, closed with a
full stop, immediately before the model began writing. Ending it instead on a
bare, unterminated tag line took the failing tier from 2/3 twice running to 3/3
and held across two full sweeps.

**A tag-format recipe whose systemPrompt ends in prose is teaching its model to
end in prose.** The instruction and the demonstration were contradicting each
other, and the demonstration won.

### A trailing exemplar is copied for its LENGTH, not only its shape

The fix above introduced the next defect within one sweep. The exemplar ending
the prompt was **three tags long**, and `bare` outputs promptly fell from ~33
words to 20–24, failing `wordBudget.min`. Replacing it with a full 22-tag line
restored 31–34 and closed both at once.

So: end on a **whole output**, not a fragment — and pick a subject **no test
tier uses** (`pony` used a schoolgirl scene against cat / man-by-a-fireplace /
cowboy / samurai tiers), or the exemplar stops testing the recipe and starts
answering for it.

### A rule that LISTS CATEGORIES only holds for the ones an exemplar shows

Measured on `minimax-h3` r2v, 2026-08-17. The strongest form of §7.2e so far,
because the rule was already correct, already specific, and already naming the
thing it wanted.

`KEEP_TECHNICAL` has said the same sentence since it was written: *"Any lens,
film stock, camera body, shot size or surface texture the user named belongs in
the opening line beside the look."* Five categories, named explicitly, with three
worked phrases after them. The `directed` tier's input names five of them at
once — `anamorphic lens`, `low-angle shot`, `close-up shot`, `eye skin detail,
pores`, `taken on a cinema camera`. Across one clean sweep:

| Category | Demonstrated in an exemplar? | Survived into the output |
|---|---|---|
| lens (`anamorphic`) | **yes** — an exemplar look line carried `shot on a 135mm lens` | **3 of 3** |
| shot size (`close-up`) | no | 1 of 3 |
| camera body (`cinema camera`) | no | **0 of 3** |

**Every one of those runs PASSED, judge 2/2/2.** The instruction and the outcome
had no relationship; what predicted survival was whether an exemplar happened to
contain that category. The rule listing a category is not the same as the prompt
demonstrating one.

**The fix is a demonstration, never a stronger sentence.** Put the missing
categories into the exemplars' own text. And put them in at **different values
across exemplars** — a wide shot on 135mm in one, a medium shot on 50mm taken on
a cinema camera in the other — for exactly the reason two different-length shot
lists guard the count: a single demonstrated value installs a fixed one.

**The check this implies, and it is cheap:** for every category a rule lists,
grep your own exemplars for an instance. A category with none is not being
taught, whatever the prose says. This is the same audit as *"read the rendered
prompt, not the diff"*, applied to the exemplars instead of the rules.

**Why it matters beyond this recipe:** a categorical rule is the most natural way
to write a requirement and it reads as complete. Nothing in the prose flags which
half of it is inert, the judge cannot see the difference, and a deterministic ban
cannot express "the user said X and the output lost it" without knowing X. So
this class is invisible to every check in the harness — it surfaces only by
reading an output against its input.

#### The refinement, measured on the fix itself

The fix put a shot size into **both** exemplars and a camera body into **only the
non-tail one**. Re-measured on the next sweep:

| Category | Where demonstrated | Before | After |
|---|---|---|---|
| shot size | both exemplars, incl. the tail | 1/3 | **3/3** |
| camera body | the non-tail exemplar only | 0/3 | **0/3** |

**One demonstration in the non-tail exemplar moved nothing.** This is §7.2e's
position rule applying *per category* rather than per shape: the trailing
exemplar is what gets copied, so a category that appears only earlier is close to
inert. Demonstration density and position govern each category independently.

**And the different-values guard held.** With a shot size now in both exemplars,
the sparse tiers began supplying one unprompted — correctly, since the recipe
requires every prompt to name one — and the values came back **varied**
(close-up, wide, medium) rather than copying either exemplar's. Two exemplars at
different values teach the *slot*; one exemplar teaches the *value*.

**The camera body was left unfixed deliberately**, and that is the interesting
part. Putting it in the tail too would very likely fix retention and would also
invite the model to invent a camera body on inputs that never named one — which
for a shot size is the required behaviour and for a camera body is a fabricated
technical claim. **Not every category in a categorical rule wants the same
treatment**, so decide per category whether an unprompted fill is the job or a
defect before spending a demonstration on it.


## 7.2f An OPTION LIST collides with its own PROHIBITION (MPI-27)

MPI-16's collision class — a conditional instruction colliding with an
unconditional required element — has a third form, and it is the one that hides
best. Measured on `ltx-2.3`, three sweeps to locate.

The closing-detail rule offered the model three things to spend its last
sentence on, one of which was **"a background element"**. Two clauses later the
same paragraph said **"never add an object, a person or an event to it here"**.
Both lines read correctly in isolation. The model took the option it was
offered, invented a potted fern, and — having nothing real to say about a thing
that did not exist — decorated it: `vibrant green`, which the recipe's
restrained-register rule bans outright.

**The tell was the repetition, and it was ignored twice.** `vibrant green`
appeared in sweeps G, I and J: same tier every time, same **seventh sentence**
every time, same absent-until-now object every time. Two fixes aimed at it
missed, both because they targeted the *words* — the intensifier rode on a
colour word that is itself plain (`green`), and placement was never the issue
(the restrained-language rule sat immediately above the offending block).

- **A phrase recurring verbatim across sweeps is one rule misfiring, not a
  distribution tail.** Same tier + same slot + same shape three times is a
  locator, and it is worth more than any number of plausible fixes aimed at the
  vocabulary.
- **Read a slot's option list against its own prohibitions before reading
  anything else.** An "or" in an instruction is a door; check what the next
  clause forbids walking through.
- **A graded field carrying the same defective phrase makes the sweep lie.**
  `dos` repeated "a background element", and `dos` renders verbatim into the
  judge prompt — so the judge scored those runs **2/2/2** for doing the very
  thing the deterministic check failed them for. Fix the rule and the field it
  grades in one edit; see §7.3's fourth form.

### The repair re-opened the same class one level down

Within the hour. Binding slot 7 to an already-named thing worked, and cost the
`directed` tier ~30 words: the new slot rule offered "the material or texture it
is made of, OR a small movement" — **one** detail — while the unconditional
length rule demanded **two concrete specifics per sentence**. Sentence seven
became nine words long.

**After fixing a slot-level rule, re-read it against the unconditional rules it
sits under.** A narrowed slot silently stops paying its share of an
unconditional quota, and nothing deterministic catches it: the sentence count is
still right, every ban is still clean, only the total moves.


## 7.3 The judge is the thing that will not hold

**A judge failure is a real failure class.** Check every complaint against the
output before changing a rule — roughly *half* of Krea 2's late-stage failures
were fabrications:

- a **117-word** prompt failed as "slightly exceeds the 130-word limit";
- a prompt opening "A close-up shot of a cowboy…" failed for "not front-loading
  the subject";
- an output was failed for resolving the deliberately-garbled term — i.e. for
  doing the intent job **correctly**;
- the judge returned the reply template's placeholder (`"one short sentence"`)
  verbatim as its grade, scoring 0/0/0 on a good prompt.

Acting on those would have "fixed" defects the recipe did not have. Two rules
fall out of it: **give the judge only what a model can decide** (length is
computed exactly by the deterministic layer — never also ask the judge), and
**judge with the strongest model available** ([05](05-model-ladder.md)).

### A third form: a correctly-sized judge given an over-broad lens

Every lens you add needs its carve-out written in. Krea 2's candid lens said
"penalise art direction even if the prompt says candid"; a 12B judge generalised
that into "the candid words are themselves suspect" and failed **all six**
candid runs for *"overusing descriptive language (authentic, unpolished)"* —
while every deterministic check passed underneath, 6–8 vocabulary hits and zero
leaks.

The rule: **any lens that says "penalise X even when the prompt claims not-X"
will be over-applied to the vocabulary that legitimately signals not-X.** Name
what X actually *is* (designed light, deliberate composition, a colour grade,
staging, writerly flourishes) rather than leaving the judge to infer it, and
state outright which words are required and must never be penalised. 0/3 → 2/3
on that change alone. Worked example: [06-registers.md](06-registers.md) §6.6.

### A fourth form: the lens is fine, the CONTRACT handed to it is stale

Before blaming the lens, check what the lens was told. `dos` and `donts` are the
grading contract — `judgePrompt()` renders them verbatim as "Must do" and "Must
never" — so a notation change is not finished until they move with the
`systemPrompt`.

Measured on `minimax-h3` (MPI-27, 2026-08-17). The recipe was rewritten to
MiniMax's cut notation; **i2v's and r2v's `dos` were rewritten with it and
t2v's was not.** Five stale lines still promised the retired `[Xs-Ys]` span and
a single "audio line", while `donts` and two `forbiddenPatterns` banned the span
and the recipe emitted two named sound fields. The judge was handed *must do
spans* and *must never write a span* in the same prompt.

It behaved exactly as instructed, and named both stale lines in its own `why`
strings across three sweeps — *"timestamping is missing"*, *"a cut time is
missing"* (every one on a **single-shot** output, where a timestamp is
forbidden), *"`overall_soundscape` and `non_diegetic_music` are out of order"*,
*"the camera line is awkwardly placed"*.

The comparison is controlled — same judge, same harness, same session, one
variable:

| mode | `dos` | `format=2` | `general` tier |
|---|---|---|---|
| i2v + r2v | rewritten | 29 of 30 | 9/9 |
| **t2v** | **stale** | **11 of 45** | **`format=1` in 9 of 9, never once 2** |

Two things generalise:

- **A stale `dos` is invisible to every other check.** It cannot fail a
  deterministic pattern, and it does not read as a bug in review because every
  line in it was true last week. Only reading the judge's `why` against the
  output surfaces it.
- **It manufactures luck passes.** That tier sat at `format=1` on all nine runs
  and still returned two consecutive `ALL PASS` sweeps before tipping on the
  third. A systematically depressed score that never fails is a tier one judge
  mood from failing — which is the whole reason green means **twice**.

## 7.4 It is the model, not the rule

Only after the above. A small model that cannot follow a rule that three larger
ones follow is a model problem, not a prompt problem —
[05-model-ladder.md](05-model-ladder.md) says when to move up a rung and when
that is just hiding a bad recipe.

And if the same fix fails twice, the constraint itself may be wrong (a budget no
model can hit). **Record that in `notes`** — a documented model limitation is a
legitimate outcome, and a silent loosening is not.
