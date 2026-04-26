# Shader Sources — Raw GPU Pipeline

All shaders authored MPI in-house and **inlined as template strings** in `js/utils/rawGpuPipeline.js`. Single source of truth: that file. Reference `.frag` files previously in `js/utils/shaders/` were removed (drift risk).

**License:** all MPI-authored, internal use.

---

## Effect → Source Map (in `rawGpuPipeline.js`)

| Effect | Constant name | Notes |
|---|---|---|
| Exposure | `EXPOSURE_FRAG` | 2^EV linear multiplier |
| Shadows | `SHADOWS_FRAG` | Lift-only curve; raises blacks, preserves whites |
| Saturation + Per-color HSL | `HUE_SAT_FRAG` | Per-range HSL with mode mask (R/Y/G/C/B/M) |
| Curve LUT | `COLOR_CURVES_FRAG` | 256×1 LUT via `texelFetch` + manual lerp |
| Sharpening (unsharp mask) | `UNSHARP_FRAG` | amount/radius/threshold; luminance-gated |
| Noise Reduction | `BILATERAL_FRAG` | Bilateral filter, spatial+color sigma |
| Film grain | `FILM_GRAIN_FRAG` | PCG hash, luminance-weighted, smooth/grainy |
| Dehaze | `DEHAZE_FRAG` | Dark Channel Prior, single-pass approximation |
| White balance | Client pixel-sampling in `MpiToolOptionsRaw._applyAutoWB` | Grey-world; remounts pipeline against corrected canvas |

---

## PixiJS v8 Filter Conventions (verified — do not deviate)

Source verified from `pixijs/dev/src/filters/defaults/displacement/displacement.frag` and `defaultFilter.vert`.

| Concern | Required value |
|---|---|
| Input texture sampler | `uniform sampler2D uTexture;` (NOT `uSampler`) |
| Fragment output | `out vec4 finalColor;` + `finalColor = ...;` (NOT `fragColor` / `gl_FragColor`) |
| Texture coords | `in vec2 vTextureCoord;` |
| Auto uniform | `uniform vec4 uInputSize;` (xyzw = w, h, 1/w, 1/h) — declare per-fragment if used |
| Vertex auto uniforms | `uInputSize`, `uOutputFrame`, `uOutputTexture` |
| GLSL version | `#version 300 es` literal — Pixi detects via substring; required for `texelFetch`, `uvec2`, `uint`, `textureSize` |
| Precision | `precision highp float;` after version line |

**Filter creation (canonical):**

```js
import { Filter, GlProgram, UniformGroup } from 'pixi.js';

const filter = new Filter({
  glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'myFilter' }),
  resources: {
    myFilterUniforms: new UniformGroup({
      uAmount: { value: 0, type: 'f32' },
    }),
  },
});

// Read/write uniforms:
filter.resources.myFilterUniforms.uniforms.uAmount = 0.5;
```

**Custom textures (sampler resources):** pass `texture.source` (TextureSource), not `Texture` wrapper:

```js
resources: {
  uMyLUT: lutTexture.source,
}
```

**Buffer-backed textures (LUTs etc):**

```js
import { Texture, BufferImageSource } from 'pixi.js';

new Texture({
  source: new BufferImageSource({
    resource: uint8Array,   // each LUT needs its own buffer (no sharing)
    width, height,
    format: 'rgba8unorm',
  }),
});
```

---

## Dehaze — Algorithm Reference

Dark Channel Prior (He et al., 2009). Single-pass approximation in `DEHAZE_FRAG`:

1. Dark channel = `min(R,G,B)` per pixel, min-pooled over 15×15 patch (radius 7 inline loop)
2. Atmospheric light A = sampled brightest dark-channel pixel from 4×4 grid in top-right quadrant (heuristic to avoid subject)
3. Transmission `t = 1 - 0.95 * darkChannel / A`, clamped to floor `t0 = 0.1`
4. Recovery `J = (I - A) / t + A`, blended by strength
5. Negative strength = blend toward A (add haze)

Quality caveat: sky/white regions weaker than Adobe ML-refined version.
