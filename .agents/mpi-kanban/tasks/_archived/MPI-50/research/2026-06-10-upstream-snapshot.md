# 2026-06-10 Upstream Snapshot

## Triton Windows

- `woct0rdho/triton-windows` is archived as of 2026-02-18.
- The archived repo points users to `triton-lang/triton-windows` for ongoing development.
- The maintained Windows repo claims Windows 10/11 NVIDIA support, `triton.jit` and `torch.compile` support, and recent wheels with bundled CUDA toolchain and TinyCC.
- PyTorch/Triton minor versions are coupled. The README lists PyTorch 2.7 -> Triton 3.3, 2.8 -> 3.4, 2.9 -> 3.5, 2.10/2.11 -> 3.6, and 2.12 -> 3.7.
- GPU support is architecture-gated. RTX 30/40/50 are first-class; GTX 16/RTX 20 need older Triton 3.2 for current upstream support; GTX 10/Pascal and older are unsupported.
- Embedded-Python ComfyUI installs must call the embedded Python directly. The repo warns against invoking a random `pip` from PATH.

## SageAttention

- Upstream `thu-ml/SageAttention` targets CUDA/NVIDIA workflows and requires `python>=3.9`, `torch>=2.3.0`, `triton>=3.0.0`, and CUDA floors by GPU generation.
- `woct0rdho/SageAttention` provides Windows wheels intended to simplify ComfyUI use.
- The Windows fork says recent wheels use Python stable ABI (`cp39-abi3`) and support Python >= 3.9, but wheel selection still needs to match the PyTorch minor version.
- The Windows fork says ComfyUI usage is via `--use-sage-attention`.
- The Windows fork warns that some models, including Wan and Qwen-Image, may produce black/noise output due to SageAttention quantization overflow, and suggests model/node-specific mitigation.

## ComfyUI

- Current ComfyUI CLI args include `--use-sage-attention`, `--use-flash-attention`, `--use-pytorch-cross-attention`, and `--enable-triton-backend`.
- In Cubric, ComfyUI launch args are centralized in `routes/comfy.js`; platform install/provisioning is centralized in `routes/engine.js` and `routes/platformEngine.js`.

## WaveSpeedAI

- WaveSpeedAI's ComfyUI plugin is an API-backed custom node package requiring a WaveSpeed API key.
- It exposes cloud/serverless models through ComfyUI nodes rather than accelerating Cubric's local ComfyUI runtime.
- This should be evaluated as a separate optional cloud provider/product feature, not as a direct replacement for local Triton/SageAttention acceleration.

## Working Conclusion

Do not ship Triton/SageAttention in the base engine. The viable path, if any, is an explicit optional NVIDIA accelerator lane with hard eligibility checks, version pins, rollback, and separate workflow validation.
