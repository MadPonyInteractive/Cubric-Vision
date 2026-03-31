/**
 * PromptBox.js — Reusable Prompt Input Component
 * 
 * Extracted from the original generator.js file. This class encapsulates all the 
 * repetitive boilerplate for tool prompt text areas, including:
 * - Positive/Negative prompt mode toggling (with icon & color changes)
 * - Persisting entered prompts to localStorage per tool
 * - Handling Drag-and-Drop and Paste events for images
 * - A built-in "Copy Prompt" button
 *
 * RULES FOR AGENTS:
 * - Do NOT manually look up prompt DOM nodes, copy buttons, or drag listeners in tool files.
 * - Always instantiate `new PromptBox({ container: ... })` instead.
 * - If a tool doesn't need Positive/Negative inputs (like LLM tools), simply 
 *   omit the `toggleContainer` argument and it will remain in standard text mode.
 * - For specialized tools like Prompt Builder, set `readonly: true` to let the module
 *   manage state while external custom dropdowns inject text into it.
 */

import { applyPromptMode } from '../toolUtils.js';
import { saveToolState, loadToolState } from '../toolState.js';

export class PromptBox {
    /**
     * @param {Object} options
     * @param {string} options.toolId Namespace for localStorage (e.g., 'generator', 'detailer')
     * @param {HTMLElement} options.container Empty container for the textarea
     * @param {HTMLElement} [options.toggleContainer] Empty container for the positive/negative toggle button
     * @param {boolean} [options.enableDragDrop=true]
     * @param {boolean} [options.readonly=false] If true, textarea will be read-only
     * @param {Function} [options.onImageDrop] Async callback when an image is dropped/pasted
     */
    constructor(options) {
        this.toolId = options.toolId;
        this.container = options.container;
        this.toggleContainer = options.toggleContainer;
        
        this.enableDragDrop = options.enableDragDrop !== false;
        this.readonly = options.readonly || false;
        this.onImageDrop = options.onImageDrop || null;

        this.positivePrompt = '';
        this.negativePrompt = '';
        this.currentMode = 'pos'; // 'pos' or 'neg'

        this.initDOM();
        this.loadState();
        this.bindEvents();
    }

    initDOM() {
        // Inject Textarea
        const readonlyAttr = this.readonly ? 'readonly' : '';
        this.container.innerHTML = `
            <div class="prompt-box-wrapper" style="position: relative; width: 100%;">
                <button class="prompt-height-toggle" title="Toggle Compact Mode">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 10l5 5 5-5H7z" /></svg>
                </button>
                <textarea class="prompt-box-input" placeholder="What do you want to create?" rows="1" style="padding-right: 2.5rem;" ${readonlyAttr}></textarea>
                <button class="copy-prompt-btn btn secondary small icon-only" title="Copy Prompt"
                    style="position: absolute; top: 6px; right: 6px; background: transparent; border: none; color: var(--text-2); pointer-events: auto;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                </button>
            </div>
        `;
        this.inputEl = this.container.querySelector('.prompt-box-input');
        this.copyBtn = this.container.querySelector('.copy-prompt-btn');

        // Inject Toggle Button if a container is provided
        if (this.toggleContainer) {
            this.toggleContainer.innerHTML = `
                <button class="prompt-mode-toggle btn secondary small icon-only"
                    title="Toggle Positive/Negative Prompt"
                    style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05);">
                    <svg class="prompt-mode-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                </button>
            `;
            this.toggleBtn = this.toggleContainer.querySelector('.prompt-mode-toggle');
            this.iconEl = this.toggleContainer.querySelector('.prompt-mode-icon');
        } else {
            this.toggleBtn = null;
            this.iconEl = null;
        }

        // Initialize auto-expand behavior matching the standalone uiHelpers.js pattern
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = (this.inputEl.scrollHeight) + 'px';
        });
    }

    loadState() {
        const saved = loadToolState(this.toolId);
        if (saved) {
            this.positivePrompt = saved.positivePrompt || saved.prompt || '';
            this.negativePrompt = saved.negativePrompt || '';
            // Handle legacy promptMode formats
            if (saved.promptMode === 'negative' || saved.promptMode === 'neg') {
                this.currentMode = 'neg';
            } else {
                this.currentMode = 'pos';
            }
        }
        this._updateUI();
    }

    // Explicitly set the positive prompt (e.g. from state routing)
    setPrompt(promptText) {
        if (this.currentMode === 'neg') {
            this.negativePrompt = this.inputEl.value; // save current typed text
            this.currentMode = 'pos';
        }
        this.positivePrompt = promptText;
        this._updateUI();
        this._saveState();
    }

    bindEvents() {
        // Auto-save on interaction
        this.inputEl.addEventListener('input', () => {
            if (this.currentMode === 'neg') {
                this.negativePrompt = this.inputEl.value;
            } else {
                this.positivePrompt = this.inputEl.value;
            }
            this._saveState();
        });

        // Copy button
        this.copyBtn.addEventListener('click', () => {
            const val = this.inputEl.value.trim();
            if (!val) return;
            navigator.clipboard.writeText(val).then(() => {
                const originalColor = this.copyBtn.style.color;
                this.copyBtn.style.color = 'var(--accent-color)';
                setTimeout(() => this.copyBtn.style.color = originalColor, 1000);
            }).catch(err => console.error(`[PromptBox] Copy failed:`, err));
        });

        // Toggle button
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Save current value before switching
                if (this.currentMode === 'pos') {
                    this.positivePrompt = this.inputEl.value;
                    this.currentMode = 'neg';
                } else {
                    this.negativePrompt = this.inputEl.value;
                    this.currentMode = 'pos';
                }
                this._updateUI();
                this._saveState();
            });
        }

        // Drag/Drop and Paste
        if (this.enableDragDrop && this.onImageDrop) {
            this.inputEl.addEventListener('dragover', (e) => { e.preventDefault(); this.inputEl.classList.add('drag-over'); });
            this.inputEl.addEventListener('dragleave', () => this.inputEl.classList.remove('drag-over'));
            this.inputEl.addEventListener('drop', async (e) => {
                e.preventDefault();
                this.inputEl.classList.remove('drag-over');
                
                const url = e.dataTransfer.getData('text/plain');
                if (url && (url.startsWith('http') || url.startsWith('/')) && this.onImageDrop) {
                    await this.onImageDrop(url);
                    return;
                }

                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                for (const f of files) await this.onImageDrop(f);
            });

            this.inputEl.addEventListener('paste', async (e) => {
                // Ignore paste if it's text
                if (e.clipboardData.types.includes('text/plain')) return;
                
                const items = Array.from(e.clipboardData?.items || []).filter(it => it.type.startsWith('image/'));
                if (items.length > 0) {
                    e.preventDefault();
                    for (const item of items) {
                        const file = item.getAsFile();
                        if (file) await this.onImageDrop(file);
                    }
                }
            });
        }
    }

    _updateUI() {
        // Sync the textarea value
        this.inputEl.value = (this.currentMode === 'neg') ? this.negativePrompt : this.positivePrompt;
        
        // Use our shared utility for visuals!
        applyPromptMode(this.currentMode, this.inputEl, this.iconEl, this.toggleBtn, {
            posPlaceholder: "What do you want to create?",
            negPlaceholder: "Enter negative prompt..."
        });
        
        // Trigger resize auto-expand
        this.inputEl.dispatchEvent(new Event('input'));
    }

    _saveState() {
        saveToolState(this.toolId, {
            promptMode: this.currentMode,
            prompt: this.positivePrompt, // legacy key
            positivePrompt: this.positivePrompt,
            negativePrompt: this.negativePrompt
        });
    }

    // To be called when tool resets or changes project
    reset() {
        this.positivePrompt = '';
        this.negativePrompt = '';
        this.currentMode = 'pos';
        this._updateUI();
    }
}
