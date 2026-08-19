# MPI-580 Validation

**Verify mode:** user-ux. The mechanism ships with NO consumer declaring `upscale`, so
what a real user sees arrives with MPI-579. Everything below was proved against a
TEMPORARY stub (`image-describer` given an `upscale` block for the run, removed after —
`grep TEMP-MPI580` returns nothing).

## Automated — 2026-08-19

`npm test` → **630 passing, 0 failing** (was 629 before this card; the new file is the
630th).

- `tests/plugin-dep-gc.test.cjs` — passes UNCHANGED in behaviour, which is the point:
  the new registry keys changed no dep-protection. Extended with the contribution
  point's own contract: the `plugin:<id>` dep key round-trips back to its plugin, an
  upscale-model FILENAME (`4x-NMKD-Siax.pth`) never resolves to one, and a plugin
  declaring no `upscale` block contributes to neither kind.
- `tests/declared-fields.test.cjs` (new) — the hidden mapping and the routing law:
  `mapTo: [0.50, 0.85]` sends **0.675 at UI 0.5** (the sigma default MPI-568 measured),
  both ends land exactly, an out-of-range stored value CLAMPS rather than extrapolating,
  a non-numeric value is passed through untouched, and `Input_*` routes to
  `injectionParams` while everything else reaches the op as a run input.

## In a real app — 2026-08-19, `npm run app:isolated` (own profile, port 58811)

Fabio's :3000 session was left alone; the probe instance was killed by process tree.

1. **Kind filtering** — `upscalePluginsFor('video')` → `['image-describer']`,
   `upscalePluginsFor('image')` → `[]`. The entry appears in one tool and not the other.
2. **The entry is IN the existing dropdown** — options came back
   `None | Probe upscaler | 1x-ITF-SkinDiffDetail-Lite-v1.pth | …`: one list, plugin
   entry between None and the model files. No second dropdown exists.
3. **Selecting it reveals its controls** — prompt textarea + two sliders, seeded 0.5 and
   0, under the plugin's label.
4. **The payload** — Run emitted
   `{factor: 2, model: 'plugin:image-describer', pluginId: 'image-describer', values: {Input_Denoise: 0.5, Input_Cfg: 0.5, positive: 'sharp detail'}}`,
   and the dispatcher's split turned that into
   `inputs: {positive: 'sharp detail'}` + `injectionParams: {Input_Denoise: 0.675, Input_Cfg: 2}`.
   **A slider showing 0.5 sends 0.675** — the whole point of the hidden mapping.
5. **Flow regression (the extraction)** — `ltx-extend`'s declared fields still render with
   byte-identical BEM (`mpi-base-flow__field`, `…__field-text`, `…__field-slider`,
   `…__field-range`, `…__field-value`), so MpiBaseFlow's CSS still applies untouched;
   `head-swap`'s `radio` field still mounts its MpiRadioGroup Primitive with the
   namespace passed through (`aria-label="head-swap-Input_Tier"`) and its default active.

## A bug the pixels caught that the DOM assertions did not

The first screenshot showed **Upscale Factor still visible** under a plugin entry despite
`factorSection.hidden = true`. Cause: `[hidden]` is a UA `display:none`, and
`.mpi-tool-options-upscale__section { display: flex }` outranks it — so the plugin's own
controls would equally have leaked under `None`. Fixed with an explicit
`__section[hidden] { display: none }` rule, re-verified through computed style: None →
plugin `none` / factor `flex`; plugin selected → plugin `flex` / factor `none`. Screenshot
after the fix shows the panel styled like the rest of the app.

## Not verified here, deliberately

- A real generation through a plugin entry — no plugin declares `upscale` yet; that is
  MPI-579's end-to-end proof.
- A Flow declaring `requiredPlugins` — no Flow declares one yet (MPI-557's). The fold is
  covered by reading: `flowDepIds()` feeds `flowDepUniverse`, `getFlowDependencies` and
  `flowAvailability` from one helper, so the badge, the Run guard and the install button
  all gate on it together.
