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
MPINODES = "c:/AI/Mpi/ComfyUi-MpiNodes"  # first-party node pack — a SEPARATE repo

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


def mpinodes_state():
    """Impure probe -> (dirty, unpushed, pin, head). Any piece may be None if unknown.

    ComfyUi-MpiNodes is symlinked into custom_nodes on this dev machine and the engine
    drift check skips it on a source run, so node edits work locally with no commit, no
    push and no pin bump — and reach no user. This catches that. No network (no fetch);
    `unpushed` compares against the last-known remote-tracking ref.
    """
    def git(*a):
        r = subprocess.run(["git", "-C", MPINODES, *a], capture_output=True, text=True)
        return r.stdout.strip() if r.returncode == 0 else None

    head = git("rev-parse", "HEAD")
    if not head:
        return None, None, None, None  # repo absent — silent
    dirty = bool(git("status", "--porcelain"))
    upstream = git("rev-parse", "@{u}")
    unpushed = bool(upstream) and upstream != head
    try:
        with open(REPO + "/dev_configs/node_lock.json", encoding="utf-8") as fh:
            pin = json.load(fh)["nodes"]["ComfyUI-MpiNodes"]["commit"]
    except Exception:
        pin = None
    return dirty, unpushed, pin, head


def build_mpinodes_message(dirty, unpushed, pin, head):
    """Pure core (testable): -> warning string, or None."""
    if head is None:
        return None
    bad = []
    if dirty:
        bad.append("  - uncommitted changes in ComfyUi-MpiNodes")
    if unpushed:
        bad.append("  - HEAD is not the pushed origin ref (push, or fetch if merely stale)")
    if pin and pin != head:
        bad.append("  - node_lock pin %s != MpiNodes HEAD %s" % (pin[:8], head[:8]))
    if not bad:
        return None
    return "\n".join(
        ["!  MpiNodes sync - the node pack and the app's pin disagree (run /mpi-nodes-sync):"]
        + bad
        + ["  A node change ships only when committed -> pushed -> pinned in dev_configs/node_lock.json."]
    )


def main():
    try:
        json.load(sys.stdin)  # Stop event payload; we don't need its fields
    except Exception:
        pass
    for msg in (build_message(*analyze(changed_paths())),
                build_mpinodes_message(*mpinodes_state())):
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
    # MpiNodes: everything in sync -> silent
    assert build_mpinodes_message(False, False, "a" * 40, "a" * 40) is None
    # repo absent -> silent
    assert build_mpinodes_message(None, None, None, None) is None
    # pin behind HEAD -> warns with both short shas
    m = build_mpinodes_message(False, False, "a" * 40, "b" * 40)
    assert m and "aaaaaaaa" in m and "bbbbbbbb" in m
    # dirty + unpushed, pin equal -> still warns, no pin line
    m = build_mpinodes_message(True, True, "a" * 40, "a" * 40)
    assert m and "uncommitted" in m and "not the pushed" in m and "!=" not in m
    # unreadable lock -> pin unknown, no false pin claim
    assert build_mpinodes_message(False, False, None, "b" * 40) is None
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
