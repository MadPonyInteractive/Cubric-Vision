# MPI-629 — validation

Driven live 2026-08-27 against an isolated app instance (`npm run app:isolated`,
port 59996, own profile — the user's :3000 session was never touched and was
confirmed still serving 200 afterwards). Renderer driven with `playwright-cli`.

Two boot dialogs queue ahead of the update popup on a fresh profile (the 18+ gate
and the What's New changelog); both had to be satisfied in localStorage before the
update prompt could reach the front of the overlay queue. Pre-existing
OverlayManager behaviour, untouched.

| Check | Result |
|---|---|
| Popup copy + controls | title `Update available`, text carries "You can also update later from Settings, where an available update is always listed at the top", checkbox `Don't ask again` present and **unchecked**, buttons `Later` / `Update now` |
| `Later` with the box UNCHECKED | wrote `{"version":"9.9.9","muted":false}`; next boot **re-prompted** — no 3-strike count anywhere |
| `Later` with the box CHECKED | wrote `{"version":"9.9.9","muted":true}`; next boot **silent** |
| Settings while MUTED | `#mpiSettingsUpdateSection` visible, `isFirst === true` (it is `.mpi-settings__content > section:first-child`), title `Update`, desc `You have v1.4.2, and v9.9.9 is out…`, button `Update to v9.9.9` |
| Settings with NO update due (dev flag cleared) | section `hidden`, `getBoundingClientRect().height === 0` — the `[hidden]` CSS rule beats the section's `display:flex` |
| `Update to v9.9.9` with no IPC (browser client) | `mpi-error-dialog` titled **Update unavailable** — honest, not a silent no-op |

`npm test` — 750 pass / 0 fail. `npx eslint` clean on all four changed JS files.

## Not covered

The real portable update PATH (`run-update` → `update.*` script → relaunch) was
not re-run; it is unchanged by this card and was validated under MPI-387/MPI-422.
What changed is who can ask for it and when.
