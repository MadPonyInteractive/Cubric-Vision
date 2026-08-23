# Branch B research 4/4 — prior art, library data model, and the synthetic route

Dispatched 2026-08-23. Asked what already exists that we could adopt, how the reference
implementation models a voice library, what metadata a shipped library needs, and whether
a **fully synthetic** library sidesteps consent.

**Headline: the synthetic route works, and it does NOT require shipping Qwen in the app.**

---

## 1. The finding that resolves the A-vs-B tension

A synthetic library is built with **Qwen3-TTS VoiceDesign** — the same model branch A was
parked over. But the two uses are completely different:

| | Branch A (parked) | Synthetic library |
|---|---|---|
| Where Qwen runs | Inside the user's app | **Once, offline, on our bench** |
| Ships to users | Isolated transformers-4 runtime, self-provisioning venv | **A folder of `.wav` files** |
| User-side cost | 44-package runtime + Pod + progress plumbing | **Zero** |
| Risk Fabio objected to | Present | **Absent** |

The isolated transformers-4 runtime is perfectly acceptable **on the authoring bench**,
because it never reaches a user. What was rejected was shipping it. So Qwen can be an
authoring tool without being a dependency.

Licence chain: Qwen3-TTS is **Apache-2.0** (0.6B and 1.7B). Outputs of an Apache-2.0
model carry no training-data licence restriction. No real person is involved at any
point. **No consent problem, no biometric exposure, no takedown surface.**

Fabio's Flow A ("text -> new voice") therefore survives branch B intact — it just becomes
browse-a-library-we-designed rather than generate-on-demand.

### The one unverified risk — cheap to settle

**Does a Qwen-generated clip work as a Chatterbox reference?** Chatterbox expects a real
human recording; a synthetic clip may have spectral characteristics that reduce cloning
fidelity. Untested.

This is the new blocking measurement, and it avoids the transformers problem entirely:
generate one voice via the **HF Space** (`Qwen/Qwen3-TTS-Voice-Design`, no local install),
feed it to Chatterbox on the bench, listen. One afternoon, no vendoring, no venv.

### Build path if it holds

1. Author 30-50 VoiceDesign prompts across a grid:
   `{young, middle-aged, senior} x {male, female} x {American, British, Australian, Indian, neutral} x {conversational, narration, character, dramatic}`
2. Per prompt: generate 3 samples, keep the most consistent as `reference.wav`
   (the model is **not deterministic** — same prompt gives similar, not identical, voices)
3. Store the prompt as `description_prompt` — it doubles as the UI description AND lets
   the voice be regenerated or varied later. A clip-only store cannot do that.
4. Those clips are Chatterbox's reference audio.
5. Ship the folder.

Prompt structure: `[gender], [age], [pitch], [pace], [tone/emotion], [accent], [timbre], [role/personality]`.
This is the same vocabulary the plan's Step 4 already specified for the Flow A UI.

**Prior art at scale:** ElevenLabs' own AI Voices are synthetic and commercially licensed,
with their legal copy stating each "does not imitate or replicate any specific
individual's voice". Nobody has published an open standalone synthetic voice pack — this
is an open niche.

Alternative generator: **Parler-TTS** (Apache-2.0, 34 named personas, attribute-controlled).
English-centric with narrower accent variety than Qwen. Usable fallback.
**VoiceLDM** is a research prototype, licence unclear — not recommended.

---

## 2. Ready-made packs — one real adopt candidate

### `kyutai/tts-voices` — VIABLE (partially)

https://huggingface.co/kyutai/tts-voices — mixed licences per sub-directory, and the
split is what matters:

| Sub-dir | Count | Licence | Ship commercially? |
|---|---|---|---|
| `voice-donations/` | **228** | **CC0** | **Yes, no attribution** |
| `vctk/` | multiple | CC BY 4.0 | Yes, with attribution |
| `cml-tts/fr/` | multiple | CC BY 4.0 | Yes, with attribution |
| `alba-mackenna/` | 4 | CC BY 4.0 | Yes, with attribution |
| `voice-zero/` | limited | CC0 | Yes |
| `expresso/` | multiple | CC BY-**NC** 4.0 | **NO** |
| `ears/` | ~107 | CC BY-**NC** 4.0 | **NO** |

The 228 CC0 voices come from the Unmute Voice Donation Project (Jun 2025 - Feb 2026):
real people who **donated their voices explicitly**, released public domain. Genuine
documented consent, redistributable as-is, no attribution burden.

> **Trap:** `expresso/` and `ears/` are NC and must not be bundled. Do not treat this
> repo as uniformly licensed.

### Everything else — not adoptable

| Source | Verdict |
|---|---|
| Coqui XTTS built-in speakers (~17) | CPML **non-commercial**; Coqui shut down Jan 2024 so no commercial licence obtainable. Design study only. |
| F5-TTS | CC BY-NC 4.0, trained on Emilia (also NC). |
| Chatterbox community packs | **None exist.** Sharing is informal Discord/Reddit clips. The gap is real — we would be first. |
| CosyVoice2 / IndexTTS | No redistributable pack; user-upload only. |

---

## 3. TTS-Audio-Suite's voice library — worth reading, too bare to copy

MIT. Its model:

```
voices_examples/
├── alice.wav              # identity comes from the FILENAME, not the folder
├── alice.reference.txt    # transcript — F5-TTS needs it, Chatterbox ignores it
└── alice.txt              # free-form metadata
```

Plus an optional `#character_alias_map.txt` (tab- or `=`-separated) mapping display names
to basenames with a default language, so a script can say `[Alice]` without knowing the
filename. Matching is case-insensitive and punctuation-tolerant. Discovery is a startup
scan into an in-process `GLOBAL_AUDIO_CACHE` — no persistent manifest.

**It ships zero voices.** `voices_examples/` is empty; users supply their own.

Verdict: the drop-in file ergonomics are good, the alias map is clever, but there is no
structured per-voice metadata — no gender, age, accent, licence, preview, or ordering.
Fine for a node graph, insufficient for a GUI picker.

---

## 4. The data model to build instead

```
voices/
└── alice/
    ├── reference.wav             # 5-10 s clean clip
    ├── reference.reference.txt   # optional transcript
    └── voice.json
```

```json
{
  "id": "alice-en-f-young",
  "display_name": "Alice",
  "gender": "female",
  "age": "young",                 // child | young | middle-aged | senior
  "accent": "American",
  "language": ["en"],
  "style": "conversational",      // conversational | narration | newscast | character | dramatic
  "tags": ["warm", "upbeat"],
  "preview_url": "voices/alice/preview.mp3",
  "reference_clip": "voices/alice/reference.wav",
  "description_prompt": "Young American female, warm and upbeat, conversational pace",
  "licence": "CC0",
  "source_url": "https://...",
  "added_at": "2026-08-23"
}
```

Field set distilled from the two most complete public APIs:

- **ElevenLabs** — `voice_id`, `name`, `description`, `preview_url`, `category`
  (generated/cloned/premade/professional/famous), `labels` (accent, gender, age, use_case,
  tone, style, language), `verified_languages`, `recording_quality`
  (studio/good/ok/poor/bad), `liked_by_count`. Filters: gender, age, language, accent.
- **PlayHT** — adds `texture`, `tempo`, `loudness`, `style`. These let a user filter for
  "calm, slow, authoritative" without free-text search, and are worth stealing.

Desktop pickers worth studying: `msrbuilds/voice-studio` (sidebar Built-in / My voices,
inline metadata edit, drop-to-add, 7 engines incl. Chatterbox and Qwen3-TTS) and
`jamiepine/voicebox` (local-first, more polished).

---

## Bottom line

Two viable routes, and they compose:

1. **Ship now:** the 228 CC0 voices from `kyutai/tts-voices` — real consent, public
   domain, zero legal exposure, usable today.
2. **Ship next:** a synthetic library authored offline with Qwen3-TTS VoiceDesign
   (Apache-2.0). No real person, no consent question, no runtime in the app, and the
   authoring prompt becomes the UI description.

Route 2 is the elegant long-term answer and preserves Fabio's "design a voice" Flow
without any of the risk that got branch A parked. It is gated on one cheap listening
test: does a synthetic clip clone well through Chatterbox?

## Sources

Key: https://huggingface.co/kyutai/tts-voices · https://unmute.sh/voice-donation ·
https://github.com/QwenLM/Qwen3-TTS · https://huggingface.co/spaces/Qwen/Qwen3-TTS-Voice-Design ·
https://huggingface.co/parler-tts/parler-tts-mini-v1 · https://huggingface.co/coqui/XTTS-v2 ·
https://github.com/coqui-ai/TTS/discussions/4304 ·
https://github.com/diodiogod/TTS-Audio-Suite/blob/main/docs/CHARACTER_SWITCHING_GUIDE.md ·
https://elevenlabs.io/docs/api-reference/voices/search ·
https://elevenlabs.io/docs/eleven-creative/voices/voice-design ·
https://docs.play.ht/reference/api-list-ultra-realistic-voices ·
https://github.com/msrbuilds/voice-studio · https://voicebox.sh/
