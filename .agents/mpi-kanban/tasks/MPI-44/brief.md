# Vision connector scaffold — unblock from Cubric Studio hub

## Goal

Ship the minimum **Cubric Vision** scaffold so Vision v1 can release without
being blocked by the future Cubric Studio hub/broker, and so that when the hub
matures (during Cubric Prompt work) Vision can connect with minimal extra work.

**This card is Vision-side only.** The connector SDK and broker runtime are
owned by the Cubric Studio hub repo (`c:\AI\Mpi\Cubric-Studio\packages\`), in
**TypeScript**. Vision consumes; Vision does NOT host broker/SDK code. Do not
mix hub concerns into this repo.

## Why this exists

Per locked plans:

- `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
  (complete-planning) — Vision v1 ships standalone; only the manifest/contract
  may be needed before release.
- `docs/plans/2026-05-23-cubric-hub-readiness-before-portable-distribution.md`
  (complete-planning) — Vision v0.0.1 stays manifest-only; hub/broker bundling
  and live runtime are deferred until a connector-dependent feature is promoted.
- `docs/specs/cubric-connector-sdk.md` — contract (Stage 0–5).
- `docs/specs/cubric-vision-connector-integration-map.md` — where Vision will
  later attach Prompt actions (PromptBox Enhance/Translate/Format). **v1
  non-goal.**

## Current state (verified 2026-06-01)

- `resources/cubric/connector-manifest.json` EXISTS (`cubric.vision`,
  protocol `0.1.0`, `metadata.manifestOnly: true`, capabilities
  `project.context.read` + `asset.import`, both consent-gated).
- BUT the manifest is an **orphan**: no Vision JS imports it, no build/staging
  config references `resources/cubric/**`, no `ensureBroker`, no `@cubric/connector`
  dependency. It is a loose file, not yet wired scaffold.
- Hub repo `c:\AI\Mpi\Cubric-Studio\` has `@cubric/connector` (Stage 0) and
  `@cubric/broker` (Stage 1–2) built, but **no git, no root workspace tooling**.

## Scope (Vision v1 — what this card delivers)

1. **Keep the manifest in portable staging.** Ensure the portable/Electron build
   does not exclude `resources/cubric/**`; manifest path stays stable relative to
   app root. (Ties into MPI-8 cross-platform portable distribution.)
2. **Build smoke assertion** for the staged connector manifest: `appId ===
   "cubric.vision"`, `protocolVersion === "0.1.0"`, `metadata.manifestOnly ===
   true` for v0.0.1.
3. **Update-manifest connector fields** — when MPI-8 adds
   `resources/cubric/update-manifest.json`, include `connectorManifestPath` +
   `connectorManifestHash` (computed from the STAGED manifest, not source tree).
4. **No live runtime in v1.** No `@cubric/connector` import, no `ensureBroker`,
   no broker spawn, no PromptBox Prompt actions, no permission/trust UI. Vision
   must behave exactly as standalone when no hub/second app exists (locked
   non-goal — no dead/promotional buttons).
5. **Hub-side handoff note.** Drop a README in `c:\AI\Mpi\Cubric-Studio\`
   describing the pending hub work a future agent must do (git init, workspace
   tooling, Stage 3 `ensureBroker`, registry persistence, spawn-based broker
   integration test) so hub setup is discoverable from inside that folder.

## Out of scope (deferred — post-v1 / when Cubric Prompt starts)

- Live `@cubric/connector` import + `ensureBroker()` in Vision.
- Launch-registration HELLO/READY handshake from Vision to broker.
- PromptBox Enhance/Translate/Format runtime wiring (see integration map).
- Permission/consent/trust UI.
- Any hub/broker implementation (belongs in Cubric Studio repo, TypeScript).

## Sequencing

- v1 scaffold items (1–3, 5): can be done now, alongside MPI-8 portable work.
- Live integration: **post-v1, when Cubric Prompt needs real connector
  services.** Track that as a separate future card, not here.

## Cross-references

- MPI-8 — Cross-platform portable distribution (manifest staging + update-manifest
  land there; coordinate).
- Hub repo: `c:\AI\Mpi\Cubric-Studio\packages\{connector,broker}` (TypeScript,
  separate, no git yet).
