# The Flow result pane — compare, the video player, and surviving a reopen

> Split out of [04-overlay-and-shell.md](../04-overlay-and-shell.md) (MPI-638) when that file
> went over the 200-line budget. These three sections are one subject — what the run slide's
> right-hand column shows once a run finishes — and they were the bulk of it. Read `04` for the
> overlay frame itself, the install progress bar, Ctrl+Enter, z-order and errors.

## The result pane: `result.compare` (MPI-585)

**A comparison belongs to a flow that CHANGES ITS INPUT, and to no other kind** (Fabio,
2026-08-20). That is the whole test, and it is a positive one — not "does this flow take an
input", but "does the output modify one". Of the flows shipped today only `ltx-upscale` and
`head-swap` pass it.

Such a flow declares its before/after instead of coding one:

```js
inputSchema: { media: [{ type: 'video', mode: 'upto', max: 1, roles: ['inputVideo'], … }] },
result: { compare: 'inputVideo' },   // ← which INPUT role is the BEFORE
```

The frame then paints the result on `MpiCompareView` — source left, result right, draggable
reveal bar — instead of a plain `<video>`/`<img>`. **One declaration covers video and image**,
because MpiCanvas's comparison mode already does image+image, image+video, video+image and
video+video. Video pairs stay frame-locked and take the shared `compare.*` hotkeys (space
play/pause both, ←/→ frame step, `l` loop); they are inert while the user is typing in a field.

Declared today: `ltx-upscale` (`inputVideo`) and `head-swap` (`image1`).

**Name the role whose FRAMING the output shares**, not merely an input that fed the run.
Head Swap takes two images but compares against `image1`, the plate it keeps — `image2` only
donates a head and shares no framing, so a bar between them would show two unrelated pictures.

**Omit it when a comparison would say nothing.** Foley returns the same pixels; an extend's
output is LONGER than its source, so a reveal bar between them compares two different moments;
the character sheet takes a description and no input media at all, so the bar's left half would
be empty. All three omissions are pinned by `tests/flow-result-compare.test.cjs` so a later
"every flow should have one" sweep has to argue with a test.

The character sheet is the case worth remembering, because it was nearly decided the other way:
an earlier note read "upscale, head swap AND the character sheet get it", and the flow that
would have been given one has no BEFORE to reveal against. Fabio settled it on 2026-08-20 —
**no input to change means no comparison.** Adding one where it misleads is worse than leaving
it off.

The frame falls back to the plain element by itself when the named media is gone (a Reuse across
a restart), when the run produced several outputs (there is no single "after"), or when the pair
will not decode. So a declaration can never leave an empty pane — but a role that does not match
`inputSchema.media[].roles` falls back **silently**, which reads as "compare is broken". That
pairing is pinned by `tests/flow-result-compare.test.cjs`.

`MpiCompareView` is a shared Compound: the History workspace's `MpiCompareOverlay` is the same
surface wrapped in a full-screen takeover. **Change the compare behaviour in the view, never in
one of the two consumers** — that is the whole reason it was lifted out.

## The result pane: every video result gets the real player (MPI-585)

A **single video** result mounts `MpiVideoViewer` + `MpiVideoControlBar` — the same pair the
Group History workspace runs — not a `<video controls>`. That gives frame stepping, a
frame-accurate seek bar, loop, mute + volume, fullscreen and the time/frames toggle. Nothing to
declare: it is what a video result does.

- **Where they go.** The viewer fills the result FRAME; the bar is a sibling of the `__split`,
  spanning the whole slide beneath it. Inside the result column instead, the bar's ~740px of
  fixed chrome squeezed the flexible part — the seek bar — to exactly 0px.
- **`showTrim: true`, always.** `MpiTrimBar` is track + in/out handles + playhead in ONE
  component, so `showTrim: false` removes the seek bar along with the trim handles.
- **The frame contract is compare's.** The media layer stays empty, which is what leaves every
  `_bindResultView` handler inert; the viewer brings its own zoom/pan.
- **Compare wins the first paint** when the flow declares one, and a `MpiButton` in the frame's
  bottom-right toggles the two. The toggle appears only when BOTH surfaces exist — a declared
  compare AND a video result — and only one is mounted at a time. The choice is remembered
  across slide rebuilds **and across close→reopen** (MPI-587, below), but never applied to a
  result it cannot serve.
- **Unchanged:** images, and runs with several outputs, keep the plain elements. N players would
  be N decoders and N control bars, and there is no single "after" for a reveal bar.

A Flow is an overlay over a workspace that may have its OWN video bar, and video hotkeys are
bucketed by key — so a bar the user cannot see must not answer the keyboard. That gate lives in
the player, not here: `docs/video-player.md` § A bar you cannot see.

## The result pane survives close→reopen (MPI-587)

**A finished result is session state, not instance state.** The shell destroys the
`MpiBaseFlow` on every `flow:open` and on close (MPI-345 — that destroy is correct and stays),
so anything held only in the closure dies with it. Inputs already travelled in
`state.s_flowInputs[flowId]`; the result did not, which is why a reopened flow used to show its
restored inputs beside an EMPTY frame and a finished run read as lost.

`state.s_flowResults[flowId]` is the twin — same session-only lifetime, same top-level-replace
discipline, **last result only** (a run's N outputs are one result; there is no history here):

```js
{ items, mode, status, pending }   // mode = the surface the user CHOSE; pending = the note
```

- **Four write sites, and that is the complete set.** `_persistResult()` is called from
  `_showResults`'s `remember` branch (a finished run and the error/cancel clear are the same
  branch), the surface toggle, the reset at the top of `_run` — the only path that drops the
  result *without* repainting, so it cannot ride on the first — and `_forgetResult`. Before adding
  a fifth, check whether the path already goes through `_showResults`: that is why the flag
  `onComplete` sets moved ABOVE its paint rather than gaining its own persist call.
- **A remembered path can be dead** — item deleted, media cleaned, another project loaded. One
  `fetch(url, { method: 'HEAD' })` at mount decides it (`/project-file` 404s a missing file); on
  failure the snapshot is forgotten and the pane paints empty. **One probe, not three `error`
  handlers**: the replay fans out to plain / compare / player and two of those swallow the event.
  Same discipline as `_mountCompare`'s fallback — never paint a dead `src`.
- **Across a RESTART is a different mechanism** and stays that way: `openFlowFromReuse` rebuilds
  a flow from the card's sidecar. This key is session-only, like the inputs it mirrors.
