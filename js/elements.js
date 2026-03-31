/**
 * elements.js — Returns fresh DOM element references.
 *
 * Because the Prompt Enhancer HTML is injected from a <template> each time
 * the tool is mounted, we cannot cache refs at module load time.
 * Call refreshElems() after the template is cloned into the DOM, then
 * assign the result to the shared `els` export.
 */

export let els = {};

export function refreshElems() {
    els = {
        // Step 1
        modelTypeOptions: document.querySelectorAll('input[name="modelType"]'),
        machineModelSelector: document.getElementById('machineModelSelector'),
        basePromptGroup: document.getElementById('basePromptGroup'),
        basePrompt: document.getElementById('basePrompt'),
        dropZone: document.getElementById('basePrompt'),
        fileInput: document.getElementById('fileInput'),
        refineBtn: document.getElementById('refineBtn'),
        peGenerateBtn: document.getElementById('generateDirectBtn'),
        peCopyPromptInlineBtn: document.getElementById('pe-copyPromptInlineBtn'),

        // Step 2
        dynamicFormContainer: document.getElementById('dynamicFormContainer'),
        prevStep2: document.getElementById('prevStep2'),

        // Step 3
        loadingState: document.getElementById('loadingState'),
        loadingText: document.getElementById('loadingText'),
        resultState: document.getElementById('resultState'),
        finalPromptText: document.getElementById('finalPromptText'),
        finalPromptEdit: document.getElementById('finalPromptEdit'),
        editBtn: document.getElementById('editBtn'),
        editControls: document.getElementById('editControls'),
        cancelEditBtn: document.getElementById('cancelEditBtn'),
        saveEditBtn: document.getElementById('saveEditBtn'),
        prevStep3: document.getElementById('prevStep3'),
        startOverBtn: document.getElementById('startOverBtn'),

        // Persistent action bar (always visible above wizard steps)
        copyBtn: document.getElementById('copyBtn'),
        goToGeneratorBtn: document.getElementById('goToGeneratorBtn'),

        // Template controls (live in the outer shell header, always present)
        templateSelector: document.getElementById('templateSelector'),
        saveTemplateBtn: document.getElementById('saveTemplateBtn'),
        deleteTemplateBtn: document.getElementById('deleteTemplateBtn'),

        // Wizard sections
        steps: {
            1: document.getElementById('step1'),
            2: document.getElementById('step2'),
            3: document.getElementById('step3'),
        },

        // Prompt Builder (Stage 11)
        pbPromptGroup: document.getElementById('pbPromptGroup'),
        pbPromptBox: document.getElementById('pb-promptBox'),
        pbToolSelectBtn: document.getElementById('pb-toolSelectBtn'),
        pbToolMenu: document.getElementById('pb-toolMenu'),
        pbSubmitBtn: document.getElementById('pb-submitBtn'),
        pbCopyPromptBtn: document.getElementById('pb-copyPromptBtn'),
        pbDynamicForm: document.getElementById('pb-dynamicForm'),
        pbAddedToolsList: document.getElementById('pb-addedToolsList'),
        pbListEmptyState: document.getElementById('pb-listEmptyState'),
        pbEmptyFormState: document.getElementById('pb-emptyFormState'),
        pbToolEditorContainer: document.getElementById('pb-toolEditorContainer'),
        pbListFooter: document.getElementById('pb-listFooter'),
        pbViewPromptBtn: document.getElementById('pb-viewPromptBtn'),
        pbViewPromptOverlay: document.getElementById('pbViewPromptOverlay'),
        pbFinalPromptTextarea: document.getElementById('pb-finalPromptTextarea'),
        pbCloseOverlayBtn: document.getElementById('pb-closeOverlayBtn'),
        pbOverlayCopyBtn: document.getElementById('pb-overlayCopyBtn'),
        pbOverlayGenerateBtn: document.getElementById('pb-overlayGenerateBtn'),
        pbGlobalTemplateSelector: document.getElementById('pb-globalTemplateSelector'),
        pbGlobalSaveTemplateBtn: document.getElementById('pb-globalSaveTemplateBtn'),
        pbGlobalDeleteTemplateBtn: document.getElementById('pb-globalDeleteTemplateBtn'),
        pbToolTemplateSelector: document.getElementById('pb-toolTemplateSelector'),
        pbToolSaveTemplateBtn: document.getElementById('pb-toolSaveTemplateBtn'),
        pbToolDeleteTemplateBtn: document.getElementById('pb-toolDeleteTemplateBtn')
    };
    return els;
}
