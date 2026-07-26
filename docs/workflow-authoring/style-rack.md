# The style rack — `MpiStyleSelector` + `MpiStyleLoras`

> Model-agnostic. How a graph offers a set of mutually-exclusive style LoRAs that the
> app drives with ONE index and ONE strength. Model-specific style sets live in
> `docs/models/<model>/`; the onboarding steps are
> [../playbooks/add-model/05-prompt-and-styles.md](../playbooks/add-model/05-prompt-and-styles.md) §9.

## The two nodes

| node | inputs | outputs |
|---|---|---|
| `MpiStyleSelector` | `model`, `selector` (INT), `triggers` (multiline STRING), `strength_model`, `strength_clip`, optional `clip` | `style` (`MPI_STYLE`) |
| `MpiStyleLoras` | `style`, `lora_1`..`lora_5` | `style`, `model`, `clip`, `prompt` |

One selector, then `ceil(N/5)` banks **chained** `style → style`. Style **N** = trigger
line **N** = the **N**-th lora slot walking the chain (bank 1 slot 1 is style 1, bank 2
slot 1 is style 6). `selector = 0` is *no style*: model and clip pass through untouched
and `prompt` is empty. A slot left at `None` inside the used range is a **prompt-only
style** — legal by design.

Take `model` / `clip` / `prompt` from the **last** bank in the chain. `strength_clip`
stays `0` (and `clip` unconnected) for model-only LoRAs, which is every style LoRA we
ship so far.

## The injection contract

The selector node MUST be titled **`Input_Style_Selector`**. It is the only titled node in
the rack — the banks are internal, the app never addresses them.

Two injected knobs on one node, so they are addressed **per widget** with a dotted key
(`comfyController` §3, MPI-359):

| control (`PromptBoxControls.js`) | injected key |
|---|---|
| `styleSelect` (the picker index) | `Input_Style_Selector.selector` |
| `stylization` (the strength slider) | `Input_Style_Selector.strength_model` |

A plain title key would spray the value into every recognised widget name — the index
would land in both strengths and never reach `selector`. As always, a title that isn't in
the graph is a **silent no-op**: the picker moves, nothing happens, and it reads exactly
like strength 0.

`lora_1..lora_5` are path-bearing like `lora_name`, so `comfyController` step 3b heals
their separator for non-Windows engines (`krea-2\style\x` → `krea-2/style/x`). Without
that, a subfoldered style LoRA 400s with `value_not_in_list` on every Pod.

## Traps

- **Trigger lines vs slots.** One line per style, and no LoRA parked past the last line.
  Either drift is a silent half-application ("the LoRA feels weak"), never an error.
  `generate_krea2.py::_assert_style_rack` is the reference build-time guard — copy it.
- **Index 0 is reserved** for *None* in `styleLoraLabels` / `styleLoraImages`, so
  `triggers` line 1 pairs with label index **1**.
- **The banks are a chain, not a fan-out.** Two banks off the same upstream silently drop
  one branch's LoRAs.
- **`selector` / `strength_model` must stay widgets.** Link either one and injection has
  nowhere to write.

## Guards

- `tests/inject-params-titles.test.cjs` — derives the expected title from the dotted keys
  the controls emit, then checks every workflow's `MpiStyleSelector` against it.
- `tests/lora-path-separator-heal.test.cjs` — the `lora_N` slots heal like `lora_name`.
- `generate_krea2.py::_assert_style_rack` — shape of the rack at build time.
