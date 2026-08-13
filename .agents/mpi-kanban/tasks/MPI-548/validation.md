# MPI-548 validation

Pod connected for every case below.

1. **Local-only LoRA, "Run locally" ON** → generation RUNS on the local engine.
   No "isn't installed on the remote Pod" toast, and NO "Preparing the cloud
   engine..." toast (the hot-store preflight must not run for a local dispatch).
2. **Local-only LoRA, toggle OFF** → the guard still fires, with actionable copy.
   It must name the LoRA and must not open the bug-reporter modal.
3. **Pod-only LoRA, toggle ON** → the inverse guard fires: the file is on the Pod,
   not on local disk. Currently untestable, because the list is local-only — this
   case is the proof the fix is genuinely engine-aware and not just permissive.
4. **Model Settings dropdown** reflects the effective engine: switching the toggle
   re-derives the option list and the "missing" styling.
5. **Subfolder LoRA on Windows, local dispatch** → still resolves (separator
   regression check, `routes/comfy.js:985-990`).
6. **Empty asset list** → guard still fails OPEN; the `lora_missing_local`
   backstop at `commandExecutor.js:2184` still catches it at the loader.

Evidence to capture: the `clientLogger` line
`hot-store: N/M file(s) on Pod disk` must be ABSENT in case 1.
