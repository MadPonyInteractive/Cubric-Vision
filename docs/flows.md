# Flows — MOVED to the add-flow playbook

> The flows subsystem documentation is now a **playbook**:
> **[docs/playbooks/add-flow/README.md](playbooks/add-flow/README.md)** (hub + section files).
> Read the README first, then the section for the step you're on.

This file is a pointer only — do not add content here.

| Topic | Section |
|---|---|
| FlowDef + the op in 4 files, no-model / multi-model flows, declared `fields` | [01-descriptor-and-ops.md](playbooks/add-flow/01-descriptor-and-ops.md) |
| Polymorphic media slots, path-reading input nodes, injection routing, self-gating outputs, multi-output, the audio-slot traps | [02-media-io.md](playbooks/add-flow/02-media-io.md) |
| Flow inputs → `.preview-assets` store, sidecar `flowId`/`flowInputs`, reuse routing | [03-storage-and-reuse.md](playbooks/add-flow/03-storage-and-reuse.md) |
| MpiBaseFlow / MpiFlowLibrary, install progress, Ctrl+Enter, overlay z-order + status bar, dev-gate | [04-overlay-and-shell.md](playbooks/add-flow/04-overlay-and-shell.md) |
| Definition of Done | [05-verify.md](playbooks/add-flow/05-verify.md) |
| The `preview` image — one asset, three placements; the 4/5 rule, the plate→composite pipeline | [06-preview-image.md](playbooks/add-flow/06-preview-image.md) |
