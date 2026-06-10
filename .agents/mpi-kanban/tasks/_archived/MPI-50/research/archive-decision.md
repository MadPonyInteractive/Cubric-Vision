# Archive Decision

Date: 2026-06-10

Decision: reject and archive MPI-50.

Reason: Triton/SageAttention is too fragile for Cubric's product surface. The potential speed gain is not reliable enough to justify the install and support burden, especially because SageAttention workflow nodes hard-fail when the required packages are missing. That would put macOS, non-NVIDIA, unsupported NVIDIA, and failed-install users at risk of broken workflows rather than merely missing an optimization.

Additional concern: the user has personally seen workflows where enabling SageAttention caused black-screen output or quality regressions. That makes it unsafe as a default engine or workflow dependency.

Conclusion: keep Cubric's default ComfyUI engine and canonical workflows portable. Do not pursue Triton/SageAttention readiness unless a future upstream path becomes clearly cross-platform, fallback-safe, and quality-stable.
