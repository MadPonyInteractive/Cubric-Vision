# MPI-71 Brief

Investigate Vast.ai as the most viable alternative to RunPod for the Cubric remote engine.

Context: MPI-64 currently targets RunPod Secure Cloud, but recent testing and public sentiment point to worsening GPU availability. TensorDock looked promising on paper, but public review signals raised reliability/support concerns. Vast.ai now appears to be the strongest fallback candidate because it has broad marketplace supply, better public review volume, and stronger evidence of current GPU availability.

Next useful action: run a deeper Vast.ai technical compatibility investigation against MPI-64 requirements: custom Docker startup, persistent storage, ports/WebSocket support, lifecycle API, billing semantics, host filtering, and a minimal ComfyUI wrapper smoke test.
