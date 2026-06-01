# Electron JS logo question.  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 270 Legacy column: COMPLETED  ```md ### Electron JS logo question. - defaultExpanded: false
    ```md
    Resolved 2026-05-25 by claude-opus-4.7 as planning chat — folded into the
    cross-platform portable distribution plan.

    Outcome: taskbar icon flicker happens because Windows reads icon from
    process binary PE resource (currently default `electron.exe`) and groups
    apps by AppUserModelID (currently unset). `.bat`/`.vbs` launchers cannot
    be pinned to taskbar — only `.exe` or `.lnk` can.

    Resolution plan (now in docs/plans/2026-04-30-cross-platform-portable-distribution.md):
    - Phase 0.6: AUMID `cubric.studio.vision` set in main.js; generate
      .ico / .icns / .png icon assets from assets/mascot/logo.png.
    - Phase 2.1: drop `.vbs`, use `CubricVision.lnk` as primary Windows
      launcher (pinnable, silent, icon-stable).
    - Phase 2.4: rcedit pass on copied electron.exe → CubricVision.exe with
      Cubric icon + metadata in PE resource.
    - Phase 2.5: `rebrand-dev-logo.bat` + `npm run dev:rebrand` for tutorial
      recording in dev mode (rcedit on node_modules/electron/dist/electron.exe).
    - Phase 3.4: Linux binary rename + .desktop file with StartupWMClass.
    - Phase 4.4: macOS .app bundle rename + .icns swap + Info.plist edit.

    Original question:
    I'd like it that the ElectronJS logo never shows up in the task bar.
    Always our logo should show up. Sometimes I ask these two agents, and
    the logo shows up for a while and then it goes away, and the ElectronJS
    comes back due to something. I think the last thing I did is I tried
    to add it to the taskbar quick items, and it defaulted back to the
    ElectronJS logo.

    It's important that the logo is always displayed because later on, when
    we have other apps, users can reference the task bar to see what app
    they're working on, and as well for a visual aspect of it. Is there
    any way we can treat the bat file the same way that exe files work
    when it comes to logo display and saving it to the taskbar as a quick
    item, or are we constrained? Remember, this app is going to be
    distributed as a portable version only, ok?
    ``` ``` 