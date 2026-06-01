# MPI-45 Brief

## Goal

Audit and fix the Cubric Vision marketing website hero across common viewport sizes, with special attention to the newly added `Coming soon` pill and the mobile layout.

## Workspace

- Website repo: `C:\AI\Mpi\Cubric Studio (Website)`
- Tracker repo: `C:\AI\Mpi\Cubric-Vision`

## Context

The hero section currently does not display well at different resolutions. The latest visible problem is the new `Coming soon` pill, which appears to be disrupting the hero composition. The mobile phone presentation currently looks poor and needs a full visual audit, not just a one-off pill adjustment.

## Scope

- Inspect the website hero at desktop, tablet, and mobile widths.
- Check how the `Coming soon` pill wraps, aligns, overlaps, or affects spacing.
- Audit the full mobile first viewport for hierarchy, spacing, text fit, CTA/pill placement, and media behavior.
- Apply responsive layout fixes in the website repo.
- Verify with screenshots or browser checks at representative breakpoints.

## Acceptance Criteria

- The hero remains visually coherent at wide desktop, laptop, tablet, and mobile phone widths.
- The `Coming soon` pill never overlaps hero text, CTAs, nav, imagery, or viewport edges.
- Mobile layout has readable type, usable spacing, and a clear first-viewport brand/product signal.
- The next section remains hinted where the design requires it.
- Changes are verified in the website repo without modifying Cubric-Vision app code.

## Notes

- Use absolute paths when working in sibling repos.
- Run git commands from the sibling website repo only.
- Do not commit unless explicitly asked.
