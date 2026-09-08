# MPI-614 Checklist

Scope corrected by Fabio 2026-08-24: **this card is detection only.** The "filter the picker
by model" half is dropped - see `validation.md` § Scope decision. Users organise their own
LoRA folders and the app does not police them.

- [ ] decide the detection site (loader-side pre-flight vs app-side log read) - see
      `validation.md` § The two candidate sites
- [ ] detect a LoRA that binds nothing, and fail loudly instead of finishing green
- [ ] message names the file and says why, so it is not read as "the rack is not wired"
- [ ] verify: a Klein 9B style LoRA on a 4B run is reported, not silently ignored
- [ ] verify: works on BOTH engines - local (48188) and remote Pod. A Pod run never proves
      the local branch and vice versa
- [ ] verify: a correctly-matched LoRA still loads with no new noise
