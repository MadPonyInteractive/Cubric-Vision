# Vision connector scaffold - superseded by MPI-8

## Superseded / Merged

Merged into MPI-8 on 2026-06-05. The remaining Vision v1 connector scaffold work
belongs to the portable distribution build/update-manifest pipeline:

- staged `resources/cubric/**`
- staged connector manifest smoke assertion
- `connectorManifestPath` and `connectorManifestHash` in update manifest
- standalone Vision behavior with no live hub runtime

Continue implementation from `.agents/mpi-kanban/tasks/MPI-8/`.

## Original Goal

Ship the minimum Cubric Vision scaffold so Vision v1 can release without being
blocked by the future Cubric Studio hub/broker, and so that when the hub matures
during Cubric Prompt work, Vision can connect with minimal extra work.

This card is Vision-side only. The connector SDK and broker runtime are owned by
the Cubric Studio hub repo (`c:\AI\Mpi\Cubric-Studio\packages\`) in TypeScript.
Vision consumes; Vision does not host broker/SDK code.

## Current State

- `resources/cubric/connector-manifest.json` exists for `cubric.vision` with
  protocol `0.1.0`, `metadata.manifestOnly: true`, and consent-gated
  `project.context.read` + `asset.import` capabilities.
- As of 2026-06-05, hub repo setup has advanced: `c:\AI\Mpi\Cubric-Studio\`
  has git metadata and root workspace tooling. Remaining live hub cards are
  post-v1 and are not blockers for the manifest-only Vision scaffold.

## Out of Scope

- Live `@cubric/connector` import + `ensureBroker()` in Vision.
- Launch-registration HELLO/READY handshake from Vision to broker.
- PromptBox Enhance/Translate/Format runtime wiring.
- Permission/consent/trust UI.
- Any hub/broker implementation.
