# MPI-580 Checklist

- [x] Registry shape — `PluginDef.upscale {kinds,label,fields}`, the `plugin:<id>`
      selection value, `upscalePluginsFor` / `upscalePluginOption` / `pluginFromDepKey`
- [x] The shared field renderer — `_buildField`/`_fieldNumber` out of MpiBaseFlow into
      `js/utils/declaredFields.js`, plus `mapTo` (the hidden 0–1 mapping) and
      `splitDeclaredValues` / `isInjectionParam` as the one routing law
- [x] The entry and its controls — MpiToolOptionsUpscale lists contributing plugins for
      its `kind`, renders the selected entry's fields, persists them per tool key, hides
      Upscale Factor (a plugin's graph owns its own scale)
- [x] Dispatch + Flow requirement — the `plugin:` branch in `_handleApply`, run inputs
      threaded through `_runVideoTool`/`_runImageTool`, `FlowDef.requiredPlugins` folded
      into the flow dep set
- [ ] Fabio's own look at it — arrives with MPI-579, the first plugin to declare `upscale`
