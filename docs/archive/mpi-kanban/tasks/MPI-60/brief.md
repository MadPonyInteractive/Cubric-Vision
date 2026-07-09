# MPI-60 Brief

Apple Silicon machines report no discrete VRAM, so the status-bar memory monitor shows a broken-looking `0.0 / 0 GB` VRAM gauge. Hide the VRAM row when the backend identifies Apple unified memory/no discrete VRAM, while preserving RAM and normal discrete GPU VRAM behavior.
