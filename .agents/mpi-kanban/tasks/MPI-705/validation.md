# MPI-705 — validation

## What was uploaded

`cubric-models`, public host `https://models.cubric.studio/`, layout
`vision/models/<comfy-relative filename>` — the invariant the capability README states
and the one `_mirrorUrlsFor` derives, so nothing here was typed by hand.

| object | bytes | sha256 (as shipped in assetDeps.js) |
|---|---|---|
| `vision/models/checkpoints/stable_audio_3_medium.safetensors` | 9222116660 | `48d9c65e…d8ce0b5` |
| `vision/models/checkpoints/stable_audio_3_small_sfx.safetensors` | 2270384940 | `ed9cf1b6…1e2f515` |
| `vision/models/text_encoders/t5gemma_b_b_ul2.safetensors` | 1187264003 | `1e1eba25…cd8150e` |

Sources were the bench store at `C:/AI`, deliberately outside `G:/CubricModels`: an
upload source inside the app's models root can be swept to trash mid-run, and rclone
re-opens the source by name at the END to checksum it, so a vanished source makes it
DELETE what it just uploaded (the MPI-653 failure, 24.55GB and 2.3 hours).

Serialized `--transfers 1`, capped `--bwlimit 3M`, logged to file rather than a TTY
progress bar. Fabio cancelled the in-app download first so no transfer competed.

## Evidence

- `rclone lsl` on both prefixes: all three present, byte-exact against `bytes`.
- Public route, `HEAD` on `models.cubric.studio`: **200** on all three, and
  `content-length` byte-exact. Verified with node's client, not curl — curl in this
  shell dies with `(43) A libcurl function was given a bad argument` during TLS
  renegotiation against that host, on a KNOWN-GOOD object too, so it is a client quirk
  and not a hosting fault. Anything checking these URLs from a Git Bash shell will see
  the same and should not read it as a broken mirror.
- `npm run release:deps`: **All 305 URLs reachable**, and the three deps no longer
  appear in the single-route list.
- Write access was proved first with a 6-byte probe object, then deleted — never with
  the 8.59GB file.

## Licence position

Redistribution is granted outright by both agreements, and MPI-694 already discharges
the conditions, so the mirror adds no obligation:

- **Stability AI Community License** §§II/III grant "use, reproduce, distribute" for a
  Commercial Purpose, subject to §IV(a): copy of the Agreement provided, `Notice` file
  shipped, "Powered by Stability AI" displayed. All three live in
  `licences/stable-audio-3/` and in the gate.
- **Gemma Terms** §3.1 grant reproduction and Distribution on four conditions: a copy
  provided (bundled), no modified files (we modify nothing), the `Notice` string
  (shipped), and §3.2 as an enforceable provision in our own terms — the one still
  open, and open on MPI-694 whether or not we mirror.
- Upstream `Comfy-Org/stable-audio-3` is ungated, `license: other` /
  `license_name: stable-audio-community`.

## Not done here

The HF urls are KEPT as `mirrorUrl`, not deleted. A url is baked into whichever app
version shipped with it, so the origin stays reachable for anyone mid-download or on an
older build.
