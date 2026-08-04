# MPI-345 - Phantom generation: unrequested Head Swap fired alongside a Qwen edit

## What happened (observed live, 2026-07-23)

During the MPI-342 remote sweep on the `v0.17.0-dev-cu130` Pod, the user ran **one** Qwen
Image Edit with three input images. **Two** generations came back:

- `qwenEdit_001` - 1024x1024, 1m41s - the one asked for
- `appHeadSwap_002` - 896x1152, 9s - **nobody asked for this**

The completion toast read "2 generations finished."

## Evidence

`logs/app.log` (UTC; add 1h for the Pod console times in the session):

```
[2026-07-23T16:33:39.472Z] [INFO] [commandExecutor] Applied injector "headSwap"
[2026-07-23T16:42:12.771Z] [INFO] [commandExecutor] Applied injector "headSwap"
```

Two headSwap injector applications **8.5 minutes apart**. The first is the Head Swap the
user deliberately ran (`appHeadSwap_001`, 2m20s). The second lands at the time of the Qwen
edit.

**This rules out the Pod side**: the injector runs in the app, so the second dispatch was
produced by the app itself - not a wrapper queue replay, not a ComfyUI history artifact.

The 9s runtime is consistent with a warm qwen-edit model already resident in VRAM (the Head
Swap app uses `requiredModels: ['qwen-edit']`), so the phantom job reused the loaded model.

## Pod-side confirmation (container log, captured before the Pod was deleted)

```
GET /wrapper/history/a1b6c045-cc4f-4b21-8bfc-cc155f4f2def  200 OK
 25%|##5       | 1/4 [00:02<00:10,  3.48s/it]
 50%|#####     | 2/4 [00:02<00:02,  1.28s/it]
 75%|#######5  | 3/4 [00:04<00:01,  1.56s/it]
100%|##########| 4/4 [00:05<00:00,  1.42s/it]
[INFO] 0 models unloaded.
[INFO] Model WanVAE prepared for dynamic VRAM loading. 241MB Staged.
[INFO] Prompt executed in 8.52 seconds
```

Two things this nails down:

1. **It was a real, tracked submission.** The job has its own prompt id and the APP polled
   `/wrapper/history/<id>` for it - so the app submitted it and followed it to completion.
   Not a UI duplicate, not a history-replay artifact.
2. **It ran 4 steps - the same as `appHeadSwap_001`, which was the Hyper tier.** The phantom
   carried the SAME parameters as the earlier deliberate Head Swap. That favours a REPLAY of
   the previous job (queue/lane leftover, reuse re-fire) over "stale state constructed a new
   op", and it is the strongest single lead for the repro.

## What is NOT known

- **Root cause.** `commandExecutor` logs `Applied injector "headSwap"` but nothing about what
  triggered the dispatch, so the log cannot separate the candidates.
- **Whether it predates ComfyUI 0.28.** It was first *seen* during the 0.28 sweep; that is
  not evidence it was introduced by it. Do not assume either way.

## Candidate causes (none confirmed - do not code against these until reproduced)

1. Stale app-op state surviving exit from the Head Swap app workspace, so a later generate
   in the main workspace re-emits the app's op.
2. A leftover entry in the queue/lane from the earlier Head Swap (see the lane-keying work
   in MPI-283) that drains on the next dispatch.
3. A reuse / CUE path re-firing the previous app job.

## Suggested first step

Add dispatch-origin logging in `js/services/commandExecutor.js` - log WHY a generation was
dispatched (user action / queue drain / reuse / app op) alongside the injector line. Then
repro: run the Head Swap app, leave it, run a normal Qwen Image Edit from the main
workspace, and see whether a second job appears.

Reproduce LOCALLY first - the local engine is free and the phantom job only needs the
qwen-edit model, which the user has locally.

## Session context

- Pod `5sn0x7l1my2rvz`, image `v0.17.0-dev-cu130` (ComfyUI 0.28), RTX 4090.
- Sequence: Head Swap app run (16:33Z) -> various -> Qwen Image Edit with 3 images (16:42Z).
- The Qwen edit's own output quality was poor, but that is separately explained by the known
  multi-subject instability recorded when MPI-300 closed - a model limit, not this bug.
