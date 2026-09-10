# MPI-713 checklist

- [x] `MpiMaskPreview` in `img.py`, subclassing `PreviewImage` for the in-graph thumbnail
- [x] Widgets: `color` (native colour picker), `invert_mask` BOOLEAN, `alpha` FLOAT, `index` INT
- [x] Mask resized to the plate when they disagree; mask batch of 1 broadcast over a clip
- [x] Registered in `__init__.py` (class + display name)
- [x] `README.md` row + `changelog.md` bullet
- [x] Offline smoke: colour maths, invert, alpha, index, size mismatch, empty batch
- [x] User tests it live in the bench
- [x] Commit + push `ComfyUi-MpiNodes`
- [~] Pin NOT bumped - peer agent owns it (standing decision from MPI-712)
