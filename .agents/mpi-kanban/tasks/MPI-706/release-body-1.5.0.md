Faster, sharper MiniMax H3 video, Klein 9B, and inpainting on the SDXL family and Krea 2.

## Important changes

- **The video quality settings have been renamed, and a saved project may open at a different size.** MiniMax H3's sizes moved down one step: what used to be the top ordinary setting is now the middle one, and a genuinely larger option sits above it. The sizes themselves did not change — the labels did, because the old top setting produced draft-grade video and should not have been called high. Reopening an older project may therefore show a different size than the one you saved.
- MiniMax H3 uses noticeably less memory than before, which makes it far more reliable on smaller machines and on rented GPUs — where running short of memory would previously stop a video partway through without explaining why.
- Rented GPUs are now chosen with enough memory to actually run H3. Renting a remote GPU used to place you on whatever machine was free, including ones with too little system memory for a video model, where a generation could be killed partway through with no explanation. New Pods now ask for at least 56 GB. You can change that figure in settings, and should raise it for anything heavier than H3.

## What's new

- **A second FLUX.2 Klein: the 9B.** A larger, stronger sibling of the Klein already in the app, with its own seven styles — Storybook, Comic, Anime, Chibi, Doodle, Vintage and Watercolour. They are deliberately not the same eight the smaller Klein offers: four of them are a different artist's work entirely, so naming them after the 4B styles they sit beside would be a label that lies about what loads. Both cards now carry their size in the name, so it is clear which one you are picking and which styles belong to it.
- **Inpainting comes to SDXL, Illustrious, Pony and Krea 2.** Paint a mask, describe what should be there, and only that part is rebuilt — the rest of the picture is left exactly as it was. It was previously available on FLUX.2 Klein alone. On Krea 2 the fast/quality toggle works here too, so a quick fix stays quick.
- **Sharper 2K and 4K video from MiniMax H3.** H3 now works in two stages: it lays the video down first, then a new upscaling stage rebuilds detail as it enlarges. High resolution clips hold together where before they were sampled straight out at full size. Turbo also moves to a stronger, better-trained fast model, so quick drafts look closer to the finished thing instead of glossy and plastic.
- **The largest file H3 needs now comes from our own servers.** It used to be fetched from HuggingFace, where it trickled in at well under 1 MB/s and could run for hours or give up before finishing. It is the same file — it just arrives at a usable speed now. If our copy is ever unreachable the app falls back to the original source on its own.
- **Longer LTX clips render faster.** LTX now uses ComfyUI's own built-in fast attention, which needs nothing installed and works on the graphics card you already have. The gain grows with clip length: nothing measurable on a 2 second clip, around 13% off a 5 second one.

## Fixes

- Uninstalling a model left some of its files on disk while reporting success. Anything the model kept next to the engine — frame interpolation weights, for instance — could not be removed at all, and the app told you the files were being kept deliberately. They are properly removed now, and the space comes back.
- A half-installed model can give its disk space back. If a model lost one of its files — you tidied the models folder by hand, or an install stopped near the end — the library showed it as not installed and offered no way to remove what was still there, so the bytes were stranded.
- Connecting to a rented GPU no longer announces every model already on it. A connect quietly repairs the remote engine, and that repair was being reported as though each model had just been downloaded — a stack of toasts, plus one naming a raw internal job id.
- Around ten console windows no longer flash open behind the app on startup, and the same flash is gone from video trimming, cropping, reversing and GIF export.
- Media you drag in is imported from disk instead of being copied through memory first, which stops a large video from stalling or failing outright. A rotated video also reports the size you actually see rather than its pre-rotation one.
- Applying an update leaves the install describing itself correctly, instead of reporting the version it replaced.
- Video crop and reverse name their output like every other tool, and the prompt box files its result under the operation you picked.
- Two model-library defects: the Frame Interpolation download showed another pack's name, and a model whose files sit outside the usual folder could read as installed to the installer and not-installed to the library — badge stuck, Install downloading nothing.
- The gallery no longer keeps playing a hovered clip underneath an overlay that just opened, and a canvas hidden behind another panel is no longer mistaken for a resize.
- Videos in the gallery looked softer than the images sitting next to them. Their preview frames were being generated at half the width of image thumbnails; both are the same size now.
- The H3 quality picker offered a size the model cannot actually produce, so picking the highest setting could fail or hand back something other than the size on the label. The sizes offered now match what H3 renders.
- The video preview flashed a few scrambled frames at the start of an LTX generation.
- Downloading models to a rented GPU has had three failures fixed: it no longer gives up when the cheap CPU machines it prefers are all taken, it no longer starts more downloads at once than the machine can carry, and a download now picks itself back up if the remote machine restarts underneath it instead of stalling silently.

## Engine

The generation engine moves from ComfyUI 0.31.0 to 0.34.0. Rented GPUs move with it — a remote machine now runs the same engine version your own does, which is what the new H3 and LTX video work needs to run there at all.

## Platform status

- **Windows** — tested locally on the maintainer's Windows development machine. Not yet validated on a separate clean Windows host.
- **Linux** — not tested on this version.
- **macOS** — not tested on this version.

## Updating

The app checks for a new version when it starts and offers to update itself. One click downloads only what changed — the update bundles attached here — applies it, and reopens the app. There is nothing to run by hand.

**Windows installs older than v1.3.0 cannot update this way.** The updater that runs is the one already on your disk, and Smart App Control blocks it on those builds. Download the full `CubricVision-windows-x64-v1.5.0.zip` instead.

## First launch

These builds are **not code-signed**, so both desktop platforms show a security prompt the first time. This is expected.

**Windows.** Extract the zip anywhere and run `CubricVision.exe`. Windows may show *"Windows protected your PC"* — click **More info**, then **Run anyway**.

**macOS.** A downloaded build is quarantined. Clear it, then launch:

```
xattr -dr com.apple.quarantine "<extracted folder>"
```

then double-click `start.command`.

## Downloads

| Platform | Full build | Update bundle |
|---|---|---|
| Windows x64 | `CubricVision-windows-x64-v1.5.0.zip` | `CubricVision-windows-x64-update-v1.5.0.zip` |
| Linux x64 | `CubricVision-linux-x64-v1.5.0.tar.gz` | `CubricVision-linux-x64-update-v1.5.0.zip` |
| macOS arm64 | `CubricVision-macos-arm64-v1.5.0.zip` | `CubricVision-macos-arm64-update-v1.5.0.zip` |
