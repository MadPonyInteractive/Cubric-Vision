# MPI-519 Checklist

## Choice pre-step (phase 0)

- [x] `choose` phase added to `MpiEngineInstall` as the entry point for mode `installing`
- [x] Two cards: **Local + Remote** (recommended) reveals the setup phase, **Remote only**
      keeps the MPI-390 behaviour byte-for-byte — `runpodConfig { enabled: true,
      skipLocalEngine: true }` then `Events.emit('engine:install-skipped')`
- [x] Old bottom-of-setup escape-hatch link removed; the RunPod video link moved to the
      choice screen's foot
- [x] `Back` control on the setup phase returns to the choice
- [x] `upgrading` / `repairing` still go straight to the progress phase — unchanged
- [x] Modal widens to 760px for the choice and returns to 520px for every other phase
      (`_showPhase` caps the modal element; `MpiModal` reads `props.width` once, at
      portal time, so it cannot own a per-phase width)

## Welcome / setup screen refresh

- [x] Duplicate `<h2>Welcome</h2>` deleted; one title, `Install ComfyUI`
- [x] Whole component left-aligned — the old centred column wrapped a left-aligned form,
      so title / label / input each started on a different x
- [x] Browse dropped `lg` → `md` and the row equalised (Stage button padding made it 47px
      against a 38px field)
- [x] Install is full width at `md`, not a full-width `lg` slab
- [x] Decorative `box-shadow` glow removed from the root (1px border + 20px blur is the
      ghost-card pattern)
- [x] Hardcoded px / rem replaced with `--s-*` / `--t-*` tokens
- [x] Card body copy at `--ink-2`, facts at `--ink-3` — `--ink-3` over `--surface-1` is
      about 2:1

## Gallery

- [x] `preview-engine-install-install` relabelled **choice phase** (`show('installing')`
      now lands there)
- [x] New `preview-engine-install-setup` — **setup phase**, reached the way a user reaches
      it, by pressing the Local + Remote card
- [x] `preview-engine-install-upgrade` untouched

## Housekeeping

- [x] `js/components/types.js` props doc updated (three phases, per-phase width)
- [x] CSS already registered in `js/shell/preloadStyles.js` — no new file
- [x] `npx eslint` clean on all three changed JS files
