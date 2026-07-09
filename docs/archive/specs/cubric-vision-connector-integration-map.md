# Cubric Vision Connector Integration Map

**Status:** planning map, no runtime implementation
**Related SDK contract:** `docs/specs/cubric-connector-sdk.md`
**Related plan:** `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
**Related Prompt blocker note:** `docs/plans/2026-05-20-cubric-prompt-start-blockers.md`

## Purpose

Map where Cubric Vision will eventually attach connector-aware Prompt actions
and what payloads those actions should send. This document is intentionally
implementation-neutral: it does not add SDK imports, broker startup, live
discovery, permission UI, or Cubric Prompt runtime behavior.

## PromptBox Entry Points

Future Prompt actions attach to `MpiPromptBox`, but remain optional integration
actions layered beside the existing Cue generation path.

Candidate attachment points:
- `prompt.enhance`: transform the current positive and negative prompt text.
- `prompt.translate`: transform the active prompt field, preserving whether the
  user is editing positive or negative text.
- `prompt.format.model`: format prompt text for the active Vision model and
  operation.

The future UI should use the current PromptBox state as the source payload:
- prompt text from `el.getRunPayload().positive`.
- negative prompt from `el.getRunPayload().negative`.
- operation from `el.getRunPayload().operation`.
- media chips from `el.getRunPayload().mediaItems`.
- model context from the block-owned active model.
- operation-specific settings from `el.getRunPayload().injectionParams`.

Expected insertion points:
- Gallery PromptBox: available when the active model supports prompt-driven
  generation.
- Group History PromptBox: available when `_shouldShowPromptBox()` allows prompt
  mode or frame-op staging.
- PromptBox settings surface: suitable for model-aware format actions because
  the current model and operation are already visible there.
- Textarea-adjacent compact action cluster: suitable for Enhance/Translate, but
  only when a live provider capability is discovered.

Unavailable integrations must not create disabled promotional controls inside
core generation workflows. When `cubric.prompt` is absent, PromptBox should
continue to behave exactly as a standalone Vision prompt editor.

## Help And Integrations Discoverability

Discoverability belongs outside the core generation path until the broker and
Cubric Prompt are real.

Future surfaces:
- Help slide-over: may explain available connector features after discovery is
  implemented.
- Integrations surface: preferred long-term place for installed app status,
  trust state, permissions, and missing app explanations.
- Release/docs copy: acceptable before an in-app Integrations surface exists.

Non-surface for v1:
- No inactive Prompt buttons in PromptBox.
- No automatic broker startup from Help.
- No app-scanning UX in Cubric Vision v1.

## Project Context Payload

Vision should send project context only when a project is open and the
capability needs it. Project context must preserve existing portability rules:
`project.json` stores history ids, while hydrated runtime items and sidecars
carry the full media metadata.

Draft `CubricRequestContext.project`:

```json
{
  "appId": "cubric.vision",
  "projectId": "proj_123",
  "projectName": "Campaign Concepts",
  "projectRoot": "C:\\Users\\Fabio\\Documents\\Cubric Studio\\Projects\\campaign-concepts",
  "schemaVersion": 1
}
```

Recommended Vision-only context metadata:

```json
{
  "sourceOperation": "i2v",
  "sourceModelId": "wan-video",
  "locale": "en-US"
}
```

Payload rules:
- Include `projectRoot` only for trusted local connector calls that already have
  project consent.
- Do not send full `project.json` by default.
- Do not treat project-local item UUIDs as global artifact identity.
- Prefer selected/current artifacts over broad project scans.
- Include recent prompt history only behind a future explicit input flag.

## Selected Artifact Refs

Vision should build connector artifacts from selected or staged media, not from
global gallery state.

Sources:
- PromptBox media chips from `getRunPayload().mediaItems`.
- Gallery selected groups, using each group's selected history item.
- Group History current item at `_group.history[_currentIdx]`.
- Role-tagged media chips such as `startFrame` and `endFrame`.

Project-owned media should be represented as `project-artifact` refs whenever
the item belongs to the current project:

```json
{
  "kind": "project-artifact",
  "mediaType": "image",
  "projectId": "proj_123",
  "itemId": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "relativePath": "Media/t2i_001.png",
  "sidecarRelativePath": "Media/.meta/6e409682-8b95-4ff7-aa77-e24e7656cbf8.json",
  "displayName": "t2i_001",
  "operation": "t2i",
  "metadata": {
    "role": "startFrame",
    "modelId": "sdxl-realistic"
  }
}
```

External file refs are fallback-only for assets outside an open Vision project:

```json
{
  "kind": "external-file",
  "mediaType": "image",
  "absolutePath": "C:\\Users\\Fabio\\Pictures\\reference.png",
  "displayName": "reference.png"
}
```

## Draft Vision To Prompt Requests

### Enhance Current Prompt

```json
{
  "schemaVersion": 1,
  "requestId": "req_vision_prompt_enhance_001",
  "from": {
    "appId": "cubric.vision",
    "displayName": "Cubric Vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.enhance",
  "input": {
    "prompt": "a cinematic portrait in neon rain",
    "negativePrompt": "",
    "targetModelId": "sdxl-realistic",
    "operation": "t2i",
    "mode": "replace-current",
    "injectionParams": {
      "Width": 1024,
      "Height": 1024
    }
  },
  "context": {
    "project": {
      "appId": "cubric.vision",
      "projectId": "proj_123",
      "projectName": "Campaign Concepts",
      "schemaVersion": 1
    },
    "sourceOperation": "t2i",
    "sourceModelId": "sdxl-realistic",
    "locale": "en-US"
  },
  "artifacts": [],
  "timeoutMs": 30000
}
```

### Translate Active Prompt Field

```json
{
  "schemaVersion": 1,
  "requestId": "req_vision_prompt_translate_001",
  "from": {
    "appId": "cubric.vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.translate",
  "input": {
    "prompt": "retrato cinematografico de uma mulher na chuva neon",
    "activeField": "positive",
    "sourceLanguage": "pt",
    "targetLanguage": "en",
    "operation": "t2i",
    "targetModelId": "sdxl-realistic"
  },
  "context": {
    "sourceOperation": "t2i",
    "sourceModelId": "sdxl-realistic"
  },
  "timeoutMs": 30000
}
```

### Format For Active Model

```json
{
  "schemaVersion": 1,
  "requestId": "req_vision_prompt_format_001",
  "from": {
    "appId": "cubric.vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.format.model",
  "input": {
    "prompt": "a high detail fantasy city at sunset",
    "negativePrompt": "",
    "targetModelId": "wan-video",
    "operation": "t2v",
    "mediaType": "video",
    "injectionParams": {
      "Duration": 5,
      "Motion_Intensity": 0.6
    }
  },
  "context": {
    "sourceOperation": "t2v",
    "sourceModelId": "wan-video"
  },
  "artifacts": [],
  "timeoutMs": 30000
}
```

### Format With Selected Artifact Context

```json
{
  "schemaVersion": 1,
  "requestId": "req_vision_prompt_format_artifact_001",
  "from": {
    "appId": "cubric.vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.format.model",
  "input": {
    "prompt": "continue this shot with stronger camera motion",
    "negativePrompt": "",
    "targetModelId": "wan-video",
    "operation": "i2v",
    "mediaType": "video",
    "selectedArtifactRoles": ["startFrame"]
  },
  "context": {
    "project": {
      "appId": "cubric.vision",
      "projectId": "proj_123",
      "projectName": "Campaign Concepts",
      "schemaVersion": 1
    },
    "sourceOperation": "i2v",
    "sourceModelId": "wan-video"
  },
  "artifacts": [
    {
      "kind": "project-artifact",
      "mediaType": "image",
      "projectId": "proj_123",
      "itemId": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
      "relativePath": "Media/t2i_001.png",
      "sidecarRelativePath": "Media/.meta/6e409682-8b95-4ff7-aa77-e24e7656cbf8.json",
      "displayName": "t2i_001",
      "operation": "t2i",
      "metadata": {
        "role": "startFrame"
      }
    }
  ],
  "timeoutMs": 30000
}
```

## Response Handling Direction

Prompt responses should be applied through existing PromptBox behavior:
- Replace positive and negative prompt text via the future equivalent of
  `injectPrompts({ positive, negative })`.
- Preserve the current model, operation, media chips, and generation queue.
- Treat `USER_CANCELLED` as no-op.
- Treat `APP_UNAVAILABLE`, `CAPABILITY_UNSUPPORTED`, `PERMISSION_DENIED`,
  `VERSION_UNSUPPORTED`, `VALIDATION_ERROR`, `RUNTIME_ERROR`, and `TIMEOUT` as
  normal connector outcomes, not generation failures.

## Explicit V1 Non-Goals

- No live `@cubric/connector` import in Cubric Vision v1.
- No broker process startup, installation scan, named pipe, socket, or
  localhost connector runtime.
- No Cubric Prompt implementation.
- No disabled or promotional Prompt actions in core PromptBox workflows.
- No permission/trust UI in Vision v1.
- No full-project export to Prompt.
- No mutation of Vision project files by Prompt.
- No cross-app write/delete actions.
- No global artifact identity beyond project-local ids and refs.
- No migration of Vision's JavaScript component system to TypeScript for this
  planning item.
