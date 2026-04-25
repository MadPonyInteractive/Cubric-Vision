/**
 * memoryOps.js — Global VRAM and RAM release operations.
 * Communicates with ComfyUI and LLM services.
 */

import { unloadModel } from '../services/llmService.js';
import { Hotkeys } from '../managers/hotkeyManager.js';

/**
 * Triggers memory release and updates the monitor UI.
 * @param {boolean} isDeep - If true, performs a deep clean (unload everything).
 * @param {HTMLElement} monitorEl - The MpiMemoryMonitor component element.
 */
export async function triggerMemoryRelease(isDeep = false, monitorEl) {
  const statusPrefix = isDeep ? 'Deep Cleaning...' : 'Releasing VRAM...';
  if (monitorEl?.showStatus) monitorEl.showStatus(statusPrefix);

  try {
    // 1. Unload LLM
    await unloadModel().catch(err => console.error('[shell/memoryOps] LLM unload failed:', err));

    // 2. Unload ComfyUI models
    const comfyRes = await fetch('/comfy/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deep: isDeep }),
    }).catch(() => null);

    // Fallback to direct ComfyUI API if the internal proxy fails
    if (comfyRes && !comfyRes.ok) {
      await fetch('http://127.0.0.1:8188/extra/unload_models', { method: 'POST' }).catch(() => null);
    }

    if (monitorEl?.showStatus) {
      monitorEl.showStatus(isDeep ? 'Deep Clean ✓' : 'VRAM Released ✓');
    }
  } catch (err) {
    console.error('[shell/memoryOps] Global unload failed:', err);
    if (monitorEl?.showStatus) {
      monitorEl.showStatus('Unload Failed');
    }
  }
}

/**
 * Registers the F5/Ctrl+F5 global hotkeys for memory release.
 * @param {HTMLElement} monitorEl - The monitor element to update.
 */
export function bindMemoryHotkeys(monitorEl) {
  Hotkeys.bind('memory.refresh', (e) => {
    triggerMemoryRelease(e.ctrlKey, monitorEl);
  });
}
