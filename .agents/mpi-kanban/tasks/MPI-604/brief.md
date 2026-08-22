# MPI-604 Brief

Build `MpiFader`, the dB gain control that `MpiLevelMeter` needs as its
counterpart: a linear-in-dB scale with a unity (0 dB) detent that snaps within a
tolerance.

Split out of MPI-573 because that card is the mic recorder + audio output type;
the fader belongs to the vocals + foley mixing Flow Fabio plans next. It has no
Flow dependency, so it ships and closes on its own.

**The distinction that produced it:** a fader is 0 dB = unity, the neutral
middle. A level meter is 0 dBFS = full scale, the ceiling. Detail and decisions
in `plan.md`.
