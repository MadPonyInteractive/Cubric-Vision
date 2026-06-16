# MPI-93 Checklist

- [ ] F8 - Crash-watchdog backstop live verify: start a remote Pod, simulate an app crash or kill so normal shutdown teardown does not run, then leave the Pod with no authenticated traffic for about 15 minutes and confirm in the RunPod console that it transitions to STOPPED from the wrapper idle-watchdog rather than staying up indefinitely.
