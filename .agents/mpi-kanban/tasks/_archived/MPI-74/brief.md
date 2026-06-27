# MPI-74 Brief — Per-model engine routing (hybrid local + cloud)

Run image generation on the LOCAL engine and video generation on the CLOUD Pod within ONE project, with automatic asset handoff (image → image-to-video) and no manual ferrying.

Depends on MPI-64 (RunPod Remote Engine) shipping as a solid binary local↔cloud switch first.

Replaces today's single global remote-mode flag with a per-generation engine resolver, keyed initially by model mediaType (video → cloud, image → local) with optional per-model override later.

Two-instance approach was considered and REJECTED: it splits the project across two app instances (project.json cannot be safely shared by two server processes), which kills the in-project image → video handoff that is the whole point.

See `research/hybrid-engine-routing.md`.
