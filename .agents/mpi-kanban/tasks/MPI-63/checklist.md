# MPI-63 Checklist

- [x] Create CubricVision.app template (Info.plist + Contents/MacOS/CubricVision launcher + Contents/Resources/icon.icns)
- [x] Rename start.command -> start-with-terminal.command
- [x] Wire PLATFORM_CONFIG.darwin: appBundle + start rename
- [x] Dir-aware staging in stagePortableSkeleton + update-bundle launcher loop
- [x] Update macos/README.txt
- [ ] Verify on M4: .app no-terminal launch + terminal variant + Dock icon (needs 0.0.11 build)
