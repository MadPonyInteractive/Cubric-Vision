# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## importantChanges

- Removed the Settings → External Connections "ComfyUI API URL" field. It was
  non-functional dead config: the app never read it, and generation always used
  the built-in engine address. The 1.0.0 tutorial mentions this field — call
  out explicitly that it is gone and was never wired. Pointing Cubric Vision at
  a separately running ComfyUI instance is not supported.

## whatIsNew

- (RunPod Remote Engine — add the full feature notes here when MPI-64 ships.)
