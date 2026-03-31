import { state } from '../state.js';
import { getFirstAvailableModel, getModelById } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { llamaGenerate } from '../llmService.js';
import { resizeImageIfNeeded } from '../imageProcessor.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { showAlert, showConfirm, showPrompt } from '../dialogs.js';
import { setLlmButtonState, onLlmRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

let _abortCtrl = null;
let currentChatId = null;
let currentChatHistory = [];
let _runLlmRef = null; // set during initLlm so we can export a stable reference

import { PromptBox } from '../components/PromptBox.js';
let promptBox;

const HISTORY_KEY = 'llm_chats';
const PRESETS_KEY = 'llm_templates';

export function initLlm() {
    _abortCtrl = null;
    state.llmImages = [];

    promptBox = new PromptBox({
        toolId: 'llm',
        container: document.getElementById('llm-prompt-wrapper'),
        onImageDrop: async (item) => {
            if (typeof item === 'string') {
                 try {
                     const res = await fetch(item);
                     const blob = await res.blob();
                     const filename = item.split('/').pop() || 'dropped_image.png';
                     const file = new File([blob], filename, { type: blob.type });
                     await addImage(file);
                 } catch (e) {
                     console.error('Dropped URL image load failed:', e);
                 }
            } else {
                 await addImage(item);
            }
        }
    });

    const thumbStrip = document.getElementById('llm-thumbs');
    const addAssetBtn = document.getElementById('llm-addAssetBtn');
    const chatContainer = document.getElementById('llm-chatContainer');
    const sendBtn = document.getElementById('llm-sendBtn');
    const loadingEl = document.getElementById('llm-loading');

    const templateSelector = document.getElementById('llm-templateSelector');
    const editTemplateBtn = document.getElementById('llm-editTemplateBtn');
    const deleteTemplateBtn = document.getElementById('llm-deleteTemplateBtn');
    const createTemplateBtn = document.getElementById('llm-createTemplateBtn');
    const createTemplateSection = document.getElementById('llm-createTemplateSection');
    const templateSectionTitle = document.getElementById('llm-templateSectionTitle');
    const cancelTemplateBtn = document.getElementById('llm-cancelTemplateBtn');
    const saveTemplateBtn = document.getElementById('llm-saveTemplateBtn');
    
    const newTemplateName = document.getElementById('llm-newTemplateName');
    const newTemplatePrefix = document.getElementById('llm-newTemplatePrefix');
    const newTemplateSuffix = document.getElementById('llm-newTemplateSuffix');

    const historyToggle = document.getElementById('llm-historyToggle');
    const historyPopup = document.getElementById('llm-historyPopup');
    const historyList = document.getElementById('llm-historyList');
    const newChatBtn = document.getElementById('llm-newChatBtn');

    if (!promptBox) return;

    // --- History Popup Toggle ---
    historyToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        historyPopup.classList.toggle('hide');
    });

    document.addEventListener('click', (e) => {
        if (!historyPopup.contains(e.target) && !historyToggle.contains(e.target)) {
            historyPopup.classList.add('hide');
        }
    });

    // --- History Management ---
    function loadHistoryList() {
        const chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        historyList.innerHTML = '';
        
        // Sort by date descending
        chats.sort((a, b) => b.updatedAt - a.updatedAt);

        if (chats.length === 0) {
            historyList.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">No recent chats.</div>';
            return;
        }

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `llm-chat-item ${chat.id === currentChatId ? 'active' : ''}`;
            item.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="opacity: 0.5;">
                    <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" />
                </svg>
                <span class="llm-chat-title">${chat.title || 'Untitled Chat'}</span>
                <div class="llm-chat-actions">
                    <div class="llm-action-icon rename-chat" title="Rename">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </div>
                    <div class="llm-action-icon danger delete-chat" title="Delete">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                    </div>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.llm-chat-actions')) return;
                switchChat(chat.id);
                historyPopup.classList.add('hide');
            });

            item.querySelector('.rename-chat').addEventListener('click', async (e) => {
                e.stopPropagation();
                const newTitle = await showPrompt('Enter new name for this chat:', 'Rename Chat');
                if (newTitle && newTitle.trim()) {
                    renameChat(chat.id, newTitle.trim());
                }
            });

            item.querySelector('.delete-chat').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
            });

            historyList.appendChild(item);
        });
    }

    function switchChat(chatId) {
        currentChatId = chatId;
        const chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const chat = chats.find(c => c.id === chatId);
        
        chatContainer.innerHTML = '';
        if (chat) {
            currentChatHistory = chat.messages || [];
            if (currentChatHistory.length > 0) {
                currentChatHistory.forEach(msg => {
                    appendMessage(msg.visualRole || msg.role.toLowerCase(), msg.visualContent || msg.content, msg.images || [], true);
                });
            } else {
                renderEmptyState();
            }
        }
        loadHistoryList();
    }

    function createNewChat(title = 'New Chat') {
        const id = 'chat_' + Date.now();
        const newChat = {
            id,
            title: title,
            messages: [],
            updatedAt: Date.now()
        };
        const chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        chats.push(newChat);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
        
        currentChatId = id;
        currentChatHistory = [];
        chatContainer.innerHTML = '';
        renderEmptyState();
        loadHistoryList();
    }

    function deleteChat(chatId) {
        let chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        chats = chats.filter(c => c.id !== chatId);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
        
        if (currentChatId === chatId) {
            if (chats.length > 0) {
                switchChat(chats[0].id);
            } else {
                createNewChat();
            }
        } else {
            loadHistoryList();
        }
    }

    function renameChat(chatId, newTitle) {
        const chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const chat = chats.find(c => c.id === chatId);
        if (chat) {
            chat.title = newTitle;
            localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
            loadHistoryList();
        }
    }

    function updateCurrentChat() {
        if (!currentChatId) return;
        const chats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages = currentChatHistory;
            chat.updatedAt = Date.now();
            
            // Auto-generate title if it's still "New Chat" and we have messages
            if (chat.title === 'New Chat' && currentChatHistory.length > 0) {
                const firstUserMsg = currentChatHistory.find(m => m.visualRole === 'user');
                if (firstUserMsg) {
                    const text = (firstUserMsg.visualContent || '').substring(0, 30);
                    chat.title = text + (text.length >= 30 ? '...' : '');
                }
            }
            
            localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
            loadHistoryList();
        }
    }

    function renderEmptyState() {
        chatContainer.innerHTML = `
            <div id="llm-emptyState" style="color:var(--text-muted); text-align:center; margin: auto; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style="opacity: 0.2;">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span>Start a new conversation with the local LLM.</span>
            </div>
        `;
    }

    newChatBtn?.addEventListener('click', () => {
        createNewChat();
        historyPopup.classList.add('hide'); // Close history if open
    });

    // --- State recovery ---
    const savedChats = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (savedChats.length > 0) {
        // Load most recent
        savedChats.sort((a, b) => b.updatedAt - a.updatedAt);
        switchChat(savedChats[0].id);
    } else {
        createNewChat();
    }

    // --- Templates handling ---
    function loadTemplates() {
        const savedTpls = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
        const currentVal = templateSelector.value;
        templateSelector.innerHTML = '<option value="">Load Preset...</option>';
        Object.keys(savedTpls).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            templateSelector.appendChild(opt);
        });
        templateSelector.value = currentVal;
        deleteTemplateBtn.disabled = !templateSelector.value;
        editTemplateBtn.disabled = !templateSelector.value;
    }
    
    loadTemplates();

    templateSelector.addEventListener('change', () => {
        const presetName = templateSelector.value;
        const hasVal = !!presetName;
        deleteTemplateBtn.disabled = !hasVal;
        editTemplateBtn.disabled = !hasVal;
        
        // Requirement: New chat on preset load with preset name as title
        if (hasVal) {
            createNewChat(presetName);
        } else {
            // Optional: load "New Chat" if cleared?
        }
    });

    createTemplateBtn.addEventListener('click', () => {
        templateSectionTitle.textContent = 'Create New Preset';
        saveTemplateBtn.textContent = 'Create';
        createTemplateSection.classList.remove('hide');
        newTemplateName.disabled = false;
        newTemplateName.value = '';
        newTemplatePrefix.value = '';
        newTemplateSuffix.value = '';
    });

    editTemplateBtn.addEventListener('click', () => {
        const title = templateSelector.value;
        if (!title) return;
        const savedTpls = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
        const preset = savedTpls[title];
        if (!preset) return;

        templateSectionTitle.textContent = `Edit Preset: ${title}`;
        saveTemplateBtn.textContent = 'Update';
        createTemplateSection.classList.remove('hide');
        newTemplateName.value = title;
        newTemplateName.disabled = true;
        newTemplatePrefix.value = preset.prefix || '';
        newTemplateSuffix.value = preset.suffix || '';
    });

    cancelTemplateBtn.addEventListener('click', () => {
        createTemplateSection.classList.add('hide');
    });

    saveTemplateBtn.addEventListener('click', () => {
        const title = newTemplateName.value.trim();
        if (!title) {
            showAlert('Please enter a preset title.');
            return;
        }
        const savedTpls = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
        savedTpls[title] = {
            prefix: newTemplatePrefix.value.trim(),
            suffix: newTemplateSuffix.value.trim()
        };
        localStorage.setItem(PRESETS_KEY, JSON.stringify(savedTpls));
        loadTemplates();
        templateSelector.value = title;
        deleteTemplateBtn.disabled = false;
        editTemplateBtn.disabled = false;
        createTemplateSection.classList.add('hide');
    });

    const confirmDeleteModal = document.getElementById('llm-confirmDeleteModal');
    const deleteConfirmText = document.getElementById('llm-deleteConfirmText');
    const confirmCancelBtn = document.getElementById('llm-cancelDeleteBtn');
    const confirmDeleteActualBtn = document.getElementById('llm-confirmDeleteBtn');

    let _pendingDeletePreset = null;

    deleteTemplateBtn.addEventListener('click', () => {
        const title = templateSelector.value;
        if (!title) return;
        _pendingDeletePreset = title;
        deleteConfirmText.textContent = `Are you sure you want to delete preset "${title}"?`;
        confirmDeleteModal.classList.remove('hide');
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmDeleteModal.classList.add('hide');
    });

    confirmDeleteActualBtn.addEventListener('click', () => {
        if (!_pendingDeletePreset) return;
        const savedTpls = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
        delete savedTpls[_pendingDeletePreset];
        localStorage.setItem(PRESETS_KEY, JSON.stringify(savedTpls));
        loadTemplates();
        confirmDeleteModal.classList.add('hide');
        _pendingDeletePreset = null;
    });

    // --- Images handling ---
    function renderThumbs() {
        thumbStrip.innerHTML = '';
        if (state.llmImages.length === 0) {
            thumbStrip.style.display = 'none';
            return;
        }
        thumbStrip.style.display = 'flex';
        state.llmImages.forEach((img, i) => {
            const card = document.createElement('div');
            card.className = 'thumb-card';
            card.innerHTML = `
                <img src="${img.objectUrl}" alt="${img.name}">
                <span class="thumb-remove" data-idx="${i}">✕</span>`;
            card.querySelector('.thumb-remove').addEventListener('click', () => {
                state.llmImages.splice(i, 1);
                renderThumbs();
            });
            thumbStrip.appendChild(card);
        });
    }

    async function addImage(file) {
        const { base64, url } = await resizeImageIfNeeded(file);
        state.llmImages.push({
            base64,
            name: file.name,
            objectUrl: url
        });
        renderThumbs();
    }

    addAssetBtn?.addEventListener('click', async () => {
        const { openAssetBrowser } = await import('../components/assetBrowserModal.js');
        openAssetBrowser(async (asset) => {
            try {
                const res = await fetch(asset.url);
                const blob = await res.blob();
                const file = new File([blob], asset.filename, { type: blob.type });
                await addImage(file);
            } catch (e) {
                console.error('URL image load failed:', e);
            }
        });
    });

    // --- Chat logic ---
    function appendMessage(role, text, images = [], isRestore = false) {
        const emptyState = document.getElementById('llm-emptyState');
        if (emptyState) emptyState.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}`;
        msgDiv.style.maxWidth = '85%';
        msgDiv.style.padding = '0.85rem 1rem';
        msgDiv.style.borderRadius = '12px';
        msgDiv.style.marginBottom = '0.5rem';
        msgDiv.style.whiteSpace = 'pre-wrap';
        msgDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        msgDiv.style.fontSize = '0.95rem';
        msgDiv.style.lineHeight = '1.5';

        if (role === 'user') {
            msgDiv.style.alignSelf = 'flex-end';
            msgDiv.style.backgroundColor = 'var(--primary-color)';
            msgDiv.style.color = '#fff';
            msgDiv.style.borderBottomRightRadius = '2px';
        } else {
            msgDiv.style.alignSelf = 'flex-start';
            msgDiv.style.backgroundColor = 'var(--bg-lighter)';
            msgDiv.style.borderBottomLeftRadius = '2px';
            msgDiv.style.border = '1px solid var(--border-color)';
        }

        if (images && images.length > 0) {
            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'chat-msg-thumbs';
            images.forEach(img => {
                const imgEl = document.createElement('img');
                imgEl.src = img.objectUrl;
                imgEl.className = 'chat-msg-thumb';
                imgEl.onclick = () => window.open(img.objectUrl, '_blank');
                thumbWrap.appendChild(imgEl);
            });
            msgDiv.appendChild(thumbWrap);
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        msgDiv.appendChild(textSpan);

        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function setLoading(isLoading) {
        state.llmRunning = isLoading;
        if (isLoading) setRunningTool('llm', 'llm');
        else clearRunningTool('llm');
        setLlmButtonState(sendBtn, isLoading, 'Send (Ctrl+Enter)', 'Stop (Ctrl+Enter)');
        if (isLoading) {
            loadingEl.classList.remove('hide');
        } else {
            loadingEl.classList.add('hide');
        }
    }

    async function runLlm() {
        const userText = promptBox.positivePrompt.trim();
        if (!userText && state.llmImages.length === 0) return;

        onLlmRunStart();

        const modelId = state.toolModelIds['llm'] || getFirstAvailableModel('llm')?.id;
        if (!modelId) {
            showAlert('No LLM model selected or installed. Please download one from the setup screen.');
            return;
        }

        const modelDef = getModelById(modelId);
        if (!modelDef) {
            showAlert('Invalid model selected.');
            return;
        }

        if (state.llmImages.length > 0 && modelDef.type !== 'vision') {
            showAlert(`The currently selected model ("${modelDef.name}") does not support images. Please remove the images or switch to a vision model.`);
            return;
        }

        let finalPromptToLLM = userText;
        const currentPresetName = templateSelector.value;
        if (currentPresetName) {
            const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
            const preset = saved[currentPresetName];
            if (preset) {
                const parts = [];
                if (preset.prefix) parts.push(preset.prefix);
                if (userText) parts.push(`"${userText}"`);
                if (preset.suffix) parts.push(preset.suffix);
                finalPromptToLLM = parts.join('\n');
            }
        }

        let systemPrompt = "You are a helpful AI assistant.";
        if (currentChatHistory.length > 0) {
            const historyContext = currentChatHistory.slice(-10).map(m => m.role + ": " + m.content).join('\n');
            systemPrompt += "\n\nPrevious conversation:\n" + historyContext;
        }

        _abortCtrl = new AbortController();
        setLoading(true);

        const imagesToPass = state.llmImages.length > 0 ? state.llmImages.map(img => img.base64) : undefined;
        const currentImages = [...state.llmImages]; 

        appendMessage('user', userText, currentImages);
        promptBox.inputEl.value = '';
        promptBox.inputEl.dispatchEvent(new Event('input')); // trigger auto resize
        state.llmImages = [];
        renderThumbs();

        try {
            const data = await llamaGenerate({
                modelId,
                prompt: finalPromptToLLM,
                system: systemPrompt,
                images: imagesToPass,
                signal: _abortCtrl.signal
            });

            const reply = cleanLLMResponse(data.response) || "(Empty response)";
            appendMessage('assistant', reply);
            
            currentChatHistory.push({ 
                role: 'User', 
                content: finalPromptToLLM, 
                visualRole: 'user', 
                visualContent: userText,
                images: currentImages.map(img => ({ name: img.name, objectUrl: img.objectUrl }))
            });
            currentChatHistory.push({ 
                role: 'Assistant', 
                content: reply, 
                visualRole: 'assistant', 
                visualContent: reply 
            });
            
            updateCurrentChat();

        } catch (e) {
            if (e.name === 'AbortError') {
                appendMessage('assistant', '[Stopped]');
            } else {
                appendMessage('assistant', `[Error: ${e.message}]`);
            }
        } finally {
            setLoading(false);
            _abortCtrl = null;
        }
    }

    sendBtn.addEventListener('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            runLlm();
        }
    });

    // Store module-level ref so exported runLlm() can call through it
    _runLlmRef = runLlm;
}

/**
 * Exported so init.js global Ctrl+Enter handler can call it.
 * Delegates to the inner closure captured during initLlm().
 */
export async function runLlm() {
    await _runLlmRef?.();
}

export function cancelLlm() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}
