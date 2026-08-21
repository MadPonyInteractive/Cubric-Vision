# MPI-448 — the desktop suite must not fight the dev app for port 3000

Split from MPI-446 at the user's request: the port collision blocks almost everything
else, because running the desktop suite means closing the app you are working in.

## What is wrong

`server.js:29` — `const port = 3000`, hardcoded. `main.js` carries four literal
`http://127.0.0.1:3000` references (`loadURL` ×2, the downloads-active probe, the Pod
teardown POST), and `tests/desktop/shellWindow.js` resolves the shell window by matching
that same literal URL.

So a spec run while the dev app is up does not conflict — it **silently attaches**. The
launched Electron finds :3000 already answering, loads the running app's page, and the
spec drives the DEV session: real engine root, real user data, real models. The
`CUBRIC_E2E_USER_DATA` isolation the suite is built on is bypassed without a single
error, and a green run means nothing.

That is why `CLAUDE.md` and `docs/testing.md` both carry a "port 3000 must be free
first" warning. It is a warning about a footgun that should not exist.

## Shape of the fix

Make the port a value, not a literal:

- `server.js` reads it (env, defaulting to 3000 so nothing else changes).
- `main.js` builds its URLs from the same value.
- `tests/desktop/launch.js` picks a free port per run and passes it in the launch env.
- `tests/desktop/shellWindow.js` matches on the port it was given, not `3000`.
- Nine specs predating `launch.js` inline their own launch block — they need the same
  treatment or a conversion to the shared launcher.

Then make a busy port a hard failure instead of a silent attach: if the E2E port is
already listening, throw. A silent attach is the actual bug; a different port is what
makes failing loudly affordable.

## Done when

- `npm run test:desktop` runs green with the dev app open on :3000 and leaves it alone.
- An occupied E2E port fails the run loudly.
- The "port 3000 must be free first" warnings in `CLAUDE.md` and `docs/testing.md` are gone.
