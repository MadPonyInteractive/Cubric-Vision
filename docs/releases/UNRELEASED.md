# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **The next bump is intended as 2.0 — a major release, and Flows are what makes it
> one** (Fabio, 2026-08-26). That is why `## What's new` opens with the Flows section
> and every flow gets its own entry: no shipped release note has ever mentioned Flows
> (checked across every version in `releaseNotes.js`), so this is the first time a user
> sees any of them. Keep that order when folding. It also means **a "fix" to a flow is
> not a fix to anything a user ever had** — see the § Fixes note below.
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

- Mac users need macOS 14 (Sonoma) or later. Vision has always been Apple Silicon only, and
  every M-series Mac can run macOS 14 or newer, so this asks for an update rather than newer
  hardware. Some of the components the engine installs no longer publish a build for older
  macOS versions, and setup cannot finish without them.

- FLUX.2 Klein is now called FLUX.2 Klein 4B, since Klein 9B arrived beside it — the two are
  told apart by name instead of by a small size letter.

- Inpainting no longer erases on an empty prompt — you have to say what you want removed.
  Clearing the prompt and painting over something used to delete it, and that was the whole
  erase gesture. Klein now samples with the mask as a real constraint, and an empty prompt is a
  no-op — the same gesture hands the picture back unchanged. Name the thing instead: "remove
  the tattoo", "remove the head". The bare word "remove" on its own does nothing either, and
  that is exactly what Vision used to fill in for you behind the scenes. Both the 4B and 9B
  cards.

- FLUX.2 Klein 4B is one weight lighter. The 72 MB outpaint LoRA was part of the old erase
  trick and nothing uses it any more, so Klein no longer downloads it and Vision clears it off
  your disk if you already had it.

- The generation engine moves up three versions, and the update is a small one. Vision now
  runs ComfyUI 0.34.0 instead of 0.31.0. Your engine updates itself in place the first time
  you open this version — a handful of small packages, not the multi-gigabyte reinstall an
  engine change used to mean, and none of your models are touched.

## What's new

- **Flows are here, and they are the headline of this release.** A flow is a whole job in one
  place: it asks for what it needs a step at a time, brings its own models, and hands you a
  finished result — no workspace to assemble, no settings to know. Open the Flow Library from
  the Flows button at the top of the gallery, from the landing page, or with Tab, which cycles
  the gallery, your last card and the flow you have open, so you can step out to check a
  picture and land back where you left off. Thirteen to start with:

  - **Head Swap** — put one picture's head on another
  - **Extend Video** — carry on past the last frame
  - **Add Foley** — give a silent clip its sound
  - **Upscale Video** — double a clip's resolution
  - **Draw It In** — draw something into a photo you already have
  - **Scribble** — draw on nothing and have it rendered
  - **Character Sheet** — turn a description into a reference sheet
  - **Outpaint** — extend a picture past its edges
  - **Voice Changer** — say a line and have it come back in someone else's voice
  - **Object Stamp** — take an object out of one photo and put it into another
  - **DramaBox** — describe a speaker and a performance, and hear your line delivered
  - **Text to Speech** — read your text aloud in a voice you pick, in any of 23 languages
  - **Stems** — pull a song apart into bass, drums, vocals and everything else

  Each flow tells you which models it needs and installs them for you, and most of them run on a
  model the Library already offers — so once you own the model, the flow costs you nothing extra.
  The three video flows all run on LTX 2.3 Balanced, so installing it for one gives you the other
  two. Five flows are the exception and say so on their card: Head Swap adds a head-swap LoRA on
  top of Qwen Image Edit, and Voice Changer, DramaBox, Text to Speech and Stems all bring their
  own weights and need no model from the Library at all. The three voice flows share weights where
  they can, so owning one makes the next one smaller.

- **Head Swap** takes a head from one picture and puts it on another. Load the picture you want
  to keep, add the picture with the head you want, draw a square around each head, and run. It
  runs on Qwen Image Edit with a head-swap LoRA. The square may sit past the edge of the
  picture and stretch up to the picture's longest side, so a head near a border — or tall hair,
  or a neck tattoo — can be taken in without the box swallowing whoever is standing next to
  them. The reference head is padded back to square before the model sees it, and what you get
  back is your own picture with no border strip added.

- **Extend Video** continues a clip past its last frame. Drop a video, describe what happens
  next, and LTX 2.3 generates the new seconds — with matching audio — onto the end of it.

- **Add Foley** gives a silent clip a soundtrack. Drop a video, describe what it should sound
  like, and LTX 2.3 generates matching foley across the whole clip. The picture comes back
  untouched — only sound is added.

- **Upscale Video** doubles a clip's resolution and rebuilds its detail. Drop a video and LTX
  2.3 re-renders it at 2x, with the audio coming through untouched. Short clips first: the cost
  grows with length, and a long one can still exhaust graphics memory. The same upscaler is
  also in the History workspace as a tool, further down these notes — the flow is the version
  you can run without assembling anything.

- **Draw It In** puts something new into a photo you already have — a person, an animal, an
  object. Load the picture, draw roughly where the thing goes, how big it is and what pose it
  holds, say what you drew, and box the area to blend. FLUX.2 Klein 9B renders it straight into
  the scene, matching the light, casting a shadow on the ground and letting whatever is already
  in front of it overlap its edges — so it can stand behind things in the photo, not only on
  top of them. The drawing carries the placement and the words carry the subject, so the better
  you draw it the more detail survives and the less you have to fight the prompt: an outline
  with a pose and a tail gives the model far more to work with than a filled blob. The words
  carry style too — ask for a cartoon man and only he comes back a cartoon, the photo around
  him is untouched. Only the area you box is ever re-rendered; the rest of your picture comes
  back exactly as it was.

- **Scribble** turns a drawing into a finished picture, starting from nothing at all. Pick the
  shape you want, draw on the blank canvas — or bring in a sketch you made elsewhere — and say
  what it is. The drawing gives the composition and the words give the subject and the look, so
  it does not have to be a good drawing: rough placement and a readable silhouette are enough
  for FLUX.2 Klein to build a finished image around. Nothing you draw survives into the result
  — the lines are a guide, not part of the picture. Ask for an anime illustration and you get
  one; load a style LoRA and it drives the whole look without you typing a word about style. 9B
  is the recommended model and 4B runs the same flow on a smaller card.

- **Object Stamp** takes an object out of one photo and puts it into another — a mug on your
  desk, a lamp in the corner of your living room, a bag on a chair. Bring the scene and a
  picture of the object, tidy the object up with a background remove and an eraser, then drag
  it to where it should sit. FLUX.2 Klein re-renders just that patch: the object keeps its own
  shape and markings, and it comes back lit by the scene it landed in, resting on the surface
  it touches with a shadow that matches the ones already there. Only the box you drew is
  touched, so the rest of the photo is untouched pixel for pixel.

  Two ways to run it, and the difference is worth knowing. **Auto** keeps the object's own
  pixels, so it comes back as itself — use it whenever the angle it was photographed at already
  suits the scene, which is most of the time. **Manual** lets the model draw the object afresh
  from an angle its source photo never had, which is the only way to change the viewpoint; the
  trade is that a redraw is a redraw, so fine detail can shift. Say the pose you want in your
  own words and it will follow.

- **Character Sheet** turns a description into a reference sheet for a character. Describe who
  they are — wardrobe, age, hair, scars — and you get back one picture holding a large
  three-quarter portrait plus full-body front and back views on a plain grey studio backdrop,
  in the layout a video model reads best. The front body comes back headless on purpose: a face
  taken from a small, soft full-body figure is what makes a character drift, so removing that
  head leaves the portrait as the only place a face can come from. It is a toggle if you want
  the head. Enhance rewrites your description into the full phrase the sheet is generated from
  and shows it to you — edit it freely, whatever is in that box is what runs. Four styles
  (Photoreal, 3D animation, Anime, Cartoon), 1K or 2K, and a Turbo speed toggle.

  Your own LoRAs ride along: a cogwheel beside the model dropdown opens that model's LoRA rack,
  and the same cogwheel sits on the last step beside the result, so you can try a different LoRA
  and run again without leaving the picture you are judging. Someone who has already trained a
  character can load it and describe only the wardrobe on top. It runs on Krea 2 or Krea 2 NSFW —
  either one is enough, and the flow downloads no weights of its own. Krea 2 is the stronger
  choice for stylised work; the NSFW model is trained mostly on photographic source and is weaker
  at Anime and Cartoon.

- **Outpaint** extends a picture past its edges. Drop an image, pick the shape you want — or
  drag the frame freely — and pull it out over the sides you want filled; the new area shows as
  black, and Krea 2 paints it in. It works best in small steps: a narrow strip on one or two
  sides comes back seamless, while a big extension leaves the model inventing most of the
  picture and it shows. To go a long way, run it again on the result rather than asking for it
  all at once. Like Character Sheet, it runs on either Krea 2 or Krea 2 NSFW, and downloads no
  weights of its own.

- **Voice Changer** says your line in someone else's voice. Record yourself performing it — right
  in the flow, or drop in a file you already have — pick the voice you want it in, and run.
  What comes back is your delivery exactly as you gave it: the timing, the pauses, the breath, a
  laugh or a cough if you put one there. Only the voice is different. It is the first flow with
  no picture in it anywhere, so the result arrives as a card you play rather than one you look
  at.

  For the target voice you can bring your own clip or take one from a library of 56 that ships
  with Vision, grouped by the kind of part they suit — standard and young and elderly voices,
  narrator and trailer reads, villains, children, cartoon critters. Press play on any of them
  to hear the voice itself before you choose.

  Three things decide how well it lands, and they are worth knowing before your first take.
  Pick a target that sounds nothing like you — the further apart the two voices are, the more
  obviously the conversion works, and a target close to your own voice is what "it did nothing"
  usually means. Pitch your read near the target's and hold it steady, because drifting inside a
  take drifts the result. And perform it, but do not push: an over-pressed read converts worse
  than a committed one. It runs on Chatterbox, which the flow brings itself — about a gigabyte,
  and no model from the Library is needed.

- **DramaBox** is text to speech you direct in words. Both audio flows read your writing aloud;
  the difference is that Text to Speech needs a voice to copy, and this one lets you describe the
  speaker instead — an exhausted old man, a British woman, someone barely holding it together —
  and builds a voice to fit, from nothing. That is also how you ask for a performance: the
  emotion goes in the line, not in a slider.

  Give it a voice sample and it works the other way round, holding onto that voice line after
  line, which is the hard part of putting one character in more than one scene. Accents work the
  same way — write one in and it will often land, though only the ones the model already knows,
  so treat it as something to try rather than a guarantee.

  Set the seconds deliberately: it is the control that matters most here. Left to guess, the
  model tends to pad the take out or read your instructions back at you, and telling it how long
  the line should be is what stops both. It speaks English, brings its own weights — about
  fifteen gigabytes, the largest of any flow — and needs no model from the Library.

- **Text to Speech** reads your writing aloud. Type the line, give it a sample of the voice you
  want it in, pick a language, and run. Twenty-three are on offer — Chinese, Japanese, French,
  Italian, German, Spanish, Arabic, Hindi and more — all from one model, so no language costs
  you an extra download, and choosing one is the whole of it: there is no switch to remember.

  A note on Portuguese: it comes out Brazilian. That is the model, not a setting, and it is
  flagged on the option itself so it is not a surprise halfway through a project.

- **Stems** pulls a song apart. Drop in a track — one you made in Vision or one you brought from
  anywhere — and get the bass, the drums, the vocals and everything else back as separate files,
  ready to open in a DAW and mix properly. Pick which parts you want before you run; you can also
  ask for them combined into one track instead of one card each, which is how you get an
  instrumental (everything except the vocal) or just the rhythm section. It brings its own
  separator, needs no model from the Library, and saves everything as FLAC, so nothing is thrown
  away on the way to your mix.

  The separation is good, not surgical: expect a little vocal to bleed into the "other" track,
  and reverb tails to follow the voice rather than stay behind. That is normal for stem
  splitting, and it is the kind of thing a mix hides.

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

- Place puts one picture inside another. Open an image, pick Place from the Composite tools,
  and drop in a second image — a logo, a product, a person cut out of another shot. Drag it
  where you want it, scale and rotate it with the handles, and Apply stamps it down as a new
  entry with both originals untouched. Remove background cuts the object out first, so what
  lands is the object and not its rectangle. The button beside Apply puts the picture back to
  its own size if you have scaled it somewhere you did not mean to, without moving it.

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

- **You can now go and get an update instead of waiting to be asked.** When a new version is
  out, Settings shows it at the very top with a button to install it — and that row is only
  there when there is actually something to install. The prompt you get on startup is no
  longer the only way in: it now says so, and it carries a **Don't ask again** checkbox, so it
  keeps offering until you tell it to stop rather than quietly giving up on its own. Tick the
  box and the startup prompt goes quiet for that version; Settings still has the update
  whenever you want it.

- **MiniMax H3's Turbo mode got faster and cleaner at the same time.** Turbo now runs on a
  newer speed weight and a faster attention path, and the picture it produces is less noisy
  than before — so the fast option is no longer only about saving time. The weight behind it
  is also much smaller: 0.41 GB in place of 1.82 GB, which is 1.4 GB less to download when
  you install H3 from here on. The full-quality 25-step mode is untouched and still the
  default.

- **Turbo on MiniMax H3 Reference now has its own speed weight, tuned for references.** Both
  H3 models used to share one, built for the other model. Reference now gets one trained for
  the job: shots come out more cinematic, and the sound follows what you asked for more
  closely. It adds a 0.29 GB download to that model, and only to that model.

## Fixes

> **A fix to a FLOW does not belong in this section for this release.** Flows debut here, so
> no released build ever had the bug and no user can have met it — the fix is part of the
> feature. One entry below is affected and was left alone rather than edited silently: "Live
> latent previews now play everywhere they appear" names the **Flow result pane** alongside the
> History workspace and the minimised preview window. The last two are real released bugs and
> the entry is worth keeping; the Flow clause is the part to drop when folding.

- MiniMax H3 installs far faster. Both H3 models share one very large file - a 24.55 GB
  text encoder - and it was the slowest thing in the app by a wide margin, arriving at well
  under 1 MB/s. On a normal connection that alone ran for hours, and installs could give up
  before it finished. It now comes from our own servers and downloads at tens of megabytes a
  second. If our copy is ever unreachable the app falls back to the original source on its
  own, so nothing breaks. The rest of H3's files are unchanged and still come from
  HuggingFace: those are MiniMax's own model weights, and their licence does not let us
  host copies.

- A half-installed model can give its disk space back. If a model lost one of its files —
  you tidied the models folder by hand, or an install stopped near the end — the library
  showed it as not installed and offered only Install, while the rest of its weights, often
  tens of gigabytes, stayed on disk with no way to reclaim them. The model's detail panel
  now offers **Remove files** next to Install whenever it is holding files, and removing
  them still keeps anything another installed model needs.

- Clicking away closes a panel now, wherever you are. Settings, Hotkeys and About stayed
  open until you found the X or pressed Escape, while other panels in the app closed the
  moment you clicked outside them — the same gesture did two different things depending on
  where you were. Clicking anywhere behind a panel now closes it. The Cue queue panel is the
  one deliberate exception: it sits above the prompt bar so you can keep prompting with the
  queue open, and closing it on every prompt-bar click would defeat the point. Escape and
  the X are unchanged, and opening a dropdown or a dialog from inside a panel still leaves
  the panel where it is.

- No more terminal windows flashing open when Vision starts. On Windows, launching the app
  popped up to ten black console windows for a moment each - one for every background check
  Vision runs at boot to find your graphics card and start the Cubric services. They did
  nothing and closed themselves, but they looked alarming, and enough of them landed at once
  to read as something malicious. They are now hidden, as they were always meant to be.

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

- Cut-out images look right in the gallery. After Remove Background, the gallery card showed
  the ORIGINAL picture — its backdrop, and the shadow under it — while opening the item showed
  the correct cut-out, so it read as the gallery picking the wrong version. The card reads the
  small thumbnail the gallery builds for speed, and that thumbnail was a JPEG, which cannot
  hold transparency: saving it threw the cut-out away and left the untouched picture
  underneath. Image thumbnails are WebP now, so a transparent PNG sits on the gallery
  background as it should — whether it came from Remove Background or was imported from
  elsewhere. Existing projects rebuild their thumbnails the first time you open them after
  updating.

- Scrolling a gallery full of videos is smooth again. Dragging the scroll bar through a project
  with many video cards stuttered, and the more videos were on screen the worse it got. Every
  scroll movement was rewinding every video in the gallery back to its first frame — including
  the ones already parked on it — and the wasted work piled up faster than scrolling could
  produce it. A video already sitting on its first frame is now left alone. Hovering, playback
  and the silence-while-scrolling behaviour are unchanged.

- The first engine start no longer looks frozen. Setting up a new engine installs a large set
  of Python packages before ComfyUI can start, and for the minutes that took, the window only
  said "Starting ComfyUI Engine…" — no progress, no explanation, so it read as a hang. That
  step now names itself, "Installing Python packages… First engine start only", and hands over
  to "Starting ComfyUI Engine…" the moment it finishes. Later starts skip the step entirely, as
  they always did.

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

- The gallery gives your graphics memory back. Scrolling through a project of videos left
  the app holding well over a gigabyte of video memory for the rest of the session — on a
  161-clip project, a single pass took it from 410 MB to 1.86 GB, and nothing released it
  until you switched workspaces. That is memory your next generation needed. The gallery
  now hands it back whenever it is not the surface you are looking at, and again the moment
  a generation starts, taking it back when the queue is empty. Clips you have scrolled well
  past also let go on their own, so a long project costs what is on screen instead of
  everything you have looked at. Hovering a card still plays it, exactly as before.

- Big gallery cards are sharp. At the largest card size the gallery was still drawing the
  same small thumbnail it uses for the smallest one, so on a wide window a card painted at
  roughly twice the detail it actually had — soft enough that checking your own work meant
  opening the History workspace. Cards now pick a thumbnail that matches the size they are
  drawn at, and fall back to the original file when the picture is smaller than the card.
  The small sizes are unchanged, and nothing decodes a big version just because you scrolled
  past it.

- Generated files are named after the button you pressed. An edit is `edit_004` whichever
  model made it, an upscale is `upscale_002` rather than `pid_002`, and a video is `i2v_007`
  rather than `i2v_ms_007`. The names came from internal ids, so the same Edit button
  produced four different ones depending on the model, and some of them named a thing that
  appears nowhere in the app. Which model made a picture is still one click away on the
  card's Reuse. Files you already have keep the names they were saved under.

- Hovering a video card costs a fraction of what it did. A clip preview used to play the
  full-resolution master, so a 3000-pixel-wide video decoded every one of those pixels into
  a card a few hundred pixels across. The gallery now keeps a 720p copy for hover playback —
  about six times less graphics memory per card on a large clip — while the viewer, drag-out
  and everything you export still use the original untouched. Existing projects build their
  copies the first time you open them after updating.
