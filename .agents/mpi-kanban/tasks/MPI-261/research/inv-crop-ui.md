# Investigation: Crop tool UI (Ratio/Free + divisible input)

## MpiToolOptionsCrop.js `family` touchpoints
- DEFAULTS.family (29) 'free'; FAMILY_VALUES (34) {sdxl,flux,social,free}; coerceSettings (38);
  FAMILIES (49-54); _ratioOptionsFor (62-69, social branch); _resolveRatio (73-82, free/social branches);
  _mountOrientation (154-181, visible = sdxl||flux); _mountRatios (183-204, visible = !free);
  familyRadio.on('select') (210-235); persist('family') (231).
- Minimal edits: FAMILY_VALUES→{ratio,free}; FAMILIES→2 items; coerceSettings drop social;
  _ratioOptionsFor(orientation) reads flat CROP table; _resolveRatio drop social; _mountOrientation
  visible when family==='ratio'; simplify select handler to fallback; add DEFAULTS.divisible_by:16 +
  _divisible_by state + MpiInput mount + persist.

## CSS (MpiToolOptionsCrop.css)
- Classes: __section, __section-label, __family (flex center), __orientation, __ratios (width 100%),
  __actions (flex wrap center). 2-option radio reuses __family fine. Divisible input: reuse __actions
  or add `.mpi-tool-options-crop__divisible` wrapper + `<div id="divisible-slot">` in template.

## MpiRadioGroup
- props: options, value, name, info, iconOnly, labelPosition('right'|'top'), size(sm|md|lg),
  columns(→--mpi-radio-cols), featuredFirst (first spans row). Crop ratio row uses columns:4,size:lg,
  featuredFirst:true. Cinema pushes ~9-10 items → columns:4 or 5, consider size:md for compactness.

## MpiInput divisible pattern (from Resize 406-411)
- {type:'number', label:'Divisible by', value, min:1, step:1, info:...} + on('input')/on('change')
  → clampInt(value, prev). clampInt is a local fn in Resize (must copy to Crop): Number→finite→max(1,round).

## Icons
- Existing ratio_*: 1_1,3_4,4_3,4_5,5_4,5_8,8_5,9_16,16_9 (all map from rect_* via replace).
  Cinema (21:9,2.39:1,2:1,1.85:1) have NO icon → fallback = 'info' (bad). Add stroke <rect rx=2/> entries.

## Persistence
- getToolSettings(project,'crop',DEFAULTS) → project.toolSettings.crop or DEFAULTS.
- Events.emit('settings:tool:update',{toolKey:'crop',key,value}) → projectService _enqueueToolUpdate
  (debounced per tool) → setToolSettings shallow-merge → disk. Crop persists family,orientation,label.
  Add divisible_by. Old sdxl/flux/social persisted values coerce to default gracefully — no migration.
