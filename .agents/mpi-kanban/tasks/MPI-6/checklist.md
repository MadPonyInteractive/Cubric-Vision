# Checklist

- [ ] Add separate persisted extras config for `loras` and `upscale_models`.
- [ ] Refactor YAML writing through a pure `buildExtraModelPathsYaml(basePath, extras)` path.
- [ ] Add `GET/POST /comfy/extra-folders` and preserve extras across `set-path` changes/clears.
- [ ] Union primary + extra folder scans while keeping `/comfy/list-files` response stable.
- [ ] Preserve raw filenames for user-selected upscalers outside the registry.
- [ ] Refresh LoRA/upscaler asset state after folder edits.
- [ ] Add uninstall guards that cannot delete extra-folder model files.
- [ ] Add Settings UI controls for LoRA and upscaler extra folders.
- [ ] Add focused backend smoke coverage plus desktop verification.
