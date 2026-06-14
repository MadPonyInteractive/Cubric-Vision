# Cubric Prompt Start Blockers

**Related umbrella:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Related backend plan:** `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
**Future app:** `Cubric Prompt`
**Status:** pre-repo planning note

## Purpose

Capture what must be decided or built before starting the Cubric Prompt app
properly. Cubric Vision can ship v1 before these are done, but Cubric Prompt
should not begin implementation without these blockers resolved or explicitly
accepted.

## Current Position

- Cubric Vision is the first app and can ship standalone.
- Cubric Prompt is the next likely ecosystem app.
- Future Cubric apps are TypeScript-first.
- The future Cubric Studio hub/background system owns the broker.
- The shared TypeScript SDK/contract is the app-facing layer used by Vision,
  Prompt, and later apps.
- Live SDK integration can be deferred from Cubric Vision v1.

## Blockers Before Cubric Prompt Starts

## 1. Connector SDK Contract

Cubric Prompt needs a shared TypeScript contract to know how apps identify
themselves, advertise capabilities, and exchange requests.

Required before starting Prompt:
- Create or identify the future Cubric Studio hub/repo that owns the connector
  SDK and broker.
- Use `packages/connector` in the future Cubric Studio hub/repo, package name
  `@cubric/connector`.
- Review and accept the draft SDK contract in
  `docs/specs/cubric-connector-sdk.md`.
- Define or confirm `CubricAppManifest`.
- Define or confirm `CubricCapability`.
- Define or confirm `CubricCapabilityRequest`.
- Define or confirm `CubricCapabilityResponse`.
- Define or confirm `CubricConnectorError`.
- Keep runtime validation as a requirement for the SDK implementation.
- Define versioning.

Prompt-specific capabilities likely needed first:
- `prompt.enhance`
- `prompt.translate`
- `prompt.format.model`
- `prompt.artifact.create` or equivalent, if Prompt stores reusable prompt
  artifacts.

## 2. Broker Direction

Prompt can be planned against the SDK before the broker exists, but real
app-to-app discovery/routing needs the future Cubric Studio broker.

Required before Prompt has real integration with Vision:
- Decide broker runtime owner: Cubric Studio hub/background system.
- Decide discovery mechanism for installed Cubric apps.
- Decide local transport.
- Decide authentication/trust boundary.
- Decide app registration lifecycle.

This does not block creating Prompt UI/logic if it can run standalone against
mock connector fixtures.

## 3. Cubric Vision Integration Points

Cubric Vision does not need live SDK integration for v1, but Prompt work needs
to know where Vision will eventually call into it.

Required before Prompt integration work:
- Identify PromptBox attachment points for Enhance, Translate, and Format.
- Decide whether optional actions appear only when `cubric.prompt` is installed.
- Decide where unavailable integrations are discoverable: Help, Docs,
  Integrations, or release copy.
- Define the Vision request payload for selected prompt text, model context,
  operation, media context, and project context.
- Confirm no disabled/promotional buttons are shown in core workflows when
  Prompt is absent.

## 4. Artifact And Project Context

Prompt may need project context, selected media context, or generated prompt
artifacts.

Required before Prompt can exchange project-aware data:
- Define `CubricArtifactRef` for project-owned media.
- Define `ProjectContextRef` or equivalent for project-level context.
- Decide whether Prompt consumes whole projects, selected artifacts, prompt
  text only, or all three.
- Preserve sidecar portability and avoid treating project-local UUIDs as global
  identity.

## 5. Shared Component-System Decision

Prompt should not inherit Cubric Vision's JavaScript component system by
accident.

Required before Prompt frontend implementation:
- Decide whether Prompt uses a new TypeScript UI stack.
- Decide whether Stage tokens are shared as CSS/design tokens.
- Decide whether Cubric Vision components are Vision-local, wrapped for
  TypeScript, or selectively ported into a shared package.
- Decide package ownership if a shared UI package exists.

This blocks Prompt frontend implementation, not Cubric Vision v1.

## 6. Product Scope

Prompt needs a narrow first app scope before implementation starts.

Open questions:
- Is Prompt primarily a prompt enhancer, translator, formatter, artifact
  library, or all of these?
- Does Prompt run local LLMs, remote providers, or both?
- Does Prompt own its own projects, or does it mostly operate on Vision project
  context?
- Does Prompt have standalone value without Vision installed?
- What is the v1 offline story?

## Recommended Start Sequence

1. Finish Cubric Vision app-rename and release-critical brand work.
2. Define the connector SDK contract in TypeScript.
3. Decide Cubric Prompt standalone v1 scope.
4. Decide shared UI/component direction for TypeScript apps.
5. Scaffold Cubric Prompt with mocked connector fixtures.
6. Build broker only when real installed-app discovery/routing is needed.

## Verification

This blocker note is resolved when:

- Cubric Prompt has a repo/folder and its own plan.
- The connector SDK contract is defined or explicitly scheduled.
- The broker/hub responsibility is clear.
- Cubric Vision integration points are mapped.
- Prompt frontend stack/component reuse has a decision.
- Prompt v1 scope is narrow enough to implement.
