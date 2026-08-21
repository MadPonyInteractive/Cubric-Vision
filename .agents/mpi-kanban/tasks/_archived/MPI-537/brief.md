# MPI-537 — LTX 2.3 lipsync: author and prove the workflow on the bench

Third LTX 2.3 v2v front end, after extend (MPI-520) and foley (MPI-536). **Scope
is bench authoring only** — author the graph, run it on 8188, prove it. App
integration is a later card and follows `/mpi-add-flow`.

**Not blocked by MPI-531.** MPI-531 gates authoring a Flow's *app-side UI*; this
card authors a *ComfyUI graph*. It can run in parallel with MPI-531, and should —
by the time the UI shape lands, the graph is ready.

## The correction this card starts from

Read from the bench's own `LTX_lipdub_v2v_template.json` (36 nodes), **not
assumed**. An earlier claim in MPI-4's brief — that lipsync is `ltx_v2v` with
`max_length="partial"`, freezing audio and masking video — is **wrong**. Lipdub
uses a different front end entirely and none of the foley/extend mask machinery
appears in it:

| | extend / foley | lipdub |
|---|---|---|
| video latent | encoded source, frozen by a noise mask | `EmptyLTXVLatentVideo` — fully generated |
| source video enters as | the latent itself | `LTXAddVideoICLoRAGuide` in-context guide |
| audio enters as | an encoded latent in the AV pair | `LTXVSetAudioRefTokens` on the CONDITIONING |
| LoRA | none (foley: `LoRA-Foley-V2A`) | `LTXICLoRALoaderModelOnly` + `ic-lora-lipdub-0.9` |
| after sampling | separate AV, decode | `LTXVCropGuides` strips the guide frames first |

**The video is re-synthesised, not preserved.** That is what lets a closed or
still mouth start moving — and it is also the quality risk: identity, lighting and
background are all regenerated from the guide, so **drift is the thing to judge**,
not lip accuracy alone. `LTXVCropGuides` is mandatory.

**Consequence:** lipsync does NOT share `ltx_v2v.json`. Its own workflow file, its
own op. The "two ops, one file" trick in `models.js` applies to extend + foley only.

## Everything it needs is already installed

`LTXAddVideoICLoRAGuide`, `LTXICLoRALoaderModelOnly`, `LTXVSetAudioRefTokens`,
`LTXVTiledVAEDecode` (ComfyUI-LTXVideo) and `LTXVCropGuides` /
`EmptyLTXVLatentVideo` / `GetVideoComponents` (core) are present on **both 8188 and
48188**. `ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors` is on disk at
`C:\AI\loras\LTX2.3\` — the bench's other LoRA root, **not** `G:\CubricModels`.
That path difference matters when the app-side card wires the dep.

## Work

1. **Author from the bench template, in place.** `LTX_lipdub_v2v_template.json`
   is the starting point. The house rules from MPI-4 apply and are not optional:
   edit the bench copy **in place**, never regenerate; assert every surviving
   node's `pos`/`size` unchanged; read back **from the bench** after every write;
   re-fetch after the user touches the tab (**the modified dot is the tell**).
2. **Run experiments API-only.** Convert the repo copy with
   `node scripts/workflow-to-api.mjs <file>` (single-file mode → stdout, writes
   nothing) and POST to `/api/prompt`. This is how MPI-4 ran a four-point cfg
   sweep without touching the saved workflow once. Prefer it for everything.
3. **Decide the audio front end.** The template drives lipsync from the source
   video's *own* audio (`GetVideoComponents:1` → `LTXVAudioVAEEncode`). Supplying
   a different track is a **one-socket swap to an audio loader** — that is the
   dubbing case, and it is what makes "supply audio, get lipsync" work. Decide
   whether v1 ships one socket, both, or a toggle.
4. **Rename to the `Input_*` / `Output_*` title law** as the graph settles, so the
   later app card inherits an injectable file rather than a rename pass. The
   injector **silently skips** a title with no matching node.
5. **Judge drift, not just lips.** Identity, lighting and background are
   regenerated. A run that syncs perfectly and changes the person's face is a
   failure — that judgement is the user's ear and eye, not a metric.

## Four ready references

RuneXX collection, `Video-2-Video/Just-Talk_add_voice_to_silent_video/`:
`..._custom_audio_lip-synced_to_any_video`,
`..._dub_any_silent_video_multilanguage`,
`..._prompt_lip-synced-voice_to_any_video`, and a `..._Sam3` variant (SAM3 gives
it a spatial mask, presumably to confine the regeneration to a face region — worth
reading before deciding whether v1 needs a face mask at all).

## Related

- `MPI-4` — the LTX umbrella; § "Lipsync is NOT a third mask polarity" is the
  source of the table above. Its `validation.md` carries the bench-editing recipe.
- `MPI-536` (foley → Flow), `MPI-520` (extend → Flow) — the two siblings.
- `MPI-531` — gates the app-side card that follows this one, not this one.
