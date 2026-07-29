# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## importantChanges

- **Windows: the app now starts from `CubricVision.exe`.** `start.vbs` and
  `start-with-terminal.bat` are gone — double-click `CubricVision.exe` in the
  folder instead. This is not a tidy-up. On a clean Windows 11 install, Smart App
  Control blocks `.vbs` and `.bat` files outright, with no "run anyway" and no way
  to allow them, so for anyone on a fresh machine every way we shipped to start
  the app was blocked and double-clicking did nothing at all. An executable does
  not get that treatment. Windows may still warn you the first time with a blue
  "Windows protected your PC" box, because the app is not code-signed yet — click
  **More info**, then **Run anyway**. You only do that once.

  Three things to know if you already have Cubric Vision on Windows:

  - **If the app currently does not start for you at all, updating cannot fix
    it** — the updater is a `.bat` and is blocked by the same rule. Download the
    full build from the release page and unpack it fresh. Your projects live in
    Documents and are untouched; point the new folder at your existing engine and
    models, or set them up again.
  - **If you update in place**, an old `app` folder is left behind in your Cubric
    Vision folder. Nothing uses it any more and it is safe to delete — about a
    gigabyte back.
  - **Updating from inside the app is now the recommended way on Windows**, and
    works regardless of Smart App Control. `update.bat` and `update-from-zip.bat`
    are still there for machines where it is switched off.

## whatIsNew

- **No GPU? Skip the install and run in the cloud.** Setting up Cubric used to
  mean installing the ComfyUI engine first, even on a machine that could never
  use it — and the RunPod settings that would have let you skip it were behind
  the install screen. That screen now offers a way straight past it, with a link
  to the setup video. Cubric then runs entirely on a cloud GPU. Turn it back off
  in **Settings → RunPod** whenever you want the local engine after all.

- **New model: FLUX.2 Klein.** The fastest image model in Cubric Vision, and the
  only one that can take things *out* of a picture — paint over an object, hit
  **Remove**, and it's gone in about four seconds. It covers the full set in one
  model: generate from text, reshape an existing image, follow a depth
  reference, edit with up to three reference images, clean up detail and upscale,
  with eight style looks available on every one of those. Quality is modest next
  to Krea 2 — this one is built for speed and for tidying images up, so reach for
  it when you want an answer now or something removed, and for Krea 2 when you
  want the finished piece.

  > Tip: **Depth** on this model takes *two* images if you give it two. The first
  > supplies the pose, the second supplies who is in it — so you can put your own
  > character into a pose you found, without describing either of them.

- **Krea 2 edits follow your instructions much more closely.** The edit path has
  been rebuilt around the newer Krea 2 edit engine. Your reference image is now
  fitted to the shape of the picture you're making, so asking for a new setting
  actually gives you a new setting instead of quietly keeping pieces of the
  original background. Restaging someone into a new pose, outfit or scene lands
  closer to what you asked for, likeness is better, and references whose shape
  doesn't match your output no longer come out stretched or soft.

  > Tip: the more of your reference frame the character fills, the better the
  > likeness. Crop your reference to the person before using it.

- **Krea 2's quality setting produces far more natural images.** This affects
  everything made at the quality speed, not just edits — the sampler was pushing
  the model too hard, which flattened lighting, over-saturated colour and gave
  skin and surfaces a waxy, plastic look. It is now dialled back, and a second
  detail pass finishes the image. Lighting reads like a real photograph, skin and
  fabric hold real texture, and backgrounds resolve properly instead of going
  soft. It also sticks to your prompt more literally: where it used to quietly
  add flattering or on-theme details you never asked for, it now gives you what
  you actually described. The fast setting is unchanged.

- **Blend two versions of an image together with a mask.** When a re-run fixes
  one part of a picture and ruins another, you no longer have to choose. Paint a
  mask over the area you care about, select that entry and the one you want to
  borrow from, right-click and pick **Mask composite**. **Add** drops the other
  entry's pixels into the masked area; **Subtract** does the reverse, keeping the
  other entry and taking only the masked area from the one you painted. The blend
  lands as a new entry in the strip, so nothing is overwritten and deleting it
  undoes the whole thing. The edge is softened automatically, and a mask drawn as
  an outline fills in, exactly like everywhere else masks are used.

- **Hold Alt to drag a gallery card straight into another app.** Dragging a card
  out to a folder has always worked, but dropping it into Discord, Photoshop or a
  browser upload box did nothing — a plain drag only hands over a *promise* of a
  file, which the file manager understands and other apps ignore. Hold **Alt**
  while you drag and the card leaves as a real file, so any app that accepts a
  dropped file now takes it. You can let go of Alt once the drag is moving. If
  several cards are selected, Alt-dragging one of them drags all of them at once.
  A plain drag is unchanged: onto the prompt to reuse a card, into a folder to
  save it.

- **Image descriptions are sharper and get straight to the point.** Describe an
  image and it no longer starts with "The image shows…" — the description opens
  on the subject itself, so you can paste it straight into a prompt. It is also
  considerably more thorough, covering the subject, clothing, materials,
  lighting, composition and background in enough detail to recreate the shot.

- **Pick what you're making from a strip, not a dropdown.** Every operation your
  model can do now sits above the prompt box as a row of chips, with the current
  one lit. An operation you can't run right now stays visible but dimmed, and
  hovering it says exactly what's missing — *needs 1 image*, *paint a mask
  first*, *takes at most 2 images* — instead of quietly disappearing from a list.
  The same strip appears inside the parameters popup, so you can change operation
  without closing it. Clearing the last image now drops you back to
  text-to-image on its own, and the operation you actually chose comes back the
  moment you add an image again.

- **Every operation now explains how to prompt it.** Operations want completely
  different prompts and nothing in the app said so — Inpaint wants you to
  describe what *should be there* (and erases the masked area entirely if you
  leave the prompt empty), Upscale is usually best with no prompt at all, and
  Edit wants an instruction rather than a description. Open the parameters popup
  and there's now a **?** above the operation strip: it opens a short guide for
  whichever operation you're on — what the prompt is for, a couple of examples,
  and the mistake people usually make. It follows your model too, so the SDXL
  family is pointed at comma-separated tags while the newer models are pointed
  at plain sentences.

- **Choosing a model is a full-screen contact sheet.** The model dropdown is now
  a grid of preview tiles like the Model Library, so you pick by looking at the
  work rather than reading names — click the model button above the prompt and
  it opens, the same way every time, instead of a ring that rotated and changed
  size depending on which model you were on. LoRA & Upscale settings open from
  the model's own tile.

- **Tab jumps between the gallery and the card you were working on.** One key,
  both directions: from the gallery it opens the last card you had open in that
  project, and from inside a card it drops you back to the gallery. It remembers
  per project and remembers after you close the app, so you come back to where
  you left off. If a project has no cards yet, Tab does nothing at all — and if
  you delete the card it was holding on to, it forgets rather than sending you
  somewhere you didn't ask for. This replaces the old Tab ring, which had been
  down to a single entry ever since operations moved to the prompt box.

- **Crop outside the picture.** The crop box no longer stops at the edge of your
  image — drag it past any side and the new area fills with a colour you pick.
  That flat colour is what you hand to a model next: switch to an edit model (or
  any model with edit capabilities), don't mask anything, and just describe what
  should be there — it paints into the coloured area. Good for turning a portrait
  into a landscape, or giving a subject room to breathe. Two smaller things came
  with it: the box now snaps to your image edges when it gets close, so you can't
  accidentally leave a one-pixel sliver of border, and there's a third
  **Resolution** mode beside Ratio and Free where you type an exact width and
  height — the box locks to that shape and the result comes out at exactly those
  pixels. Images only; video crop is unchanged.

- **Masking is rebuilt: four tools, and it can now find anything you can point at
  or name.** Masking used to be one tool with the method buried inside it. It is
  now four icons in the rail, each doing one job.

  **Brush** is painting, plain and simple — paint, erase, opacity. **Points** is
  the new one: click anywhere on the image and the mask snaps to whatever you
  clicked, whether that's a face, a pair of headphones or the coffee cup on the
  table. Right-click to push the selection back off something it grabbed by
  mistake. **Name** lets you type what you want instead — *hair*, *cup, earring*,
  *bikini* — say how many of each to find, and every one comes back as its own
  thumbnail to pick from. **Detect** is the face / hand / person finder you
  already had, unchanged.

  Points and Name cover each other's weak spots. Clicking is precise, but thin
  strappy things — a strap, a handle, a chain — want more dots than you'd expect,
  especially right-clicks to push the selection back; naming the object handles
  those in one press. Everything adds on top of whatever you've already painted,
  so all four mix freely.

  > Tip: dots are cumulative, but they describe *one* region per run. Click, hit
  > **Add**, then start on the next part.

  A few smaller things came with the rebuild. Anything a detector found now draws
  **green**, so a found region is distinguishable from one you painted. A new
  **black-and-white view** in the strip shows the mask exactly as it is handed to
  the model — the quickest way to catch stray specks before you generate. The
  eraser's ring is visible against dark images instead of vanishing into them. And
  the prompt box now **stays open while you mask**: a mask and a prompt are one
  job, and leaving the tool every time you wanted to change a setting was the
  worst part of the old flow.

  Points and Name run on a new model that installs alongside the engine, so expect
  a one-off download of about 1.7GB after you update.

- **Ctrl+Z on the canvas.** Every mask edit can now be taken back — a brush
  stroke, a Clear, committing a detection — with **Ctrl+Shift+Z** to put it back
  again. The history follows you between mask tools, and starts fresh when you
  open a different image.

## fixes

- **If the app fails to start, it now says so instead of vanishing.** A crash
  during startup used to close the window with nothing left behind — no message
  on screen and nothing written to the log — so there was no way to tell whether
  the app had opened and shut, or never opened at all. Startup failures now show
  what went wrong and write the same detail to the log file, so a report has
  something in it. The update download also names itself honestly: unzipping it
  gives you a folder marked `update-only`, which is a patch to apply over your
  existing copy, not a second copy of the app.

- **Editing an image in the strip now always uses the image you're looking at.**
  If you ever dropped or reused an image into the prompt box while working
  inside a history strip, that picture quietly became the input for everything
  you ran afterwards — no matter which entry you had selected. It never showed
  up anywhere, because the prompt panel is tucked behind the prompt tool, so an
  upscale or an edit would come back looking like a completely different picture
  and a lower Denoise wouldn't help: the strength was fine, the image was wrong.
  The strip now always works from the entry you have open. Working with more
  than one input image — a second reference for an edit — is a gallery job, and
  choosing one of those operations inside the strip simply runs it on the
  selected image. Video is unchanged: start and end frames have their own place
  in the prompt panel and still work exactly as before.

- **Stopping a generation no longer says it finished.** Pressing Stop could still
  pop a "Generation finished" notification with the completion chime, because the
  engine often completes the step it was already working on and hands back a
  finished image. That result is still kept — it just no longer announces itself
  as a successful run you didn't ask for.

- **Krea 2 upscaling is sharp again.** Upscales came out noisy — bad enough to be
  unusable at full quality, and mediocre on the fast setting. The upscaler now
  finishes with a short refining pass, and full quality no longer borrows the
  fast setting's accelerator, so it actually renders at the quality you picked.
  Both speeds improved; full quality is the bigger jump.

- **Your images no longer carry hidden data.** ComfyUI stamps the entire
  generation graph — your prompt, negative prompt, seed, model names and the
  full node workflow — invisibly inside every PNG it produces. Cubric Vision now
  strips that out as each image is saved, so you can share or publish your work
  without leaking the prompts behind it. Pixels are untouched: the file is
  byte-for-byte the same image, just without the hidden payload. Applies to
  newly generated images; images already in your project keep their original
  metadata.

- **macOS: installing a model no longer fails partway through.** On Mac, setting up
  any model that uses depth stopped with "Installation Failed" and a Retry button
  that could never succeed — one of the components it downloads asked for a piece
  of software that is only published for Windows and Linux graphics cards, so the
  step failed every single time. Cubric Vision now skips that piece on Mac, where
  it was never usable in the first place. Nothing else about the install changes,
  and Windows and Linux are untouched.

- **Cloud Pods can no longer report a model as installed when nothing downloaded.** While a
  Pod was still starting up, it could answer the "what's on this volume?" question with only
  part of the picture — and anything missing from that answer was taken as *installed*. Models
  you never touched would tick over to installed one after another, with no download and
  nothing on the volume, so the next generation failed on files that were never there. An
  incomplete answer is now treated as "don't know yet" instead of "yes": those models keep
  whatever state they already had and settle on the next check a few seconds later.

- **Gallery cards now match the picture inside them.** A card was laid out using
  the size you *asked* for rather than the size that came back, so whenever a
  model produced something a different shape — some of them adjust dimensions to
  suit the picture — the card was cut to the wrong shape and the image sat inside
  it with padding around the edges. Opening the entry always showed it correctly;
  only the grid was wrong. Cards are now measured from the finished image, so the
  grid lays out cleanly and the small padding some models produced is gone.

- **Windows: setting up on a fresh machine now finishes.** On a clean Windows 11
  laptop the setup ran for an hour, then stopped with "Installation Failed" and a
  Retry button that re-downloaded everything and failed the same way. Three things
  were behind it. The download folder ended up with the app's long name written
  twice, which pushed some of the files it installs past the length Windows allows
  a file path to be, so writing them simply failed. One component asked for a
  developer tool most people do not have installed. And the error message blamed
  the wrong step, which is why Retry looked like it should help. All three are
  fixed: the Windows download unpacks into a single short folder, the unnecessary
  component is gone, and if anything does go wrong the message now names the exact
  part that failed. Setup also checks up front whether the folder you unpacked
  into is too deep for Windows and tells you to move it *before* downloading
  several gigabytes, instead of after.

- **The startup window no longer flashes white.** On slower machines the loading
  window appeared as a blank white box for a few seconds before the logo showed
  up. It now waits until it has something to show.
