# Branch B research 2/4 — permissively licensed speech corpora

Dispatched 2026-08-23. Which corpora can we legitimately ship reference clips from?

**Answer: several. A licensed, diverse library is buildable.** But a permissive licence
does NOT cure the consent question — see research file 3, and the spectrum below.

---

## Viable — ranked

| Corpus | Licence | Rate | Speakers | Notes |
|---|---|---|---|---|
| **HiFiTTS-2** (NVIDIA 2025) | CC BY 4.0 | 44.1kHz | **5,000** | LibriVox professional narrators. **Speakers who opted out of ML use were REMOVED** — the closest thing to consent in any LibriVox-derived corpus. 36,700h total, so stream per-speaker partitions rather than downloading |
| **VCTK** (CSTR Edinburgh) | CC BY 4.0 | **48kHz** | 109 | Studio booth, 11 accent groups. Full name is "English Multi-speaker Corpus for CSTR **Voice Cloning** Toolkit" — built for exactly this. Speakers anonymised as `p225`, `p226`… ~11GB, per-speaker dirs, ~24 min each |
| **GLOBE** | **CC0** | 24kHz | **23,519** | Filtered/enhanced Common Voice. **164 accents** — broadest diversity available. 47.6GB, per-speaker metadata (gender/age/accent) pre-filled |
| **Hi-Fi TTS** (OpenSLR 109) | CC BY 4.0 | 44.1kHz | 10 | SNR ≥32dB. Only 10 speakers (6F/4M) but exceptional quality, 17h+ each |
| **LibriTTS-R** | CC BY 4.0 | 24kHz | 2,456 | Neural-restored LibriTTS. **Sentence-level utterances (~5-15s)** — often a 10s reference with no concatenation. `test-clean` is only ~450MB |
| **LibriVox** (raw) | Public domain | varies | tens of thousands | No restrictions at all. Home-recorded, unstructured, manual selection |
| **LJSpeech** | Public domain | 22kHz | **1** | Single female speaker, very consistent. One voice, not a backbone. (Sites calling it non-commercial are wrong — source is unambiguously PD) |
| **MLS** | CC BY 4.0 | 16kHz | thousands | The only multilingual option — de/fr/es/it/nl/pt/pl. 16kHz ceiling |
| **LibriSpeech** | CC BY 4.0 | 16kHz | 2,338 | Superseded by LibriTTS-R for our purpose; 16kHz is a real quality ceiling |
| **Common Voice** | CC0 | 48kHz MP3 | 100,000+ | Legally cleanest licence, **loudest consent mismatch** (below). 56GB per language, no per-speaker subset, clips only 3-5s |

## Disqualified — CC BY-**NC**, commercial use prohibited

**DAPS · Expresso · EARS · Emilia.**

Painful, because Expresso (4 speakers, 8 expressive styles + 26 improvised dialogue
styles, 48kHz studio) and EARS (107 speakers, anechoic, diverse styles) are otherwise
close to ideal for cloning references. The NC clause is a hard block; do not use.

> Cross-check: these are the same `expresso/` and `ears/` sub-directories flagged as
> NC inside `kyutai/tts-voices` in research file 4. Consistent, and confirms that repo
> must be taken sub-directory by sub-directory.

**People's Speech** is a partial trap: part CC BY 4.0, part CC BY-**SA** 4.0. The
share-alike portion could be read as forcing SA terms onto a library embedded in a
proprietary product. Needs legal review, and better CC BY options exist — skip it.

---

## The consent spectrum (licence-clean is not consent-clean)

Ordered by exposure, lowest first. This is the axis that actually matters once research
file 3's legal findings are applied.

1. **Synthetic voices** — no real person exists. No right-of-publicity subject, no
   biometric data, no consent chain. (Research file 4.)
2. **VCTK** — CC BY, speakers **anonymised** (`p225`), and the corpus was *purpose-built
   for voice cloning*. No "readily identifiable individual", which is the trigger term in
   the ELVIS Act. Strongest of the real-voice options.
3. **HiFiTTS-2** — CC BY, ML opt-out respected. But these are identifiable professional
   narrators; consent was to ML use generally, not to a named product's voice library.
4. **GLOBE / Common Voice** — CC0, legally clearest of all, **ethically muddiest**. A 2023
   Mozilla Discourse thread ("Explicitly forbidding/limiting TTS usage?") records
   contributors who understood they were feeding *speech recognition* and were disturbed
   to learn their voice could be synthesised. Mozilla's terms do mention "text-to-voice
   applications", so the terms arguably cover it — contested within the community.
5. **LibriVox raw / LibriSpeech / LibriTTS / Hi-Fi TTS** — public domain, but volunteers
   recorded audiobooks for the visually impaired starting in 2005. No opt-out mechanism
   exists. LibriVox's own position is that the recordings are legally PD and it cannot
   prevent ML use.

**Nothing here is legally blocked. The reputational gradient is real and runs the other
way from the licence gradient** — the most permissive licence (CC0 Common Voice) has the
weakest consent story.

---

## Effort

No corpus ships ready-made 10s reference clips. Chatterbox wants 6-15s clean single
speaker.

- **VCTK** — concatenate 4-6 utterances per speaker; trivial, per-speaker directories.
- **LibriTTS-R** — sentence-level utterances often already 5-15s; least work of all.
- **GLOBE** — stream from HF, group rows by speaker id.
- **HiFiTTS-2** — pick 20-50 of 5,000 speakers, pull those partitions.

**A curated 50-voice library of 10s clips is under 10 MB of audio.** Trivially shippable
inside the app. The data-engineering pass is the cost, not storage or bandwidth.

**Attribution:** every CC BY 4.0 corpus needs a credit displayed in-product — a credits
or help page listing corpus names and links is standard and sufficient. CC0 and PD
sources (GLOBE, Common Voice, LibriVox, LJSpeech) need none.

---

## Bottom line

A licensed, diverse, high-quality voice library is buildable today. The strongest
real-voice combination is **VCTK** (quality + accents + purpose-built for cloning +
anonymised speakers) plus **GLOBE** (breadth, 164 accents, CC0), optionally topped with
selected **HiFiTTS-2** speakers for premium 44.1kHz narration.

But every one of these is a real human, and research file 3 shows a licence does not
answer right-of-publicity or GDPR. If a synthetic library clones acceptably through
Chatterbox, it dominates all of these on exposure while costing no licence, no
attribution and no consent argument.

## Sources

https://librivox.org/pages/public-domain/ · https://datashare.ed.ac.uk/handle/10283/3443 ·
https://huggingface.co/datasets/CSTR-Edinburgh/vctk · https://huggingface.co/datasets/MushanW/GLOBE ·
https://arxiv.org/abs/2406.14875 · https://huggingface.co/datasets/nvidia/hifitts-2 ·
https://www.isca-archive.org/interspeech_2025/langman25_interspeech.pdf ·
https://www.openslr.org/109/ · https://www.openslr.org/141/ · https://arxiv.org/abs/2305.18802 ·
https://keithito.com/LJ-Speech-Dataset/ · https://www.openslr.org/94/ ·
https://en.wikipedia.org/wiki/Common_Voice ·
https://discourse.mozilla.org/t/explicitly-forbidding-limiting-tts-usage/115072 ·
NC (excluded): https://zenodo.org/records/4660670 · https://huggingface.co/datasets/ylacombe/expresso ·
https://sp-uhh.github.io/ears_dataset/ · https://huggingface.co/datasets/amphion/Emilia ·
SA trap: https://huggingface.co/datasets/MLCommons/peoples_speech
