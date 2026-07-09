# MPI-70 Checklist

> Derived from brief.md "Scope (this card)" — no separate plan.md; brief is the plan.

- [ ] Two image profiles from one Dockerfile (base-image ARG → cu124 broad-compat + cu128 Blackwell); pin torch per profile AFTER ComfyUI requirements install; keep universal-node bake + extra_model_paths.yaml identical
- [ ] Per-arch accelerators (sageattention min into both; evaluate flash-attn; cu128 fp8/fp4); verify import + active backend; pin versions / prefer prebuilt wheels (GPU-less buildx guard)
- [ ] CI matrix in cubric-vision-pod-image.yml (both tags from same inputs + cuda profile); push both to public GHCR; keep disk-free step
- [ ] CUDA-version tracking — tag/profile shape so a future cu130 is an additive build, not a rewrite
