#!/usr/bin/env python3
"""MPI-194 hot-store self-check — LRU eviction, adopt-existing, sticky, refuse.
Drives the REAL wrapper functions against a temp volume+disk. No network, no GPU,
no big bytes: files are 1-byte markers and logical sizes come from a SIZES map that
overrides the wrapper's os.path.getsize view (the logic only reads getsize/exists).
Run: python hotstore_selfcheck.py
"""
import asyncio, os, sys, tempfile, importlib.util

WRAPPER = r"c:/AI/Mpi/mpi-ci/cubric-vision-pod/wrapper/wrapper.py"
GB = 10**9
SIZES = {}   # abspath -> logical size in bytes

def _load_wrapper(volume, disk, state):
    for k, v in {"CUBRIC_MODELS_DIR": volume, "CUBRIC_COMFY_MODELS_DIR": disk,
                 "CUBRIC_HOT_STORE_STATE": state, "CUBRIC_TOKEN": "x",
                 "CUBRIC_HOT_STORE_MIN_BYTES": str(15 * GB),
                 "CUBRIC_HOT_STORE_FREE_MARGIN": str(1 * GB)}.items():
        os.environ[k] = v
    spec = importlib.util.spec_from_file_location("wrapper_hs", WRAPPER)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def _mk(volume, subdir, fn, size):
    p = os.path.join(volume, subdir, fn)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(b"\0")           # 1-byte marker
    SIZES[os.path.abspath(p)] = size

async def main():
    root = tempfile.mkdtemp()
    volume = os.path.join(root, "volume"); disk = os.path.join(root, "disk")
    state = os.path.join(root, "hot.json")
    w = _load_wrapper(volume, disk, state)

    _mk(volume, "diffusion_models", "big_A.safetensors", 40 * GB)
    _mk(volume, "diffusion_models", "big_B.safetensors", 30 * GB)
    _mk(volume, "diffusion_models", "huge.safetensors", 60 * GB)

    # Logical getsize: SIZES map if known, else real (covers .part during copy).
    _real_getsize = os.path.getsize
    def logical_getsize(p):
        ap = os.path.abspath(p)
        if ap in SIZES:
            return SIZES[ap]
        return _real_getsize(p)
    w.os.path.getsize = logical_getsize   # wrapper reads os.path.getsize -> patched

    # _hot_copy would copy real bytes; stub it to create a marker at dest with the
    # source's logical size registered (we're testing orchestration, not I/O).
    async def fake_copy(src, dest, rec):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(b"\0")
        SIZES[os.path.abspath(dest)] = SIZES[os.path.abspath(src)]
        return SIZES[os.path.abspath(dest)]
    w._hot_copy = fake_copy

    # Fake a 50GB disk: free = 50GB - sum(logical sizes of files on disk).
    DISK_CAP = 50 * GB
    def fake_free():
        used = 0
        for dp, _, fs in os.walk(disk):
            for fn in fs:
                ap = os.path.abspath(os.path.join(dp, fn))
                used += SIZES.get(ap, 0)
        return DISK_CAP - used
    w._hot_free_bytes = fake_free

    ok = True
    def check(cond, msg):
        nonlocal ok; ok = ok and cond
        print(("PASS" if cond else "FAIL"), msg)
    def on_disk(fn):
        return os.path.exists(os.path.join(disk, "diffusion_models", fn))

    async def ensure(fn, size):
        async with w._hot_lock:
            return await w._hot_ensure_one("diffusion_models", fn, size, "")

    r = await ensure("big_A.safetensors", 40 * GB)
    check(r["staged"] and not r.get("cached"), "big_A staged fresh")
    check(on_disk("big_A.safetensors"), "big_A on disk")

    r = await ensure("big_A.safetensors", 40 * GB)
    check(r["staged"] and r.get("cached"), "big_A re-ensure = cached (sticky, no re-copy)")

    r = await ensure("big_B.safetensors", 30 * GB)
    check(r["staged"], "big_B staged (needs eviction: 40+30 > 50)")
    check(not on_disk("big_A.safetensors"), "big_A evicted (LRU)")
    check(on_disk("big_B.safetensors"), "big_B on disk")
    check("diffusion_models/big_A.safetensors" not in w._hot_state, "big_A dropped from state")
    check(os.path.exists(os.path.join(volume, "diffusion_models", "big_A.safetensors")),
          "big_A VOLUME original untouched by evict")

    w._hot_state.pop("diffusion_models/big_B.safetensors", None); w._hot_save_state()
    r = await ensure("big_B.safetensors", 30 * GB)
    check(r["staged"] and r.get("cached"), "big_B adopted from disk (state lost across boot)")

    r = await ensure("huge.safetensors", 60 * GB)
    check(not r["staged"] and r["reason"] == "insufficient disk",
          "huge (60GB > 50GB disk) refused -> serve from volume")

    print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
    sys.exit(0 if ok else 1)

asyncio.run(main())
