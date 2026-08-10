# MPI-519 Brief

## The decision this screen was hiding

First run put a models-folder picker on screen and buried "I have no GPU, I want the
cloud" in an underlined link at the bottom (MPI-390's escape hatch). That framing is
wrong twice: it presents a multi-GB CUDA install as the default rather than as one of
two answers, and it makes the cloud path look like a failure route. MPI-519 promotes
the decision to phase 0 — two cards, both real options, the local one marked
recommended because that is what the product is.

Nothing about the outcome changed. **Remote only** runs the exact MPI-390 sequence
(`state.runpodConfig = { ...state.runpodConfig, enabled: true, skipLocalEngine: true }`
then `Events.emit('engine:install-skipped')`); **Local + Remote** reveals the setup
phase that already existed. Neither opens Settings — that would race the first-launch
18+/changelog overlay chain (MPI-333), which is why MPI-390 named the destination in
copy instead.

## Why it is one component, not two

The choice is a phase of `MpiEngineInstall`, not a new compound. It shares the modal,
the phase switch, the boot-gate events and the teardown; a second component would have
duplicated all four to own two buttons. The one thing it does not share is width — the
cards need 760px and every other phase wants 520px — and `MpiModal` reads
`props.width` once, at portal time, so a mid-show phase change cannot go through it.
`_showPhase` sets `max-width` on the modal element instead; the wrapper stays at the
widest value and paints nothing, so the narrow phases read as a centred box.

## Scope of the design pass

The welcome screen's real defect was structural, not decorative: a centred column
wrapping a left-aligned form, so the title, the label and the input each started on a
different x. Left-aligning the whole component fixes it in one declaration and applies
to every phase, which is also the consistency the product register demands of a single
modal. Along with it: the duplicate `<h2>Welcome</h2>`, the decorative 20px glow (1px
border + wide blur is the ghost-card pattern), the `lg` Browse that stood 9px taller
than the field beside it, and hardcoded px/rem where tokens exist.

Card ordering is local-first, against the order in the request — the recommended path
should lead. Trivial to flip if that reads wrong.

## Deliberately not done

No GPU detection gating which card is recommended. MPI-387 F2 established that
detection misses too much to gate on (Iris/UHD/HD fall through by design), so a wrong
guess here would push a GPU-less user down the install path or a 4090 owner into the
cloud. The user picks.
