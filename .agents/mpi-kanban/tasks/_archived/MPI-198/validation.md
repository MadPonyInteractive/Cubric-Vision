# MPI-198 Validation

## LIVE-VERIFIED on Linux — 2026-07-31T02:40:07Z

The loader-path heal fired on a **real Linux host with a LOCAL engine**. This was
the one genuinely untested input in the fix: whether `_serverPlatform` reads
`linux` on a real Linux box so `_needsPathHeal` takes the new line-93 branch
(`_serverPlatform !== '' && !== 'win32'`) instead of the remote branch at line 92
that every Pod run has always taken.

### Evidence — read from ComfyUI's own `/history`, not from the client

`prompt_id d9ad18a3-989e-413e-adc6-90bb582c8faf`

| | value |
|---|---|
| template bakes (`comfy_workflows/wan5b_t2v.json:120`) | `wan-2.2-5b\Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors` |
| ComfyUI enumerates (`/object_info/LoraLoaderModelOnly`) | `wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors` |
| **ComfyUI RECEIVED** (node 61, `LoraLoaderModelOnly`) | `wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors` |

Backslash in, forward slash out. Pulled from the server's stored prompt, so it is
what ComfyUI received — not what the renderer believed it sent.

Unhealed, that value is `value_not_in_list` at `/prompt` validation and execution
never starts. What actually happened:

```
[02:40:07.860] [comfy] got prompt
[02:40:07.914] [comfy] !!! Exception during processing !!! Error while deserializing header: header too small
                       nodes.py:831 load_vae -> comfy/utils.py:133 safetensors.safe_open
[02:40:07.962] [comfy] Prompt executed in 0.09 seconds
```

`got prompt` = the graph passed validation and was queued. Execution then died at
`VAELoader` on a zero-byte placeholder — **the designed outcome**, and it happens
strictly after validation, so it does not weaken the claim. The other three loader
values (`unet_name`, `clip_name`, `vae_name`) are flat filenames with no separator
and were never at risk.

### Method — zero download, zero compute

`isCompleteOnDisk` (`routes/downloadCompletion.js:16-18`) is **existence-only** —
no size, no hash — and ComfyUI validates `value_not_in_list` as enum membership at
`/prompt` *before* reading any weight. Four zero-byte `.safetensors` at the right
paths therefore make the app treat Wan 2.2 5B as installed, the dispatch validates
for real, and the `200` + prompt_id is the proof.

Wan 2.2 5B was chosen over Klein and Krea 2 because it needs the fewest files
(4 vs 15 vs ~19), not because it is smallest to download — nothing was downloaded.
Klein's 8 style LoRAs would all have to exist or a missing placeholder becomes
indistinguishable from a heal failure.

**The four placeholders were deleted immediately after this run** — install state
is existence-only, so leaving them would make the app believe Wan 2.2 5B is
installed forever.

### Machine and build

ThinkPad X121e, Ubuntu 22.04, Intel i3-2367M, no NVIDIA driver → engine resolved
`--cpu`. Extract `/home/mad-pony/Downloads/CubricVision-linux-x64-v1.3.0`, CI run
`30589473208`. Driven entirely over `ssh linuxbox`; the single Generate click was
the user's, because the heal is renderer code and a server-side call would bypass
the line under test.

## Caveat — this box needed a non-shipping pin to boot ComfyUI at all

**Do not read this run as proof that the stock engine boots on this hardware.**
It does not. See MPI-415.

ComfyUI core could not start: `kornia_rs 0.1.14` dies with
`Fatal Python error: Illegal instruction` (SIGILL) at import, reached through
`nodes.py init_builtin_extra_nodes` -> `comfy_extras/nodes_post_processing.py` ->
`kornia/__init__.py` -> `kornia/io/io.py` -> `kornia_rs`. That is ComfyUI **core**,
not a custom node, so no node-level workaround exists.

Cause is the CPU: i3-2367M (Sandy Bridge, 2011) has `avx` but **no `avx2`, no
`fma`**. The wheel is built above that baseline. The exact ISA floor is
**unconfirmed** — `objdump` is not on the box — so no hardware requirement should
be published from this run without disassembling the wheel first.

Worked around **on the test box only** with
`pip install --no-deps kornia_rs==0.1.9`, which imports clean and let ComfyUI bind
8188 in 55s. No repo change, no engine change, nothing downgraded for any user.

This is also what caused the earlier "engine repaired and booting" claim to be
wrong: `main.py --cpu` prints `Device: cpu` early, then dies ~0.5s later at
extra-node import, so watching the first lines reads as success while the port
never binds.
