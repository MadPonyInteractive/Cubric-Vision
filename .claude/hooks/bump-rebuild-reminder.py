#!/usr/bin/env python3
"""MPI-119 Deliverable B — Stop-event bump/rebuild reminder net.

Advisory, never blocks. At session end (Stop event) it looks at the working-tree
git diff: if any bump/rebuild *trigger* path was touched but no *version field*
changed, it prints ONE summary warning so a forgotten bump/rebuild gets caught.

Trigger paths come from MPI-119 Deliverable A (trigger-table.md). Human/skill
keeps the real judgment call — this is a reminder, not a gate.

Run self-check:  python bump-rebuild-reminder.py --selftest
"""
import json
import re
import subprocess
import sys

REPO = "c:/AI/Mpi/Cubric-Vision"

# Paths whose change historically needs a bump and/or image rebuild (Deliverable A).
# Substring match against `git diff --name-only` output (forward-slash paths).
BUMP_TRIGGERS = [
    "js/core/operationRegistry.js",
    "js/data/commandRegistry.js",
    "operation_registry.json",
    "js/data/modelConstants/models.js",
    "js/data/modelConstants/universal_workflows.js",
    "js/data/modelConstants/dependencies.js",
    "js/components/Organisms/MpiPromptBox/",
    "comfy_workflows/",
    "dev_configs/system_dependencies.json",
    "dev_configs/node_lock.json",
    "scripts/build-portable.mjs",
]
REBUILD_TRIGGERS = [
    "dev_configs/node_lock.json",          # Pod + Builder both consume the lock
    "comfy_workflows/",                    # only if a NEW node is introduced
    "dev_configs/system_dependencies.json",
]
# Editing any of these = the bump itself happened; suppress the warning.
VERSION_FILES = [
    "js/core/appVersion.js",
    "package.json",
    "package-lock.json",
]


def changed_paths():
    """Working-tree + staged changed paths, forward-slash, relative to repo."""
    out = subprocess.run(
        ["git", "-C", REPO, "diff", "--name-only", "HEAD"],
        capture_output=True, text=True,
    )
    return [p.strip().replace("\\", "/") for p in out.stdout.splitlines() if p.strip()]


def analyze(paths):
    """Pure core (testable): -> (bump_hits, rebuild_hits, version_touched)."""
    def hits(triggers):
        return sorted({t for t in triggers for p in paths if t in p})
    bump = hits(BUMP_TRIGGERS)
    rebuild = hits(REBUILD_TRIGGERS)
    version_touched = any(v in p for v in VERSION_FILES for p in paths)
    return bump, rebuild, version_touched


def build_message(bump, rebuild, version_touched):
    """-> warning string, or None if nothing to warn about."""
    if version_touched:
        return None  # a bump clearly happened — don't nag
    if not bump and not rebuild:
        return None
    lines = ["⚠️  MPI-119 bump/rebuild reminder — trigger paths changed, no version field touched:"]
    if bump:
        lines.append("  • Likely needs a VERSION BUMP (run /mpi-version-bump): " + ", ".join(bump))
    if rebuild:
        lines.append("  • May need an IMAGE REBUILD (run /build-pod-image): " + ", ".join(rebuild))
    lines.append("  Confirm before closing the card. (advisory only — see trigger-table.md)")
    return "\n".join(lines)


def main():
    try:
        json.load(sys.stdin)  # Stop event payload; we don't need its fields
    except Exception:
        pass
    msg = build_message(*analyze(changed_paths()))
    if msg:
        print(msg, file=sys.stderr)  # surfaced to the user, non-blocking
    sys.exit(0)  # NEVER block


def _selftest():
    # version touched -> suppressed even with triggers present
    assert build_message(*analyze(["js/data/modelConstants/models.js", "package.json"])) is None
    # bump trigger, no version -> warns, bump line present, no rebuild line
    m = build_message(*analyze(["js/data/modelConstants/models.js"]))
    assert m and "VERSION BUMP" in m and "IMAGE REBUILD" not in m
    # node_lock -> both bump and rebuild lines
    m = build_message(*analyze(["dev_configs/node_lock.json"]))
    assert m and "VERSION BUMP" in m and "IMAGE REBUILD" in m
    # unrelated file -> silent
    assert build_message(*analyze(["README.md"])) is None
    # comfy_workflows substring match
    m = build_message(*analyze(["comfy_workflows/t2i_new.json"]))
    assert m and "IMAGE REBUILD" in m
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
