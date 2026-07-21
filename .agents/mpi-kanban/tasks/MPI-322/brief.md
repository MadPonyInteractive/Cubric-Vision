# MPI-322 — Gallery windowing (virtualize large projects)

## Problem
MPI-319 killed the image DECODE cost (thumbnails, 179x lighter). The remaining
ceiling at very large projects (thousands of entries) is DOM node count + layout,
not pixels: every ItemGroup card mounts its `<img>`/nodes even far off-screen.
Videos already lazy-promote via IntersectionObserver, but image cards and the
grid itself hold all nodes at once.

## Idea
Windowing / virtualization — only render the cards in (or near) the viewport,
recycle nodes as the user scrolls. Must preserve the existing justified layout
(buildJustifiedRows), selection mode, hover playback (MPI-321), drag-drop, and
the scroll-stop handler. The justified row layout makes naive fixed-height
windowing harder — rows have variable height; likely needs row-level windowing
keyed off the computed layout.

## Trigger / priority
Not urgent — only bites at thousands of entries. File now so it isn't lost.
Revisit if a real project hits jank that thumbnails didn't fix.

## Open questions
- Row-level vs card-level recycling given the justified layout?
- How to keep aspect-ratio stabilization (_requestStabilizingRender) correct when
  cards mount/unmount during scroll?
- Interaction with the IntersectionObserver video promotion (may be replaced by
  the windowing viewport math).
