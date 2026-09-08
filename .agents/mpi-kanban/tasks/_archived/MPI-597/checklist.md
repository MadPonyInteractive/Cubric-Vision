# MPI-597 - checklist

- [x] Trace the displacement to its source (ViewManager.handleResize, called from MpiCanvas.resize with a 0x0 rect)
- [x] Confirm the geometry against the user's screenshot: visible fragment 265x417 at the top-left = a -(w/2, h/2) shift of the fitted view
- [x] Bail out of MpiCanvas.resize() when the container has no box
- [x] Sweep the other ResizeObserver consumers for the same 0x0 read (handleResize has one caller; the other three already guard)
- [x] Prove it in a browser harness: pan, hide the container, restore, offsets unchanged - RED and GREEN both measured, see validation.md
