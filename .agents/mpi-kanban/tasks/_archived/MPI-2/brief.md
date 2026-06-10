# In-app error reporter - add stage/build GitHub labels

Split from the original cross-repo card "In-app error reporter - stage-aware GitHub Issues routing".

## Local Cubric-Vision Scope

The app already has an in-app error dialog that creates GitHub Issues through `/github/create-issue`. This task keeps only the Cubric-Vision implementation slice:

- Detect the app build stage (`alpha`, `beta`, or `release`) from an explicit build/env/config source.
- Include stage, app version, and build hash/commit metadata in the issue request/body where available.
- Add GitHub labels to app-created issues: `stage:<alpha|beta|release>`, `auto-report`, and a build/version label.
- Keep existing log capture and manual summary behavior intact.

## Out Of Scope

Discord channel policy, tester-room workflow, GitHub Discussions setup, tier labels, Trello routing, and Discord/GitHub cross-links now live in the MadPony-Identity board:

- MadPony-Identity MPI-23 - Cubric bug-report workflow - Discord repro to GitHub record
- MadPony-Identity MPI-24 - Cubric feature requests - GitHub Discussions canonical workflow
