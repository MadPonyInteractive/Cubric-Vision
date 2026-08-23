# MPI-607 Checklist

- [ ] Implementation
- [x] Step 2b - Qwen VoiceDesign -> Chatterbox clone chain runs end to end (PASSED - Fabio heard it, clones are spot-on)
- [x] Step 2b' - Qwen3-TTS VoiceDesign runs locally on the bench in an isolated transformers-4 runtime; option B core gate passed (quality awaiting Fabio's listen)
- [x] Step 2b' RESOLVED - Qwen NOT shipped; Chatterbox + self-authored library is the route
- [x] Accent via VoiceDesign - CLOSED NEGATIVE after 22 generations; American prior, not controllable
- [ ] Does a GENUINELY accented reference survive Chatterbox? (all tests so far used accent-free refs)
- [ ] Multilingual clone durations are anomalous (22-30s for ~12 words) - sweep repetition_penalty/min_p/top_p
- [x] Emotion transfer - WORKS at cfg_weight 0.3 (node default 0.5 suppresses it)
- [ ] Library size decider - does emotional TEXT on a NEUTRAL voice work at cfg 0.3? (mpi607_emotion3)
- [x] Speaker-similarity QA gate built (research/speaker_similarity.py, CAMPPlus cosine)
- [x] Identity holds across emotions IF acoustic lines frozen - voice-dependent, gate every variant
- [x] VC pipeline PASSES at exaggeration 1.2 - architecture settled: ~60 neutral + ~5 performance clips
- [ ] Library taxonomy - ~60 voices, gender x age x type, tags not folders (brainstorm, not started)
- [ ] Author the performance clips - the quality lever; iterate until each drives strong emotion
- [ ] Step 3 SHIP CHATTERBOX - unblocked all day, not started, needs nothing above settled
