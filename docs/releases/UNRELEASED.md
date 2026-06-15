# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## importantChanges

- **Breaking — Wan 2.2 video model split.** The combined "Wan 2.2 Smooth" model
  (which bundled both text-to-video and image-to-video) has been removed and
  replaced by two dedicated models: **Wan 2.2 T2V Smooth** (text-to-video only)
  and **Wan 2.2 I2V Smooth** (image-to-video only, includes the PainterI2V
  advanced node). Users now install only the half they need instead of the full
  ~36 GB combined download. Existing projects that referenced the old combined
  model auto-fall-back to the first available video model on next load; nothing
  breaks, but anyone who installed the combined model should install whichever
  split model(s) they actually use and can uninstall the leftover checkpoints to
  reclaim disk. (The underlying t2v/i2v checkpoints are unchanged — only the
  model-pack grouping changed.)

- Removed the Settings → External Connections "ComfyUI API URL" field. It was
  non-functional dead config: the app never read it, and generation always used
  the built-in engine address. The 1.0.0 tutorial mentions this field — call
  out explicitly that it is gone and was never wired. Pointing Cubric Vision at
  a separately running ComfyUI instance is not supported.

## whatIsNew

- (RunPod Remote Engine — add the full feature notes here when MPI-64 ships.)

- **Smarter OS notifications.** Desktop notifications now fire whenever the app is
  not focused — not just when it's minimized — so a generation that finishes while
  Cubric is sitting behind another window still pops a notification. New: when a
  model finishes downloading and the app isn't focused, you get a `"<model>
  installed."` notification too. When the app is focused, you still get the in-app
  toast only (no OS notification).

- **Drag-and-drop model import (LoRA & upscale).** Settings → External Connections
  and the Model Settings picker now show each of your configured model folders as a
  drop zone — drag a `.safetensors` / `.ckpt` / `.pt` / `.bin` / `.pth` onto the
  folder you want and Cubric copies it there (the original stays put). The picker
  list refreshes immediately so the model is ready to select. Dropping a file that
  already exists asks before replacing.

- **Missing-model feedback.** If a project references a LoRA or upscale model whose
  file is no longer in any of your model folders, the Model Settings dropdown now
  flags it in red as `(missing)`. Trying to generate with a missing **LoRA** is
  blocked with a clear toast (so a missing LoRA can't be silently dropped from your
  result); a missing **upscale** model automatically falls back to the built-in
  default and warns, so the generation still runs.

## fixes

- **LoRA/upscale models in subfolders failed to load on Windows.** Models stored in
  a subfolder (e.g. `loras\SDXL\name.safetensors`) were sent to the engine with the
  wrong path separator and rejected with "Prompt outputs failed validation". The
  model list now uses the engine's native path format, so subfolder models load
  correctly. (Also shipping as a 1.0.1 hotfix.)

- **Relocated models no longer show as missing.** If a model file moves between your
  configured folders (e.g. you remove an extra folder but the same file still lives
  in your primary folder), Cubric now finds it by name and updates the saved path
  automatically instead of flagging it as missing — as long as the match is
  unambiguous. If two different folders contain a same-named file, it stays flagged
  so you can pick the one you mean.

- **Project & card notes.** Right-click a project on the Stage picker for two new
  options: **Project notes** (in-app editor backed by the project's `project.md`
  file) and **Open project folder** (reveals the project in your OS file
  browser). Right-click any gallery card for a new **Card notes** option — jot
  notes against an individual result; they're saved into the card's metadata and
  travel with the project. Notes editing uses a new lightweight overlay
  (text area + Save/Cancel).
