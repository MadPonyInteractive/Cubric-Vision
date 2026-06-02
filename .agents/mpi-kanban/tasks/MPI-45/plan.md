# Audit and fix Website hero responsiveness

## Current State

Project mode: scalable-foundation. The work targets the sibling website repo at `C:\AI\Mpi\Cubric Studio (Website)`, tracked from the Cubric-Vision master kanban. The Vision hero responsive issue has been fixed in `styles/product.css` and user-verified after live browser review.

## Implementation

- [x] Audit the website hero across representative desktop, tablet, and mobile viewports, then implement responsive fixes for the hero composition, `Coming soon` pill behavior, and mobile first-viewport presentation. **Verify:** browser screenshots or automated viewport checks show the hero is coherent and non-overlapping across the tested breakpoints.

## Completed

- [x] Fixed the Vision hero mobile layout, status pill sizing, mobile nav height, headline sizing, CTA behavior, and horizontal overflow.

## Remaining Work

- None.

## Plan Drift

- None yet.

## Verification

Verified against the live website server at `http://127.0.0.1:3333/vision/` with Playwright viewport checks at `426x813`, `390x844`, `360x740`, `820x1180`, `1440x900`, and `1280x720`. Mobile horizontal overflow is eliminated.

## Preservation Notes

Website changes belong in `C:\AI\Mpi\Cubric Studio (Website)`. Keep Cubric-Vision board updates in `.agents/mpi-kanban/tasks/MPI-45/`.
