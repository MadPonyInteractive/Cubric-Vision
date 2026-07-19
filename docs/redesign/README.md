# docs/redesign/ — routing index

Stage redesign spec. **Merged to master** (commit `e9b5eb6`, PORTING.md phases 0–10.2). Routine
work (component tweaks, bug fixes, restyles) does NOT read these — use `styles/01_base.css`
tokens + `.claude/rules/components.md` § "Stage design baseline". Read here **only** for: a new
surface with a matching mockup, a follow-up phase (beyond 10.2), or a Stage audit.

Read order: [PRODUCT.md](PRODUCT.md) → [DESIGN.md](DESIGN.md) → [PORTING.md](PORTING.md) → the matching mockup.

| File | Purpose |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Persona, register, tone, anti-references — read first |
| [DESIGN.md](DESIGN.md) | OKLCH tokens, type scale, component primitives, motion, banned patterns |
| [PORTING.md](PORTING.md) | Phase-by-phase port plan with file-level mappings |
| [RECOLOR.md](RECOLOR.md) | Photoshop hex-replace recipe for mascot + logo PNGs |
| [MAPPING.md](MAPPING.md) | Legacy→Stage token mapping |
| `c-stage/*.html` | Five Stage mockups (`landing`, `gallery`, `editor`, `editor-video`, `popups`) — visual ground truth |
| `c-stage/tokens.css` | Stage tokens + primitive selectors — copy values, not class names |
| `_base.css` | Mockup base reset — reference only, do not import into the app |

**Spec → code is one-way.** Never edit these files to match implementation. Real-app deviations
get a `// REDESIGN-DEVIATION:` comment at the call site. Do not ship the CSS hue-rotate filter
for PNGs — recolor mascot/logo PNGs at the source per RECOLOR.md.
