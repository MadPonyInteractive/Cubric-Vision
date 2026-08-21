# MPI-592 Validation

PASSED end to end, 2026-08-21, on a private instance (`npm run app:isolated`,
port 59727, `cubric-agent-profile`, GPU 0 leased). Fabio confirmed the GPU was
free and no app was open.

## The run

```
POST /comfy/start                      -> engine ready
POST /create-project {"name":"MPI-592 E2E"}
  -> 7acb5161-5749-426c-838e-00e48f9f79a2
     C:/Users/Fabio/Documents/Cubric Vision/Projects/MPI-592 E2E
POST /connector/open-project {"folderPath": <that>}
  -> {"ok":true,"output":{"folderPath":".../MPI-592 E2E","name":"MPI-592 E2E","groupCount":0}}
POST /connector/generate {"modelId":"krea2","operation":"t2i",
      "positive":"a lone rider at dusk, wide desert, warm rim light",
      "injectionParams":{"Width":768,"Height":768}}
  -> {"ok":true,"output":{"itemId":"648ce3b3-...","groupId":"ecfd7622-...","type":"image",
      "filePath":"/project-file?path=...%5CMPI-592%20E2E%5CMedia%5Ct2i_001.png",
      "pixelDimensions":{"w":768,"h":768},"generationMs":57726}}
```

The check that closes this card:

```
filePath   : C:\Users\Fabio\Documents\Cubric Vision\Projects\MPI-592 E2E\Media\t2i_001.png
new project: C:/Users/Fabio/Documents/Cubric Vision/Projects/MPI-592 E2E
LANDED IN NEW PROJECT: True
itemGroups in new project.json: 1
```

The image is a real render of the prompt (1.06 MB, a rider at dusk), not a black
frame, and `Media/.meta/` carries its sidecar. `Prompt executed in 57.73 seconds`
in the engine log matches the route's `generationMs`, so the run went through the
normal queue rather than any shortcut.

**Fabio watched it live** and confirmed both halves on screen: the project
opening, and the generation running in it. That is the part a state read cannot
stand in for - the app navigating and the grid drawing the placeholder in the
right project - so the card closes on visual confirmation, not just file paths.

Before the fix this same sequence returned the identical `ok: true` shape with the
file under whatever project was open - which is exactly why the file path, not the
response, is the assertion.

## Error paths

Verified in the earlier session on port 52823, unchanged since:

```
POST /connector/open-project {}                            -> BAD_REQUEST
POST /connector/open-project {"folderPath":"C:/nope/..."}  -> NO_SUCH_PROJECT (ENOENT, path in the message)
```

`npx eslint js/shell/agentDispatch.js routes/connector.js` - clean.

## Cleanup

Probe project deleted with `deleteFiles: true` and its folder confirmed gone (it
was written into the real `Documents/Cubric Vision/Projects` root - `APP_DOCUMENTS`
is not profile-scoped). Engine stopped, isolated instance killed by process tree,
0 electron processes left on that profile, GPU lease released. The `G:\ComfyUi`
python still running is the standalone bench, pre-existing and untouched.
