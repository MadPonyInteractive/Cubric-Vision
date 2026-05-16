# Capture Workflow

Use this reference when screenshots, GIFs, videos, or visual verification are part of a Cubric docs task.

## Tool Choice

Prefer Playwright automation for stable captures.

- Use browser dev mode at `http://127.0.0.1:3000/` for static UI surfaces that work in the browser.
- Use Electron Playwright via `npm run test:desktop` or a focused desktop script when the feature depends on native shell APIs, IPC, context menus, drag/drop, or Electron-only behavior.
- Use OS-level screenshots only when Playwright cannot access the target state.

The installed Playwright skill is available at:

`C:\Users\Fabio\.agents\skills\playwright`

Read it when the task calls for browser automation via `playwright-cli`.

## Approval Gate

Before capturing final assets, present a shot list:

```text
Target page: gallery
Assets:
- gallery-empty-project.png: fresh project gallery before first generation
- gallery-selection-mode.png: two selected cards and visible Prompt Box state
- gallery-compare-overlay.png: compare overlay from two selected videos/images
Capture method: Electron Playwright
Output folder: C:\AI\Mpi\Cubric Studio (Docs)\assets\docs\gallery\
```

Wait for user approval before writing assets unless the user explicitly asks for an exploratory capture.

## Screenshot Standards

- Capture realistic app states, not empty chrome unless the doc is about the empty state.
- Prefer 1440x900 for desktop docs screenshots unless a page needs a smaller viewport.
- Capture at 2x device scale when possible.
- Crop to the relevant surface when it makes the instruction clearer.
- Use descriptive filenames.
- Use alt text that describes the UI state, not "screenshot".

## GIF/Video Standards

Use GIFs only for short interaction loops:

- opening the radial menu
- dragging media into the Prompt Box
- painting a mask
- toggling before/after comparison

Keep loops short, ideally 3-8 seconds. If ffmpeg is available, prefer capturing a short MP4/WebM first and converting or exporting an optimized GIF after review.

## Verification

After capture:

- Confirm files exist under the expected docs asset folder.
- Open or inspect at least one produced image before linking it.
- Verify that labels, selected states, and active controls match the text.
- If generated assets contain personal project paths, internal test names, or broken thumbnails, recapture or ask before using them.
