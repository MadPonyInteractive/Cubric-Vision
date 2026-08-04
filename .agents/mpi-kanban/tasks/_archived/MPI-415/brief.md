# MPI-415 — a fatal engine startup crash is reported to the user as a timeout

Found live on Linux 2026-07-31 while proving MPI-198. **The headline is not the
CPU** — it is that two completely unrelated fatal crashes both reached the user as
the same generic "server failed to become ready in time".

## The defect

| real cause | what the app told the user |
|---|---|
| `ModuleNotFoundError: No module named 'sqlalchemy'` (MPI-414 aftermath, 01:56Z) | `ComfyUI server failed to become ready in time.` |
| `Fatal Python error: Illegal instruction` (SIGILL, 02:21Z) | *(identical — the run timed out the same way)* |

In both cases ComfyUI died in **under a second**. The app then waited out its
full readiness timeout and reported running out of patience. The actual traceback
was in `app.log` the whole time; it never reached the UI.

`ensureServerRunning` (`js/services/comfyController.js:393`) polls for readiness
and throws on timeout. It does not distinguish "the child process is gone" from
"the child is still starting". A process that has already exited is knowable
immediately and is not a timeout.

This is the same family as MPI-414: the health signal does not reflect whether the
engine actually works.

## Fix direction

Capture the engine child's exit (code/signal) and its last error lines, and
surface **that** instead of the timeout. If the process is dead, fail fast with
the real reason rather than waiting out the clock. Every future unknown startup
cause then reports itself.

Optional add-on once the above exists: a CPU capability preflight at engine
provision that names the old-hardware case up front instead of leaving it to be
inferred from a traceback.

## The crash that exposed it

ComfyUI **core** cannot start on a pre-AVX2 x86_64 CPU:

```
Fatal Python error: Illegal instruction
  kornia_rs/__init__.py line 1
  <- kornia/io/io.py:24 <- kornia/io/__init__.py:18
  <- kornia/utils/image_print.py:34 <- kornia/filters/kernels.py:27
  <- kornia/__init__.py:20
  <- comfy_extras/nodes_post_processing.py:9 <- comfy_extras/nodes_latent.py:2
  <- nodes.py:2247 load_custom_node <- nodes.py:2515 init_builtin_extra_nodes
```

That chain is ComfyUI core via `init_builtin_extra_nodes`, **not** a custom node,
so there is no node-level opt-out. Measured on an Intel i3-2367M (Sandy Bridge,
2011): flags include `avx`, and lack `avx2` and `fma`. `kornia_rs 0.1.14` is built
above that baseline and SIGILLs at import. `kornia_rs 0.1.9` imports clean and
ComfyUI then binds 8188 in 55s.

torch itself is fine — it dispatches SIMD at runtime. Only the statically-compiled
Rust wheel is affected.

## Explicitly REJECTED: pinning kornia_rs globally

`kornia_rs` is pulled in by ComfyUI core, so a global pin penalises **every user on
every platform** to accommodate 2011 hardware, and it fights the dependency-drift
class that MPI-413 and MPI-217 are about. The 0.1.9 pin applied during the MPI-198
run was **test-box only** — no repo change, no engine change.

## Do NOT publish a hardware requirement from this yet

The ISA floor is **not confirmed**. What is measured: the wheel SIGILLs on a CPU
that has `avx` but lacks `avx2`/`fma`. AVX2 (`x86-64-v3`) is the likely floor
because it is the common Rust release target, but it could be FMA or BMI2 that
trips it. `objdump` is not installed on the box, so it was not verified.

Confirm by disassembling the wheel before any docs-site claim — `pip install
capstone` into the engine venv and scan `kornia_rs*.so` for the instruction
families present. Publishing an inferred number is exactly how MPI-406's changelog
claim got written and then pulled.

Scope note if it is published: this is **not Linux-specific**. The same package is
pulled through ComfyUI core on Windows x86_64 too. macOS arm64 is a different
architecture and unaffected.

## Blast radius

The timeout-masking half: **all platforms, all users** — any engine that dies at
startup for any reason. The SIGILL half: pre-2013 Intel / pre-2015 AMD x86_64,
Windows and Linux.
