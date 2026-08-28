# THE ROOT-CAUSE RULE

> Moved out of `CLAUDE.md` 2026-08-28 (token diet). It is still **binding on every fix, every
> agent, no exceptions** — CLAUDE.md routes here, and the Sub-Agent Dispatch step pastes this
> file's § Sub-Agent Briefing.

**Symptom-patching is forbidden.** The path of least resistance — a guard clause, a special
case, a try/catch, a timeout at the crash site — is how this repo's worst regressions were
born. A fix that silences the symptom without touching the cause is a **false done** and will
be rejected.

Before ANY fix:

1. **Diagnose to the actual root.** Trace the failure to its origin — not to the first line
   where a check makes the error disappear. If you cannot explain WHY the bug happens, you
   have not found it yet.
2. **Map what's in place first.** Read the subsystem doc (`docs/README.md` routes it) and
   understand the existing design before changing it. The correct fix usually already has a
   home — a resolver, a store, a queue — that the buggy code bypassed.
3. **Sweep the blast radius.** Touching a shared primitive (resolver / filter / store / util)
   = grep EVERY consumer/call site, classify each, fix all in one pass. Dual-engine code =
   fix BOTH the local AND remote twins. A one-consumer fix on a shared primitive is a false
   done.
4. **Prefer the structural fix — even a section refactor — over a local patch.** If the root
   fix means refactoring a section of the app: STOP and brief the user first (root cause,
   consumers affected, proposed refactor, why a patch would be wrong), then proceed on their
   go. Never quietly ship the band-aid because the refactor felt too big.
5. **Prove it.** Verify at every affected call site, not just the reported symptom. On
   version/dependency bumps that break things: research ALL breaking surfaces first, then fix
   in one coherent pass — never patch one symptom at a time.

Standing lessons behind this rule: `.claude/rules/comfy_engine.md` § Engine Split (the
"half-wire" bugs), memory `feedback_engine_split_sweep_all_consumers`,
`feedback_check_both_engine_paths`, `feedback_research_first_on_version_breaks`.

## Sub-Agent Briefing

Paste verbatim into every sub-agent prompt:

> **ROOT-CAUSE RULE — no exceptions.** Never symptom-patch. A guard clause, special case,
> try/catch or timeout at the crash site that makes the error disappear without touching the
> cause is a FALSE DONE and will be rejected. (1) Trace the failure to its origin — if you
> cannot explain WHY it happens, you have not found it. (2) Read the subsystem doc before
> changing the design; the correct fix usually already has a home the buggy code bypassed.
> (3) Touching a shared primitive means grepping EVERY call site and fixing all of them in one
> pass — and dual-engine code means fixing BOTH the local and remote twins. (4) If the real
> fix needs a refactor, STOP and report it rather than shipping the band-aid. (5) Verify at
> every affected call site, not just the reported symptom.
