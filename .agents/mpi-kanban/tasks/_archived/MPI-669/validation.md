# MPI-669 - validation

**Result: PASSED.** The user confirmed a MiniMax H3 generation succeeded on a fresh
Pod booted from the new image, 2026-08-31.

## Evidence

**The Pod took the new image** - `logs/app.log`, 2026-08-31T19:23:03.781Z:

    [runpod] Pod image for NVIDIA GeForce RTX 5090: docker.io/madponyinteractive/cubric-vision-pod:v0.22.0-dev-cu130

Pod `c8s75tff96l7bt`, EU-RO-1, RTX 5090, volume `2vsdo4kp7q`. The preceding GPU
connect at 18:41:01Z still read `v0.21.0-dev-cu130`, so the app restart plus a
fresh Pod is what moved it - as predicted, neither alone would have.

**The Pod is on the pinned engine** - `GET /system_stats` on the Pod reported
`comfyui_version 0.34.0`, matching `dev_configs/node_lock.json` `comfyui.core.tag`
= `v0.34.0`. It was 0.31.0.

**The missing core node is present** - `GET /object_info/ModelAttentionBackend`
returned the node with `python_module: comfy_extras.nodes_model_advanced`,
confirming it is ComfyUI CORE and that 0.34.0 supplies it. This is the exact
node whose absence rejected `minimax_h3_r2va`, `minimax_h3_fl2va`,
`ltx_i2v_t2v` and `ltx_i2v_t2v_int8`.

**Wrapper** - `/remote/pods/c8s75tff96l7bt/ready` reported `wrapper_version 0.2.44`,
`comfy_ready: true`, `download_mode: false`.

**Generation** - the user ran H3 on this Pod and reported it worked.

## Scope this does NOT cover

- The bump-engine smoke matrix was deliberately not run; it rents a GPU and
  belongs to MPI-595 Gate B. One op is proven, not the matrix.
- The STABLE image pins stay where they already were - `POD_IMAGE_VERSION` and
  `POD_IMAGE_VERSION_CPU`, both `v0.21.0` (`routes/remotePodLifecycle.js:157,191`);
  `d3a10f15` shows both as untouched context lines. A `-dev` tag is unreachable to
  a released user, so a clean release-version image rebuild at ship time is still
  MANDATORY and is Gate B's.

  *Corrected 2026-08-31.* This line first read "v0.17.0", carried over from the
  session handoff and never checked against the file. `v0.17.0` survives only in
  the historical comments above those two constants, which is exactly what makes
  the mistake easy: grepping the file for it hits. Caught by the close-out claim
  auditor. Read the `const`, not the comment.
