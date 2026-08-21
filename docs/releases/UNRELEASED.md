# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **Cleared 2026-08-15 after 1.4.2 shipped.** All nine items (4 new + 5 fixes) were
> folded into `RELEASE_NOTES['1.4.2']` and `docs/releases/2026-08-15-v1.4.2.md`.
>
> **Cleared 2026-08-11 after 1.4.1 shipped.** All nine bullets (1 new + 8 fixes)
> were folded into `RELEASE_NOTES['1.4.1']` and
> `docs/releases/2026-08-11-v1.4.1.md`, including the first-run entry an earlier
> commit (`e2b0ddbf`) had filed for 1.5.0 — Fabio retargeted the whole scratchpad
> at the patch, because nothing pending was a feature.
>
> **The reset is part of the bump and it got missed in 1.4.0** — the fold ran, the
> clear did not, which would have re-folded all of 1.4.0 into the next version and
> shipped every bullet twice. If you are folding a release and this file still holds
> the last one's items, that is the bug, not a backlog.
>
> **Before writing a "used to / previously / no longer" claim, check it against the
> last released tag** (`git show v<prev>:<path>`), per bullet. Code that changed two
> or three times inside one unreleased version reads like user-visible history but
> never shipped, and the entry is then simply false. Full gate:
> `.claude/skills/mpi-release/references/copy-review.md` § Gate 0.

## Important changes

_(none yet)_

## What's new

- Flows are out of preview. The Flow Library is a set of outcome-shaped jobs you run without
  assembling a workspace: Head Swap, Extend Video, Add Foley, Upscale Video, Character
  Sheet and Outpaint. Open it from the Flows button at the top of the gallery, from the
  landing page, or with Tab — which now cycles your last card, the gallery and Flows. Each
  flow says which models it needs and installs them for you; none of them download weights
  of their own.

- Character Sheet turns a description into a reference sheet for a character. Describe who they
  are — wardrobe, age, hair, scars — and you get back one picture holding a large three-quarter
  portrait plus full-body front and back views on a plain grey studio backdrop, in the layout a
  video model reads best. The front body comes back headless on purpose: a face taken from a
  small, soft full-body figure is what makes a character drift, so removing that head leaves the
  portrait as the only place a face can come from. It is a toggle if you want the head. Enhance
  rewrites your description into the full phrase the sheet is generated from and shows it to you
  — edit it freely, whatever is in that box is what runs. Four styles (Photoreal, 3D animation,
  Anime, Cartoon), 1K or 2K, a Turbo speed toggle, and your own LoRAs ride along if you have
  them, so someone who has already trained a character can describe only the wardrobe on top.

- Character Sheet runs on either Krea 2 or Krea 2 NSFW. If you have both installed, a Model
  dropdown appears in the Flows panel when you select the flow — pick which one before you open
  it. With only one of them installed there is no choice to make and it simply uses that one, so
  owning one of the two is enough to run the flow. Krea 2 is the stronger choice for stylised
  work; the NSFW model is trained mostly on photographic source and is weaker at Anime and
  Cartoon.

- Outpaint extends a picture past its edges. Drop an image, pick the shape you want — or drag
  the frame freely — and pull it out over the sides you want filled; the new area shows as black,
  and Krea 2 paints it in. It works best in small steps: a narrow strip on one or two sides comes
  back seamless, while a big extension leaves the model inventing most of the picture and it
  shows. To go a long way, run it again on the result rather than asking for it all at once.
  Like Character Sheet, it runs on either Krea 2 or Krea 2 NSFW, and downloads no weights of its
  own.

- Videos can be upscaled with LTX, sound and all. The Upscale tool in the History workspace
  has a new option on video — "LTX Video upscaler" — which doubles a clip's resolution using
  the LTX 2.3 Balanced model, and the audio track comes through untouched. Two controls come
  with it: Denoise, how freely it may repaint detail, and Prompt strength, how hard an
  optional prompt steers it. The prompt starts empty on purpose, and for most clips that is
  the right setting — describing skin or texture tends to make the model add what you named
  rather than sharpen what is there. It appears in the Library as its own row and installs
  LTX 2.3 Balanced for you if you do not have it; it downloads no weights of its own, so if
  you already run LTX there is nothing to install. Video only, and a long or large clip can
  still exhaust graphics memory — a short clip is the safe first try.

- Head Swap boxes can now leave the picture, and grow past it. The square you draw around a
  head may sit beyond the image edge and stretch up to the picture's longest side, so a head
  near a border — or tall hair, or a neck tattoo — can be taken in without the box swallowing
  whoever is standing next to them. The reference head is padded back to square before the
  model sees it, and the picture you get back is untouched: no border strip.

## Fixes

- The 8:5 shape now really is 8:5. Picking 8:5 (or 5:8 in portrait) on FLUX, Chroma,
  FLUX.2 Klein or Krea 2 at 1K produced 1280×768 — which is 5:3, about 4% wider than the
  shape the button named. It is now 1280×800, and 800×1280 in portrait, so the picture
  matches the label. Krea 2's 2K band was already exact and has not moved. Images you
  generated before this are unaffected and still read as 8:5 on their History card; only
  new generations at that setting change size, by 32 pixels of height.

- Scrolling a gallery full of videos is smooth again. Dragging the scroll bar through a project
  with many video cards stuttered, and the more videos were on screen the worse it got. Every
  scroll movement was rewinding every video in the gallery back to its first frame — including
  the ones already parked on it — and the wasted work piled up faster than scrolling could
  produce it. A video already sitting on its first frame is now left alone. Hovering, playback
  and the silence-while-scrolling behaviour are unchanged.

- The first engine start no longer looks frozen. Setting up a new engine installs a large set of
  Python packages before ComfyUI can start, and for the minutes that took, the window only said
  "Starting ComfyUI Engine…" — no progress, no explanation, so it read as a hang. That step now
  names itself, "Installing Python packages… First engine start only", and hands over to
  "Starting ComfyUI Engine…" the moment it finishes. Later starts skip the step entirely, as they
  always did.

- The app no longer keeps running outdated engine components after an update. Anyone who had
  used "Skip the local engine install" kept that setting even after an engine was installed,
  and it quietly switched off the check that repairs out-of-date components — so a fixed or
  improved component could sit unused indefinitely, with nothing reported. The setting now
  clears itself once an engine is present, and is greyed out while one is installed.

- "Run locally" is now honoured everywhere, not just on the Cue button. With a cloud Pod
  connected and the toggle switched on, continuing a preview, finishing a preview, and the
  History workspace's own image, video and resize tools all still sent the job to the Pod —
  so a generation needing something only your own machine has could fail on the cloud engine
  while the app showed it was running locally. The queue chip disagreed too, reading REMOTE
  next to a local toggle. Every dispatch path now reads the one setting.

- Connecting to a cloud Pod no longer claims to have installed models it did not. Every
  connect announced one "<Model> installed." message per model already on the volume — six
  at a time, with nothing downloaded — plus a raw internal job name, "engine:node-drift
  installed.". A background repair that runs once per connect was being mistaken for a
  download, and when the window was in the background each one also became a desktop
  notification. Those repairs are now silent, as they were always meant to be; a real
  install still tells you, including one that completes as a side-effect of another.

- Live latent previews now play everywhere they appear. The Flow result pane replayed
  the whole clip at burst speed on every sampler step and then froze, the History
  workspace showed nothing at all on a video run, and the minimised preview window sat
  on a single still frame. All four surfaces now share one player and pace the clip at
  the rate it announces.
