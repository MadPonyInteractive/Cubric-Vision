# MPI-592 Checklist

- [x] `POST /connector/open-project` in `routes/connector.js`, relayed via `_dispatchToRenderer`
- [x] `project.open` case in `js/shell/agentDispatch.js` (openProject + navigate, reports once)
- [x] Error codes cover a bad/missing folderPath and an app with no window listening
- [x] Live check: create a project, open it over HTTP, generate, confirm the card lands in the NEW project
      (krea2 t2i, 57.7s, `Media/t2i_001.png` under the new project, itemGroups 1 - validation.md)
- [x] `SKILL.md` - step 3 of the create-then-generate sequence becomes the endpoint
- [x] `SKILL.md` - drop "No project switching" from § What it does not do yet
