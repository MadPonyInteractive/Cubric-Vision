# MPI-377 — Dropped media must become a history entry

## Symptom

Drag an image onto the History workspace: no entry, no canvas load, no feedback. The
user finds out where it went only after running an op and seeing the dropped image come
out of the latents. User's words: it "works as a bug".

## Root cause — located, not guessed

`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` ~787:

```js
const _dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
    onDrop: async ({ files }) => {
        …
        for (const { file, mediaType } of files) {
            const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
            if (uploaded) _pb?.el?.injectMedia?.({ url: uploaded.filePath, mediaType });
        }
    },
});
```

`injectMedia` stages a prompt chip. That is the *entire* handler. Nothing creates an
item, appends to history, updates the list, or loads the viewer. The drop overlay and
the upload both work correctly — the handler is half a feature.

## Fix

The correct sequence already exists in this same file, in `_runComposite` (~1753-1766):

```js
const item = createImageItem({ … });
_group = appendToHistory(_group, item);
_currentIdx = _group.selectedIndex;
_persistGroup();
historyList.el.appendEntry(item);
Events.emit('history:stats-dirty', { group: _group });
await viewer.el.loadEntry?.(item, _currentIdx);
```

Reuse that path for dropped files. Do not invent a second one.

## The one design call: entry AND chip, or entry only?

Chip staging is **load-bearing in video mode**. Dropping a start/end frame is how a user
unlocks the frame-driven i2v ops when nothing is staged (comments at ~217 and ~919),
and `_isVideoPromptToolActive()` deliberately routes drops to the PromptBox while the
video prompt tool is active. Ripping the chip out globally would fix an image-mode bug
by breaking a video-mode feature.

Recommended: image drops create an entry **and** stage the chip (the chip is what the
user wanted for the next run anyway); video-mode prompt-tool drops keep today's
chip-only behaviour. Confirm before coding — it is a one-line branch either way.

## Edges worth covering

- multi-file drop → one entry per file, in drop order
- failed upload → toast, not silence
- persistence → `_persistGroup()` so the entry survives a reload
