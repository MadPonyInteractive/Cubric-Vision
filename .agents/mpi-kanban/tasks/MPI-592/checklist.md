# MPI-592 Checklist

- [x] `POST /connector/open-project` in `routes/connector.js`, relayed via `_dispatchToRenderer`
- [x] `project.open` case in `js/shell/agentDispatch.js` (openProject + navigate, reports once)
- [x] Error codes cover a bad/missing folderPath and an app with no window listening
- [ ] Live check: create a project, open it over HTTP, generate, confirm the card lands in the NEW project
      (state switch + both error paths proven; the generation leg needs Fabio's GPU - see validation.md)
- [x] `SKILL.md` - step 3 of the create-then-generate sequence becomes the endpoint
- [x] `SKILL.md` - drop "No project switching" from § What it does not do yet
