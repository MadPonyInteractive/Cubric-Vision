# Checklist

- [x] Add separate persisted extras config for `loras` and `upscale_models`.
- [x] Refactor YAML writing through a pure `buildExtraModelPathsYaml(basePath, extras)` path.
- [x] Add `GET/POST /comfy/extra-folders` and preserve extras across `set-path` changes/clears.
- [x] Union primary + extra folder scans while keeping `/comfy/list-files` response stable.
- [x] Preserve raw filenames for user-selected upscalers outside the registry.
- [x] Refresh LoRA/upscaler asset state after folder edits.
- [x] Add uninstall guards that cannot delete extra-folder model files.
- [x] Add Settings UI controls for LoRA and upscaler extra folders.
- [x] Add focused backend smoke coverage plus desktop verification.

## Derived

- [x] Implementation
