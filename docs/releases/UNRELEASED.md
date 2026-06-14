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

- **Project & card notes.** Right-click a project on the Stage picker for two new
  options: **Project notes** (in-app editor backed by the project's `project.md`
  file) and **Open project folder** (reveals the project in your OS file
  browser). Right-click any gallery card for a new **Card notes** option — jot
  notes against an individual result; they're saved into the card's metadata and
  travel with the project. Notes editing uses a new lightweight overlay
  (text area + Save/Cancel).
