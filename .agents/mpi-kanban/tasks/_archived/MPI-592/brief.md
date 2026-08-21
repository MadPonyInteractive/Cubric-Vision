# MPI-592 Brief

## The hole

`POST /connector/generate` dispatches into `state.currentProject`
(`js/shell/agentDispatch.js` `_submitGeneration`, the `NO_PROJECT` guard). Nothing
in the connector surface can change that value. An agent can create a project and
read it, but the generation still runs wherever the human happens to be.

The bad case is not the error. `NO_PROJECT` is the GOOD outcome - it is loud. The
bad outcome is the user having a project open: the run succeeds, returns
`ok: true` with a real itemId, and the images land in the wrong project's gallery
with correct-looking sidecars. Nothing in the response says so.

## The fix

`openProject(project)` (`js/services/projectService.js`) already does the whole
job headlessly - POSTs `/migrate-project`, reconciles and hydrates, sets
`state.currentProject`, resets `s_selectedOpByModel`, registers the parent dir in
both localStorage and the durable registry, sets last-project, emits
`project:changed`, and fires the thumb backfill. Both UI callers
(`js/shell/projectUI.js`) do nothing more than pair it with
`navigate(PAGE_GALLERY)`.

So:

1. `routes/connector.js` - `POST /connector/open-project` taking `{folderPath}`,
   relayed through the existing `_dispatchToRenderer` the same way
   `/connector/generate` is.
2. `js/shell/agentDispatch.js` - a `project.open` case that calls `openProject`
   then `navigate(PAGE_GALLERY)`, reporting once on every exit path.

`agentDispatch.js` carries a standing instruction in its header: it is the
DISPOSABLE half of MPI-546, the HTTP route is the contract, keep it dumb. Respect
that - no project listing, no fuzzy name matching, no create-if-missing in the
renderer. `folderPath` in, ok/err out.

## Not in scope

Media inputs and job status/cancellation are still the documented gaps of the
connector generate surface (`SKILL.md` § What it does not do yet). This card
removes exactly one line from that list: project switching.
