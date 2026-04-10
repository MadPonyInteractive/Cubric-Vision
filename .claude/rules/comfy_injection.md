# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** This file contains the mandatory rules for mapping UI variables and images directly into ComfyUI Workflows via the frontend controller.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Title-Based Mapping:** `ComfyUIController.runWorkflow()` maps variables dynamically based on the **Title** of the node inside the raw JSON workflow, NOT the Node ID or Class Type. E.g., if you pass `{ "Seed": 1234 }`, it looks for a node titled exactly "Seed".
2. **Uploading Images & Masks:** 
   - Never send raw DOM File objects directly to ComfyUI.
   - If your parameter key is `"Image"`, `"Input_Image"`, `"Mask"`, or `"Input_Mask"`, the Controller automatically intercepts this and attempts to upload it via `_uploadImage`.
   - You MUST pass valid Data URIs, Object URLs (`blob:`), external URLs (`http`), or local project files to these properties so the controller's interception succeeds.
3. **Never Direct Fetch:** NEVER use `fetch('http://127.0.0.1:8188/...')` directly from UI components. You MUST use `ComfyUIController`.

---

## 🛠️ Implementation Patterns

### 1. Triggering a Workflow
```javascript
import { ComfyUIController } from '../services/comfyController.js';

// The payload keys must exactly match the Node Titles in the target .json workflow
const params = {
    "Positive": "A beautiful landscape",
    "Negative": "blurry, worst quality",
    "Seed": 45678,
    "Width": 1024,
    "Height": 1024,
    "Input_Image": "data:image/png;base64,iVBOR..." // Controller will auto-upload this
};

try {
    ComfyUIController.setLoading(true);
    const result = await ComfyUIController.runWorkflow('sdxl_t2i_nsfw', params, (msg) => {
        // Optional WebSocket listener for live progress
        if (msg.type === 'preview') {
            console.log("Got preview frame:", msg.url);
        }
    });
    
    // Result contains the final image URLs
    console.log(result.images); 
} catch (e) {
    console.error("Workflow failed", e);
} finally {
    ComfyUIController.setLoading(false);
}
```

### 2. Handling Masks in UI
When building UI that requires a mask (like Inpainting), the standard flow is:
1. Export the canvas drawing as a `data:` URI.
2. Ensure the workflow JSON has a node titled "Input_Mask".
3. Pass the URI in the `params` payload as `Input_Mask: myDataUri`.
4. The controller handles the physical backend upload automatically.
