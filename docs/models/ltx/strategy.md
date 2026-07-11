# LTX-2.3 Strategic Markers

> Bankable strategic findings from the LTX-2.3 sessions. Not test tasks — context
> that should bias product decisions.

## LTX stage-1 quality already beats WAN (the moat)

At stage-1 ONLY (~352×640 as tested 2026-06-23; very_low is now 320×640 after the
/64 snap, doesn't change the finding), pre-upscale output quality is already impressive —
"Wan cannot do this." Confirms the core thesis: **LTX-2.3 quality >> WAN.** This is
the moat behind the high-quality-open-video strategy. Strength-independent,
live-observed 2026-06-23 — bankable.

## NSFW is a capability gap on this model (2-layer censorship)

- **VBVR does NOT add NSFW/anatomy capability** (tested, confirmed). It's
  reasoning/sequencing, not content. Civit NSFW examples were either
  already-visible-in-frame-1 content (i2v animating what's there) or made on the
  Sulphur-2 full **uncensored checkpoint**, not this LoRA on the official base.
- **Layer-2 capability gap:** the model can ANIMATE what's visible in frame 1,
  CANNOT SYNTHESIZE anatomy it never trained on. No LoRA/abliteration fixes layer 2.
  i2v makes it worse ("animate this frame" → off-frame synthesis is uphill).
- NSFW testing dropped for the shipping base.

## FUTURE EPIC (under consideration): own NSFW MOTION LoRA — market gap

> Not a release item. A differentiator candidate, post-first-LTX-release.

- **Market gap:** Sora/Veo/Kling/Runway hard-block NSFW; NSFW creators' only open
  option today = WAN (functional, lower quality). LTX-2.3 = higher quality but no
  NSFW capability + NO community LoRA fills it. "High-quality open video that does
  NSFW" is an UNOCCUPIED category.
- **Scope:** teach generalized **MOTION only, NOT anatomy** (animate visible
  content). WAN precedent: 5–10 short (~3s) clips taught a motion. A few basic
  generalized NSFW motions, RTX 6000, ~2–3 days (LTX first-run trial-and-error
  longer, later runs fast). Existing WAN NSFW LoRAs often ship their datasets →
  half the work to port.
- **Why viable now:** the earlier "expensive/data-heavy" caution was for
  teach-anatomy-from-scratch. Motion-only on visible content = a bounded R&D
  project. The difficulty (and that the community hasn't done it for 2.3) IS the moat.
- **Decision: ship the refined base regardless; this is its own epic, later.**

## Release framing (target ~25th June)

Bias toward shipping a **refined base** (i2v/t2v/FL + audio + a validated LoRA
stack). Defer extend/headswap/ControlNet unless progress is strong.
