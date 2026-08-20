# One field, two graph nodes — the switch bank

> Part of [ui/](README.md). Origin: Character Sheet (MPI-504), needed again by the Prop
> Sheet (MPI-586) before it was even written — which is why it is here and not in a
> flow file.

## The wall

A declared field emits **exactly one value into exactly one param**. `mapTo` does not
widen it: it is a linear range map, one number in, one number out
(`declaredFields.js:83`).

So the moment a control means **two or more graph values** — a resolution (width AND
height), a duration that is both frames and seconds, a paired crop — the field
vocabulary cannot express it. This is not a missing feature to route around with a
second field; two coupled fields put the coupling in the user's hands, which is exactly
what a preset is supposed to remove.

## The pattern — one `MpiInt` selecting N `MpiAnySwitch` banks

Put the fan-out in the **graph**, not the app:

```
Input_Quality (MpiInt, 1)  --select-->  Width_Select  (MpiAnySwitch) --> Set_W
                            \-select-->  Height_Select (MpiAnySwitch) --> Set_H

Width_Select.any_1  <- W_1k (MpiInt 1280)      Height_Select.any_1 <- H_1k (MpiInt 800)
Width_Select.any_2  <- W_2k (MpiInt 1792)      Height_Select.any_2 <- H_2k (MpiInt 1120)
```

The FlowDef then declares ONE ordinary field:

```js
{ id: 'Input_Quality', type: 'radio', label: 'Quality', columns: 2, default: 1,
  options: [ { v: 1, label: '1K', … }, { v: 2, label: '2K', … } ] }
```

**Zero app code.** `MpiAnySwitch` is 1-indexed, and both `radio` and `select` emit the
option's original `v`, so the int reaches `select` as a number and not as `"1"`. It is
the same shape `Input_Recipe` uses for the four sheet templates.

## Rules

- **Build the bank at `any_1..any_5`, not as a boolean + `MpiIfElse`,** even for two
  arms. A two-arm boolean has to be rebuilt the first time a flow wants three; five
  slots cost nothing and MPI-586 needs four.
- **The constants stay plain `MpiInt` nodes with NON-`Input_` titles.** In this codebase
  `Input_*` means *the app may inject this*, and a constant that only takes effect on
  one arm of a switch is a trap: injecting it succeeds, changes nothing on the other
  arms, and reports nothing.
- **Pin the selector title in `tests/inject-params-titles.test.cjs`.** A missing switch
  selector does not break the graph — it silently pins every run to `any_1` while the
  control still renders and the run still succeeds. That is the worst class of silent
  skip and this guard is the only thing that catches it.
- **Values go in the graph, labels in the FlowDef.** The field's `note`/`info` describe
  the cost; the numbers live at the `MpiInt`s so a raw-graph reader sees what runs.

## When NOT to use it

If the app already owns the value — an aspect ratio the user picked in the PromptBox, a
size derived from an input image — inject `Input_Width`/`Input_Height` directly and skip
the bank. The switch bank is for a **preset the flow defines**, not for a value the app
computes.
