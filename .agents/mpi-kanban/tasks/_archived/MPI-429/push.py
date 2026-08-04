# MPI-429 phase 2 — push the 32-dep re-host set to Hugging Face, bandwidth-capped.
#
# Per dep: prefer the copy already on G:/CubricModels; else rclone it down from R2.
# The sha256 gate is free — CommitOperationAdd hashes the file to build the LFS
# pointer, so we compare that digest to the dep's recorded sha256 before uploading.
# HF path == R2 path (vision/models/<comfy-type>/<file>) so phase 3's mirror is a
# host swap. The 9 v1.0.1 files at repo root are NOT touched.
#
# Resumable: re-run skips anything already on HF with a matching oid.
import io, json, os, subprocess, sys, time
from urllib.parse import urlparse

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)  # fileobj path only; no unthrottled fast lane
# hf_xet is installed and would upload through its own Rust client, which never
# touches our fileobj — i.e. no bandwidth cap. Force the classic LFS path.
os.environ["HF_HUB_DISABLE_XET"] = "1"
from huggingface_hub import HfApi
from huggingface_hub._commit_api import CommitOperationAdd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = "Mad-Pony-Interactive/cubric-studio"
LOCAL_ROOT = "G:/CubricModels"
STAGE = os.path.join(HERE, "stage")
RCLONE_CONF = "C:/Users/Fabio/.secrets/rclone-r2.conf"
BUCKET = "cubric-r2:cubric-models"
UP_BPS = int(float(os.environ.get("UP_MB", "3")) * 1024 * 1024)   # HF upload cap
DOWN_MB = os.environ.get("DOWN_MB", "6")                          # rclone --bwlimit
HOLD = {"qwen-lora-headswap"}  # source unidentified — see MPI-429 checklist


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


class Throttle(io.BufferedIOBase):
    """Paces read() to UP_BPS. `on` is False while huggingface_hub hashes the
    file locally (no network) and True for the upload itself."""

    def __init__(self, fh, bps):
        self.fh, self.bps, self.on = fh, bps, False
        self.clock = time.monotonic()
        self.sent = self.mark = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def seek(self, *a):
        return self.fh.seek(*a)

    def tell(self):
        return self.fh.tell()

    def read(self, n=-1):
        b = self.fh.read(n)
        if b and self.on:
            self.clock = max(self.clock, time.monotonic()) + len(b) / self.bps
            delay = self.clock - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self.sent += len(b)
            if self.sent - self.mark >= 1 << 30:
                self.mark = self.sent
                log(f"    ... {self.sent / (1 << 30):.1f} GiB sent")
        return b

    def read1(self, n=-1):
        return self.read(n)

    def close(self):
        self.fh.close()


def rclone(key, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    cmd = ["rclone", "--config", RCLONE_CONF, "copyto", f"{BUCKET}/{key}", dest,
           "--s3-no-check-bucket", "--bwlimit", f"{DOWN_MB}M", "--stats", "60s", "--stats-one-line"]
    return subprocess.run(cmd).returncode == 0


def main():
    token = open("C:/Users/Fabio/.secrets/hf.txt").read().strip()
    api = HfApi(token=token)
    deps = json.load(open(os.path.join(HERE, "rehost.json")))
    deps.reverse()  # smallest first — proves the pipeline before the 13 GB file
    if os.environ.get("MAX"):
        deps = deps[: int(os.environ["MAX"])]

    on_hub = {}
    for f in api.list_repo_tree(REPO, recursive=True):
        oid = getattr(getattr(f, "lfs", None), "sha256", None)
        if oid:
            on_hub[f.path] = oid
    log(f"repo holds {len(on_hub)} LFS files")

    done, skipped, failed = [], [], []
    for i, d in enumerate(deps, 1):
        did, sha = d["id"], d["sha256"].lower()
        path = urlparse(d["url"]).path.lstrip("/")
        head = f"[{i}/{len(deps)}] {did} ({d['size']})"
        if did in HOLD:
            log(f"{head} HOLD — source unidentified, not redistributing")
            skipped.append(did)
            continue
        if on_hub.get(path) == sha:
            log(f"{head} already on HF, oid matches")
            skipped.append(did)
            continue

        local = os.path.join(LOCAL_ROOT, d["filename"] or os.path.basename(path))
        staged = None
        src = local if os.path.isfile(local) else None
        if src:
            log(f"{head} local copy {src}")
        else:
            staged = os.path.join(STAGE, os.path.basename(path))
            log(f"{head} pulling from R2 at {DOWN_MB} MiB/s")
            t0 = time.monotonic()
            if not rclone(path, staged):
                log(f"{head} FAILED rclone")
                failed.append(did)
                continue
            log(f"{head} pulled in {time.monotonic() - t0:.0f}s")
            src = staged

        try:
            fh = Throttle(open(src, "rb"), UP_BPS)
            op = CommitOperationAdd(path_in_repo=path, path_or_fileobj=fh)  # hashes at full speed
            got = op.upload_info.sha256.hex()
            if got != sha:
                # A local copy can be a different build; R2 is the source of truth.
                if staged is None:
                    fh.close()
                    log(f"{head} local sha256 mismatch -> falling back to R2")
                    staged = os.path.join(STAGE, os.path.basename(path))
                    if not rclone(path, staged):
                        log(f"{head} FAILED rclone")
                        failed.append(did)
                        continue
                    fh = Throttle(open(staged, "rb"), UP_BPS)
                    op = CommitOperationAdd(path_in_repo=path, path_or_fileobj=fh)
                    got = op.upload_info.sha256.hex()
                if got != sha:
                    fh.close()
                    log(f"{head} FAILED sha256 gate: R2 bytes {got[:12]} != dep {sha[:12]}")
                    failed.append(did)
                    continue
            log(f"{head} sha256 OK -> uploading at {UP_BPS / (1 << 20):.1f} MiB/s")
            fh.on = True
            t0 = time.monotonic()
            api.create_commit(repo_id=REPO, operations=[op], commit_message=f"mirror {did}")
            fh.close()
            log(f"{head} uploaded in {time.monotonic() - t0:.0f}s")
        except Exception as e:  # keep going; the run is resumable
            log(f"{head} FAILED upload: {type(e).__name__}: {e}")
            failed.append(did)
            continue
        finally:
            if staged and os.path.isfile(staged):
                os.remove(staged)

        # Independent proof: read the oid back off the hub.
        try:
            back = {f.path: getattr(getattr(f, "lfs", None), "sha256", None)
                    for f in api.get_paths_info(REPO, [path])}
            if back.get(path) == sha:
                log(f"{head} VERIFIED on hub")
                done.append(did)
            else:
                log(f"{head} FAILED verify: hub oid {back.get(path)}")
                failed.append(did)
        except Exception as e:
            log(f"{head} verify error {e}")
            failed.append(did)

    log(f"DONE uploaded={len(done)} skipped={len(skipped)} failed={len(failed)}")
    if failed:
        log("failed: " + ", ".join(failed))


if __name__ == "__main__":
    main()
