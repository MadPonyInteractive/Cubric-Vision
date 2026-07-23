# Investigation: Crop apply + divisible round-up (image + video)

## IMAGE — MpiCanvasViewer._runCrop (~661)
- `const rect = canvas.getCropRect()` (abs px {x,y,w,h}) → POST /project/crop-media with x,y,w,h (line 677).
- Source dims: `canvas.img?.naturalWidth / naturalHeight` (img proxy on canvas.el; CropManager.init uses these).
  CropManager._imgW/_imgH NOT exposed via getter (could add getSourceDimensions(), but canvas.img simpler).
- Inject rounding between 662 and the fetch. Guarantee x+w<=srcW (clamp bound = srcW-rect.x).

## Server /project/crop-media (routes/projects.js ~2106)
- sharp.extract({left:round(x),top:round(y),width:round(w),height:round(h)}). NO overflow clamp —
  Sharp throws if rect exceeds source. Passing rounded ints crops exactly. Client must keep within bounds.

## VIDEO — MpiGroupHistoryBlock._handleCropSaveVideo (~1268)
- `viewer.el.getCropRect()` returns NORMALIZED 0..1 (MpiVideoViewer→cropTool._normRect). POST /api/video/crop
  cropRect{x,y,width,height} as fractions (1282).
- Source dims: currentItem.pixelDimensions{w,h} (ffprobe-populated, authoritative). Or videoEl.videoWidth
  (less robust, may be 0 pre-metadata).

## cropTool.js (video)
- Normalized [0..1] throughout. _lockedRatio px-space float, converted to norm via _contentAspect().
  getRect() returns _normRect. Round-up must convert norm→abs px (need src dims), round, convert back to norm.

## Server /api/video/crop (routes/videoCrop.js ~71)
- snapEven = max(2, floor(n/2)*2). cropW/H = snapEven(frac*srcMeta.w/h). Floors to even (libx264). Does
  NOT round up to 16. Client round-up then re-quantized DOWN by snapEven → CONFLICT.
- FIX: add optional `absoluteCropPx{x,y,w,h}` body field; when present use directly, SKIP snapEven
  (multiples of 16 already even). Else unchanged. videoCrop.js is in THIS repo, not the Pod.

## Shared helper (new js/utils/cropRounding.js)
```
roundToDivisible(value, n, max):
  up = ceil(value/n)*n; down = floor(value/n)*n
  return max(n, up <= max ? up : down)
```
- W: roundToDivisible(rect.w, N, srcW - rect.x); H: roundToDivisible(rect.h, N, srcH - rect.y).
- Bound is src-minus-origin so x+w never exceeds source.
