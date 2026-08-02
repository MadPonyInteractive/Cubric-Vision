# MPI-425 - Canvas tool taxonomy

Agreed with the user 2026-08-01 in the MPI-424 brainstorm. Lands FIRST.

## Toolbar after the WHOLE MPI-424 set (not after this card)

```
  Mask
   [brush]                brush engine  -> binary mask layers
   [detect]  ->  floating strip: [points] [text] [auto]
   [adjust]               sliders over an existing mask (MPI-382)
   [shapes]               shape gizmo   -> binary mask layers (MPI-368)
  Paint
   [brush]                same brush engine -> RGBA paint layer (MPI-375)
   [shapes]               same gizmo        -> RGBA paint layer (MPI-368)
  Composite
   [mask comp]            1 image slot + 1 mask slot (MPI-373)
   [paint comp]           1 image slot              (MPI-373)
```

## The Detect collapse strip

- Click the Detect button -> a small vertical strip appears **outside** the tool
  panel, next to the toolbar, with points / text / auto.
- It dismisses itself on a timer while unhovered, so it never sits there forever.
- No corner triangle, no long-press. The user rejected both by name.
- It is presentation only: the three remain separate modes.

## Scope discipline

This card declares the groups, the modes and the strip. It does NOT build:

- the Adjust panel (MPI-382),
- the shape gizmo (MPI-368),
- the paint layer or the brush-engine extraction (MPI-375),
- the composite slots (MPI-373).

**CORRECTED 2026-08-02.** This paragraph used to read "new modes may ship
disabled-with-a-reason until their panel lands". That was written before the plan
and is now WRONG. Decision 3, settled with the user and recorded in `task.json` and
`plan.md`: **only working tools ship.** This card delivers the Mask group as
`maskBrush` plus the Detect strip, nothing else. No greyed placeholders advertising
unbuilt features. Adjust / Shapes / Paint / Composite buttons arrive on their own
cards. The diagram above is the END state of the whole MPI-424 set.

## Why first

Every card below mounts into these groups. Building Adjust as a fifth Mask button,
then moving it, then building Paint Brush as a separate tool, then merging it with
Mask Brush, is the same work done twice. The toolbar already supports groups with
stacked buttons, so the structural half is cheap - the only new component is the
floating strip.
