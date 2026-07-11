# 06 — Verify (Definition of Done)

> Part of the [add-model playbook](README.md). Cited as "§7" in code comments
> (`generationService.js`) — this is that section.

1. **Parse + cross-reference** (no app needed):
   ```bash
   node --input-type=module -e "import {DEPS} from './js/data/modelConstants/dependencies.js'; import {MODELS} from './js/data/modelConstants/models.js'; const m=MODELS.find(x=>x.id==='<id>'); m.dependencies.forEach(d=>{if(!DEPS[d])throw new Error('missing dep '+d)}); console.log('OK')"
   ```
2. **Workflow files exist** in `comfy_workflows/` and their loader paths match dep
   filenames (see [01-workflow-split.md](01-workflow-split.md) § loader paths).
3. **Upload verified** via HTTP HEAD (see [02-dependencies-r2.md](02-dependencies-r2.md))
   and **no `sha256: null`** remains.
4. **Launch the app**, confirm the model card appears, the quality tiers are the
   right set, and (best) run one gen per op.
