# Recolor Table — mascot + logo (PNG, Photoshop)

For each PNG (`logo.png`, `mascot.png`, `mascot-arms.png`, `mascot-hi.png`, `mascot-ho.png`):

1. Open in Photoshop.
2. For each row below: **Select > Color Range** with the source hex, set fuzziness ~12, then fill the selection with the new hex (Edit > Fill > Color…).
3. Save as the same name. Drop into the worktree at `assets/mascot/`.

Process source colors top-to-bottom — eyes / emblem / panels first so the body fill doesn't repaint them.

| # | Region | Old hex | New hex | Note |
|---|---|---|---|---|
| 1 | Eye glow (cyan, light) | `#80F0F5` | `#7BE3F0` | frost cyan |
| 2 | Eye glow (cyan, mid) | `#60F0F0` | `#7BE3F0` | frost cyan |
| 3 | Eye glow (cyan, deep) | `#48E0E0` | `#5DC8DC` | frost shadow |
| 4 | C-emblem fill (magenta) | `#CB7CD6` | `#ED5E7B` | heat pink |
| 5 | C-emblem fill (deeper magenta) | `#C060A8` | `#D04C68` | heat shadow |
| 6 | Side panels / antennas (purple) | `#BB82D2` | `#E87AA0` | mid heat |
| 7 | Side panels (deeper purple) | `#A770C0` | `#CC7090` | side mauve |
| 8 | Bottom mauve stripe | `#C078A8` | `#CC7090` | side mauve |
| 9 | Body fill (mid blue) | `#6A8EC9` | `#7C6E75` | mauve mid |
| 10 | Body fill (lighter blue) | `#9EBCED` | `#A8989F` | mauve light |
| 11 | Body shadow (deeper blue) | `#4B6CA1` | `#5D4F57` | mauve shadow |
| 12 | Body deepest shadow | `#306090` | `#473A41` | deepest mauve |
| 13 | Face screen interior | `#000030` | `#1F1820` | screen black |
| 14 | Linework / outline | `#000000` | `#2F242A` | ink deep |
| 15 | Highlight specular | `#E1E1E1` | `#C8BCC1` | mauve highlight |
| 16 | Neutral grey | `#888B97` | `#908088` | mauve grey |

Optional: also recolor `lettering.png` if you want the wordmark mauve too. The wordmark currently uses CSS hue-rotate as a stop-gap.

| # | Region | Old hex | New hex | Note |
|---|---|---|---|---|
| L1 | Wordmark fill (purple) | `#B57AD0` | `#E87AA0` | mid heat |
| L2 | Wordmark glow (cyan) | `#80F0F5` | `#7BE3F0` | frost cyan |
| L3 | Wordmark outline | `#000000` | `#2F242A` | ink deep |

If a hex doesn't match exactly in your file (Photoshop quantizes differently than my sampler), use the closest visible color in the same region — the new hex doesn't need to be pixel-exact, just on-palette.

After recolor, drop the filter in the mockups:

```css
/* delete these lines from c-stage/landing.html, gallery.html, editor.html, editor-video.html */
.brand-logo  { filter: hue-rotate(-50deg) saturate(0.78) brightness(1.05); }
.brand-lettering { filter: hue-rotate(-30deg) saturate(0.85) brightness(1.08); }
.mascot-peek { filter: hue-rotate(-50deg) saturate(0.78) brightness(1.05); }
```

That's it.
