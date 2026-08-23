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

- Inpainting no longer erases on an empty prompt — you have to say what you want removed.
  Clearing the prompt and painting over something used to delete it, and that was the whole
  erase gesture. Klein now samples with the mask as a real constraint, and an empty prompt is a
  no-op — the same gesture hands the picture back unchanged. Name the thing instead: "remove the
  tattoo", "remove the head". The bare word "remove" on its own does nothing either, and that is
  exactly what Vision used to fill in for you behind the scenes. Both the 4B and 9B cards.

## What's new

- FLUX.2 Klein now comes in two sizes. The 9B card sits beside the 4B one and does the same
  seven things — generate, reshape, follow a depth reference, edit with up to three reference
  images, inpaint, detail and upscale — with more detail and closer prompt following, traded
  against speed. It wants about 15GB of video memory at its peak, so on a 16GB card the margin
  is thin and 4B stays the one to reach for if you run out. Each size brings its own styles.

- Klein 9B brings seven styles of its own. Storybook, Comic, Anime, Chibi, Doodle, Vintage and
  Watercolour, available on everything the card does — generating, editing, inpainting, all of
  it. They are a different set from the 4B card's eight, not the same styles carried across:
  only Anime, Chibi and Doodle are the same artists' 9B versions of ones you already have. The
  others are different artists' work, which is why the names changed rather than the pictures —
  Storybook is mid-century storybook illustration, Comic is pulp comic rather than manga, and
  9B's Vintage is 1960s-80s where the 4B one is 1920s. Muppets and Jojo simply have no 9B
  version in existence yet, from anyone, which is why the count is seven. Chibi is trained
  hard and looks best with Stylization pulled back a little.

- Some models now ask you to accept their licence before they download. Klein 9B is the first:
  it is free to use and the pictures you make with it are yours to sell, but the model itself
  is licensed for non-commercial use, so you request access at the people who made it and paste
  a Hugging Face token to prove it. Vision checks the token against your grant and unlocks the
  download only once it passes.

- Klein inpaints properly now. Painting over part of a picture used to regenerate the whole
  patch and hope it blended; it now samples with the mask as a real constraint, on both the 4B
  and 9B cards, and it can see the picture underneath the mask — so what comes back sits in the
  light, style and perspective of everything around it. Removing something now has to be asked
  for by name; see Important changes.

- Place puts one picture inside another. Open an image, pick Place from the Composite tools, and
  drop in a second image — a logo, a product, a person cut out of another shot. Drag it where you
  want it, scale and rotate it with the handles, and Apply stamps it down as a new entry with both
  originals untouched. Remove background cuts the object out first, so what lands is the object and
  not its rectangle. The button beside Apply puts the picture back to its own size if you have
  scaled it somewhere you did not mean to, without moving it.

- Flows are out of preview. The Flow Library is a set of outcome-shaped jobs you run without
  assembling a workspace: Head Swap, Extend Video, Add Foley, Upscale Video, Character
  Sheet and Outpaint. Open it from the Flows button at the top of the gallery, from the
  landing page, or with Tab — which now cycles the gallery, your last card and the flow you
  have open, so you can step out to check a picture and land back where you left off. Each
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
  Anime, Cartoon), 1K or 2K, and a Turbo speed toggle.

- Character Sheet uses two models, and you pick both. A **Render model** draws the sheet, and a
  **Blend model** removes the head from the front body — two dropdowns in the Flows panel when
  you select the flow, each with its own cogwheel opening that model's LoRA rack, so your own
  LoRAs ride along on either stage. Someone who has already trained a character can load it on
  the render side and describe only the wardrobe on top.

- The Render model is Krea 2 or Krea 2 NSFW; the Blend model is FLUX.2 Klein 4B or 9B. Both
  dropdowns appear whether or not anything is installed, so you choose which one downloads
  rather than getting whichever came first, and owning one candidate per slot is enough to run
  the flow. Krea 2 is the stronger choice for stylised work; the NSFW model is trained mostly on
  photographic source and is weaker at Anime and Cartoon.

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

- The colour picker no longer opens off the bottom of the screen. Clicking the colour swatch
  in the Paint, Crop, Resize, Remove Background or Adjust tool options while the panel sat low
  in the window put the picker's HEX field below the edge of the app, so you could see the
  saturation square and the hue bar but not read or type the hex value. It now opens upward
  when there is no room below it.

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
