# R2 upload — Cloudflare hosting for pre-release builds

Uploads the 6 build artifacts + an `index.html` to the Cloudflare R2 bucket so
Pro (then Early Access) can download. The **path** to upload to is decided by
`link-model.md` — read that first.

## Tooling (paths only — NEVER read the secret)

- Bucket: `cubric-builds`. Public host: `https://dl.cubric.studio/`.
- rclone binary: `C:\Users\Fabio\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.74.3-windows-amd64\rclone.exe`
- rclone config: `C:\Users\Fabio\.secrets\rclone-r2.conf` (remote name `cubric-r2`)
- Secrets live in `C:\Users\Fabio\.secrets\` — referenced, never opened, never
  copied into any repo.

`--s3-no-check-bucket` is required on every call — the scoped R2 token can't
create/check the bucket even though it can upload objects.

## index.html

Each link has one `index.html` listing both download routes. Build it by copying
the **previous** version's index and swapping version, filenames, byte sizes, and
a one-line "what's new". Two sections:

- **Update from a prior version** — lists the 3 `-update-<ver>.zip` delta bundles
  + the `update-from-zip.<bat|sh|command>` steps (preserves
  engine/models/projects/settings). Do **not** tell users to use the in-app /
  online `update.*` script for a pre-release — that pulls the latest *GitHub*
  release, where this build is not published; if a later public release exists it
  would downgrade them.
- **Fresh install** — lists the 3 full builds.

**The index copy is user-facing → it goes through the copy-review gate**
(`copy-review.md`). Keep it tier-neutral: never say "Pro" in the page text or the
path (the same page serves Early Access later).

## Upload (STOP — user-authorized live op)

For each of the 6 artifacts + index.html:

```bash
RCLONE="/c/Users/Fabio/AppData/Local/Microsoft/WinGet/Packages/Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe/rclone-v1.74.3-windows-amd64/rclone.exe"
CONFIG="/c/Users/Fabio/.secrets/rclone-r2.conf"
DEST="cubric-r2:cubric-builds/vision/v<major>.<minor>-<hex>"

"$RCLONE" --config "$CONFIG" copyto "<LOCAL_FILE>" "$DEST/<FILE_NAME>" \
  --s3-no-check-bucket --progress
```

(PowerShell form is in `capabilities/cloudflare-r2/README.md` if a `&`-invocation
is easier on this host.)

## Verify

```bash
"$RCLONE" --config "$CONFIG" lsf "$DEST/" --s3-no-check-bucket
```
Then HTTP HEAD each public URL and confirm `200` with `Content-Length` matching
local bytes:
```bash
curl -sI "https://dl.cubric.studio/vision/v<major>.<minor>-<hex>/<FILE_NAME>" | head -5
```
The user should also open the link in a browser/private window and confirm a
download starts.

## Approval gates (from the R2 capability doc)

Explicit user approval before: uploading paid-member files, replacing live files,
**deleting** files, and publishing the link anywhere. Deletion (link GC at a
promote) is double-gated — get an explicit yes before any `rclone delete`.
Publishing the link on Patreon/Discord is the user's manual step, not these
skills'.

## Delete (link GC — only mpi-merge-branches, double-gated)

```bash
"$RCLONE" --config "$CONFIG" purge "cubric-r2:cubric-builds/vision/<old-minor-link>/" \
  --s3-no-check-bucket
```
Only after the user confirms the prior version is live on GitHub (so no tier
loses its source — see `link-model.md`).
