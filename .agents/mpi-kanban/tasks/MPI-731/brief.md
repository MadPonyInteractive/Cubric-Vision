# MPI-731 — Audio player: transport, volume and waveform scrubber

Raised by Fabio 2026-09-12, mid-MPI-730. Not planned yet — this is the capture, not a plan.

## What

Audio in this app currently plays as a bare `<audio>` element with whatever the platform
gives it. It needs a real player: **play/pause**, an **MPI volume slider with its mute
toggle**, **elapsed / total time**, and the waveform as the thing you scrub.

## Why it is a separate card from MPI-730

MPI-730 makes an audio *card in the gallery* draw its waveform and seek on click — a tile
that plays on hover. A player is a different surface with its own controls, its own layout
and its own lifecycle. The only thing they share is the waveform, and MPI-730 hands that over
as a component.

## The reuse that makes this small

`MpiVideoControlBar` (`js/components/Compounds/MpiVideoControlBar/`, 560 lines) already owns
this exact transport for video:

- `MpiButton` play/pause (`icon: 'play'`, `iconActive: 'pause'`, SPACE)
- `MpiButton` mute (`icon: 'volumeHigh'`, `iconActive: 'volumeOff'`, M)
- `MpiProgressBar` volume slider
- a `mpi-video-control-bar__time` display
- an embedded `MpiTrimBar` as the scrub track, driving an attached `MpiVideoSurface`

The audio player is that bar with two substitutions: **`MpiWaveform` in place of
`MpiTrimBar`**, and an `<audio>` element in place of `MpiVideoSurface`. Decide at plan time
whether that is a third mode of the existing bar or a sibling component — do not assume.

`MpiWaveform` is the component MPI-730 item 2 produces: it takes the baked mask at the
sidecar's `thumbPath`, a progress fraction and a duration, paints the played/unplayed split,
and emits a seek. It is built card-first but with this player as the second consumer, so it
must not depend on gallery-card DOM.

## Known constraints

- The mask is ONE 21:9 rendition, deliberately. A wide short transport strip stretches the
  same file — do NOT bake a second rendition for the player (MPI-730 plan drift, 2026-09-12).
- `docs/video-player.md` explains why video playback is a hybrid `<video>` + canvas: frame
  accuracy. Audio has no frame-accuracy problem, so do NOT copy the canvas overlay across.
- Depends on MPI-730 item 2 landing `MpiWaveform`. Plan this one after that, or plan it
  earlier but do not start it before the component exists.

## Not decided

Where the player lives (Group History workspace? a viewer overlay? inline in the gallery?),
whether it replaces hover-play or sits beside it, and whether an audio workspace is what
finally removes MPI-730's temporary "audio cards never open" suppression.
