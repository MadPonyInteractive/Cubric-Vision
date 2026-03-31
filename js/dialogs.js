export function showAlert(message, title = "Notice") {
    return new Promise((resolve) => {
        const modal = document.getElementById('globalAlertModal');
        const titleEl = document.getElementById('globalAlertTitle');
        const msgEl = document.getElementById('globalAlertMessage');
        const okBtn = document.getElementById('globalAlertOkBtn');

        if (!modal || !titleEl || !msgEl || !okBtn) {
            console.error("Alert modal not found in DOM");
            resolve();
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;

        const handleOk = () => cleanup();
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            }
        };

        const cleanup = () => {
            modal.classList.add('hide');
            okBtn.removeEventListener('click', handleOk);
            window.removeEventListener('keydown', handleKeyDown);
            resolve();
        };

        okBtn.addEventListener('click', handleOk);
        window.addEventListener('keydown', handleKeyDown);
        modal.classList.remove('hide');
    });
}

export function showConfirm(message, title = "Confirm") {
    return new Promise((resolve) => {
        const modal = document.getElementById('globalConfirmModal');
        const titleEl = document.getElementById('globalConfirmTitle');
        const msgEl = document.getElementById('globalConfirmMessage');
        const okBtn = document.getElementById('globalConfirmOkBtn');
        const cancelBtn = document.getElementById('globalConfirmCancelBtn');

        if (!modal) {
            console.error("Confirm modal not found in DOM");
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;

        const handleOk = () => cleanup(true);
        const handleCancel = () => cleanup(false);

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        const cleanup = (result) => {
            modal.classList.add('hide');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            window.removeEventListener('keydown', handleKeyDown);
            resolve(result);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        window.addEventListener('keydown', handleKeyDown);
        modal.classList.remove('hide');
    });
}

export function showPrompt(message, title = "Input") {
    return new Promise((resolve) => {
        const modal = document.getElementById('globalPromptModal');
        const titleEl = document.getElementById('globalPromptTitle');
        const msgEl = document.getElementById('globalPromptMessage');
        const inputEl = document.getElementById('globalPromptInput');
        const okBtn = document.getElementById('globalPromptOkBtn');
        const cancelBtn = document.getElementById('globalPromptCancelBtn');

        if (!modal) {
            console.error("Prompt modal not found in DOM");
            resolve(null);
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputEl.value = "";

        const handleOk = () => cleanup(inputEl.value);
        const handleCancel = () => cleanup(null);

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        const cleanup = (result) => {
            modal.classList.add('hide');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            window.removeEventListener('keydown', handleKeyDown);
            resolve(result);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        window.addEventListener('keydown', handleKeyDown);

        modal.classList.remove('hide');
        setTimeout(() => inputEl.focus(), 50);
    });
}
