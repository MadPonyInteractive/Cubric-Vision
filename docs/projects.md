# Project System

## Project JSON Shape

```json
{
  "id": "uuid",
  "name": "My Project",
  "folderPath": "documents/MpiAiSuite/projects/my-project/",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "thumbnail": "relative/path.png",
  "itemGroups": [Group],
  "tutorialSeen": false,
  "modelSettings": {
    "flux_dev": { "lora_1": null, "upscaleModel": "4x_NMKD-Siax_200k.pth" }
  },
  "toolSettings": {}
}
```

## Group Shape

```json
{
  "id": "uuid",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "items": [Item],
  "selectedIndex": 0,
  "cardWidth": 512,
  "cardHeight": 512,
  "seed": 12345
}
```

## Item Shape

```json
{
  "id": "uuid",
  "createdAt": "ISO8601",
  "type": "image|video",
  "mediaPath": "relative/path.png",
  "thumbnailPath": "relative/thumb.png",
  "prompt": "positive prompt text",
  "negativePrompt": "negative prompt text",
  "params": { "steps": 20, "seed": 12345, "model": "flux_dev", ... },
  "history": [HistoryEntry]
}
```

## Media Folder Structure

```
projects/
  my-project/
    project.json
    media/
      item-uuid.png
      item-uuid-thumb.png
```

## Portability

Projects are self-contained folders. The `folderPath` field points to the project root on disk. `mediaPath` fields inside items are relative to that root. This makes projects portable — copy the folder to another machine and it works (as long as models are also available there).

## Project Manager (`js/managers/projectManager.js`)

- `createProject(name)`: Creates folder + project.json.
- `listProjects()`: Lists all projects under `documents/MpiAiSuite/projects/`.
- `openProject(id)`: Loads project, sets `state.currentProject`, fires `project:changed`.
- `updateProject(project)`: Saves project JSON to disk.
- `saveProjectSettings()`: Persists modelSettings + toolSettings to the open project.
- `deleteProject(id)`: Deletes project folder.

`openProject()` fires `project:changed` via `Events.emit()`.
