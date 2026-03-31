---
description: Finish up your work
---

# Finish Workflow

## Step 1: Update Dev Docs
Update the relevant files in `dev_docs/` so future agents understand what changed, what was added, and what to avoid. Focus on:
- `dev_docs/01_overview.md` — add files you created and if files are missing add them too
- `dev_docs/02_status.md` — log what was done in this session
- `dev_docs/04_technical_notes.md` — add any new gotchas or patterns discovered

Do not write essays. One line cause + one line decision is enough.

## Step 2: Hand Off Testing to the User (MANDATORY)

**Do NOT test the app yourself.** Do NOT open a browser, do NOT run the server, do NOT use screenshot tools to verify the UI.

The user tests manually — this is intentional. They get more insight from testing themselves and can spot things an automated check would miss.

When your code changes are complete, stop and tell the user:

> "Changes are done. Please test by running `Start.bat` (or `node server.js` in a browser). Let me know if anything looks off."

If the user finds a bug during testing, they will describe it. Fix it, then hand off again.

## Step 3: Do Not Declare Done Until the User Confirms
Do not say "all done ✅" or "refactor complete" until the user explicitly confirms testing passed. Your job ends at the hand-off, not at the code commit.