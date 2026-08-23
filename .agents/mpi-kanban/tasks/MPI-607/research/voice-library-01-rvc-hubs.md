# Branch B research 1/4 — the RVC voice hubs

Dispatched 2026-08-23. Answers the first of Fabio's three ordered checks on his specific
idea: use RVC hub **preview clips** as Chatterbox clone references (the `.pth` voice
models themselves being useless to us).

**Verdict: NOT VIABLE.** Three independent legs, any one of which is disqualifying.

## weights.gg — defunct

Reported shut down **2026-03-31** following an OpenAI acquisition (publicly reported
2026-05-15). Domain reported to redirect to `weights.com/blog`, which 404s.

> **Confidence note.** This is a single agent's web research, corroborated across four
> sources (biometricupdate, winbuzzer, techstrong, oreateai) but NOT independently
> verified from this machine — the shell has no network egress (curl returned `000` for
> every domain tested, including one the agent successfully fetched, so the check was
> inconclusive rather than confirming). The agent could not reach Web Archive, so no
> historical ToS text was quoted. Treat the shutdown as well-sourced but unconfirmed.

Pre-shutdown characterisation, if we ever need the history: no upfront consent
verification, catalogue openly containing Taylor Swift / Samuel L. Jackson / Sinatra /
Trump / Bugs Bunny, ~500k AI audio creations per day at peak.

## voice-models.com — live, but grants us nothing

- **No Terms of Service at all.** `/tos` returns 404. The privacy policy covers cookies
  and ad networks only — no IP clauses, no content licensing, no user rights over audio.
  **Silence means no rights granted**, so there is no chain of title to preview audio.
- **Catalogue composition** (sampled from `/top`, characterisation not a full audit):
  ~50% copyrighted characters (Hatsune Miku, Genshin Impact, Blue Archive, TF2, Pokémon,
  MLP), ~25% real people (Kanye West, Arijit Singh, Anuel AA, political figures), ~20%
  generic descriptors, ~5% VTubers. So ~75% is non-consensual celebrity or character
  cloning.
- **Takedown** is a bare form, no published DMCA policy, no timeline, no appeal, 512(c)
  agent status UNVERIFIED.
- **Not programmatically fetchable.** `robots.txt` is `Allow: /`, but previews load via a
  "click to load sample" mechanism with a pitch slider (-16..+16 semitones) — computed
  delivery, no static `<audio src>` CDN path. The `.pth` files themselves are offsite on
  Google Drive / Hugging Face; the hub is an index, not a host.

## The technical leg, independent of any licensing question

**RVC is a SINGING voice conversion tool.** Its canonical use is AI covers: isolate a
song's vocal, run it through a voice model, get that song sung by someone else. The
previews reflect that — typically **singing over instrumental backing**, which is why the
UI has a semitone pitch slider at all.

Chatterbox wants 6-15s of clean, single-speaker, conversational speech, no background,
44.1/48kHz, and its own guide says to avoid "highly dramatic or musical content". A
singing demo over an instrumental is close to the worst possible reference input. Even
with perfect licensing and a working API, the yield of usable clips would be very low.

## Comparable hubs surveyed

| Hub | Verdict |
|---|---|
| AI Hub (docs.aihub.gg, Discord) | Not viable. No consent requirement; uploads guided to "openrail", which covers weights not the target voice. Previews live in Discord — not addressable. Same celebrity/character composition. |
| Hugging Face RVC collections | Not viable. Inherit the source communities' consent/IP problems; HF ToS itself forbids using the platform to violate IP. Preview audio IS directly fetchable, but no rights chain. |
| rvc-models.com | DNS does not resolve. |

## Bottom line

A shipping commercial product cannot legitimately build a voice library on these sources.
Legal chain absent, catalogue ~75% non-consensual, delivery not fetchable, and the audio
is the wrong signal type for Chatterbox regardless.

There is also a brand leg specific to Vision: shipping a library of non-consensual
celebrity replicas directly contradicts watermarking-on-principle.

**The only viable curated-library route is voices recorded with documented consent** —
which is what research file 2 (permissive corpora) and file 4 (synthetic voices) test.

## Sources

- https://voice-models.com/ , `/top` , `/robots.txt` , `/takedown` , `/privacy`
- https://discover.oreateai.com/discover/openai-acquired-weightsgg-and-ended-the-wild-west-of-ai-voice-cloning
- https://www.biometricupdate.com/202605/openai-quietly-acquires-ai-voice-cloning-startup-weights-gg
- https://winbuzzer.com/2026/05/17/openai-buys-ai-voice-startup-weights-xcxwbn/
- https://techstrong.ai/articles/openai-quietly-acquires-voice-cloning-startup-weights-gg-amid-rising-synthetic-media-controversies/
- https://docs.aihub.gg/essentials/how-to-make-ai-cover/
- Chatterbox voice-cloning requirements: https://yocxy2-chatterboxyocxy.mintlify.app/guides/voice-cloning
