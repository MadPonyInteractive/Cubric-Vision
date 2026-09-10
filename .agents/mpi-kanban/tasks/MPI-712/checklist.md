# MPI-712 checklist

- [x] `MpiPacker2` / `MpiUnpacker2` (`_count = 2`) in `switches.py`, registered in `__init__.py`
- [x] `MpiAspectRatio`: `RETURN_NAMES` `ratio` -> `string`
- [x] `MpiAspectRatio`: second output, `MPI_PACK`, appended at the END (saved workflows keep slot 0)
- [x] `README.md` rows + `changelog.md` bullets
- [x] Import smoke: node classes load, pack round-trips through unpack
- [x] Commit + push `ComfyUi-MpiNodes` (also carries the unpushed 20a8d4d Bernini commit)
- [~] `dev_configs/node_lock.json` pin -> NOT bumped, handed to the peer agent (user call 2026-09-10, ongoing node work)
