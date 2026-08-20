# MPI-592 Validation

Ran 2026-08-20 against a private instance (`npm run app:isolated`, port 52823,
`cubric-agent-profile`). The user's app on :3000 was left alone.

## What passed

Probe project created, opened over HTTP, then deleted:

```
POST /create-project {"name":"MPI-592 Probe"}
  -> 03c1da23-97be-41f7-960d-b9d55d665267
     C:/Users/Fabio/Documents/Cubric Vision/Projects/MPI-592 Probe

POST /connector/open-project {"folderPath":".../MPI-592 Probe"}
  -> {"ok":true,"output":{"folderPath":"C:/Users/Fabio/Documents/Cubric Vision/Projects/MPI-592 Probe",
      "name":"MPI-592 Probe","groupCount":0}}
```

That `output` is read back off `state.currentProject` after the call, so it is
the switch itself being reported, not an echo of the request. And it is the same
value `_submitGeneration` reads - the `NO_PROJECT` guard and every downstream
save go through that one field.

`navigate(PAGE_GALLERY)` runs before the report, so the `ok: true` also proves
navigate did not throw; a throw there rejects into the relay's catch and comes
back `RUNTIME_ERROR`.

Both error paths, same run:

```
POST /connector/open-project {}
  -> BAD_REQUEST  "body.folderPath is required."
POST /connector/open-project {"folderPath":"C:/nope/not/a/project"}
  -> NO_SUCH_PROJECT  "... ENOENT ... 'C:\nope\not\a\project\project.json'."
```

`npx eslint js/shell/agentDispatch.js routes/connector.js` - clean.

Cleanup: probe project deleted with `deleteFiles: true` (it was written into the
real `Documents/Cubric Vision/Projects` root, since `APP_DOCUMENTS` is not
profile-scoped), folder confirmed gone, isolated instance killed by process tree,
0 electron processes left on that profile.

## What is NOT proven, and needs Fabio

**No generation was run.** The isolated instance reports `comfy/status
{running:true, ready:true}` because the engine is shared - firing a generation
would spend the user's GPU unattended, and it needs a lease.

So the last leg is one cheap t2i, by hand, with the app open:

1. `POST /create-project` with a throwaway name.
2. `POST /connector/open-project` with its `folderPath`.
3. `POST /connector/generate` (krea2 / t2i, anything).
4. The card must land in the NEW project's gallery, and its `filePath` must be
   under that project's `Media/`.

Step 4 is the part a state read cannot stand in for: it is the visible half -
the app navigating, the grid drawing the placeholder in the right project. The
mechanism underneath it is proven above.
