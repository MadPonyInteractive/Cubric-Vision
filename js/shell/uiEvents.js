/**
 * uiEvents.js — Global UI interaction listeners: Info Bar, Context Menus, and Shortcuts.
 */

/**
 * Binds [data-info] hover listeners to update the shell status bar.
 */
export function bindInfoBarEvents() {
  const infoText = document.getElementById('shell-info-text');
  if (!infoText) return;

  let currentTarget = null;
  const observer = new MutationObserver(() => {
    if (!currentTarget) return;
    const info = currentTarget.getAttribute('data-info');
    if (info && infoText.textContent !== info) infoText.textContent = info;
  });

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-info]');
    if (target && target !== currentTarget) {
      currentTarget = target;
      observer.disconnect();
      observer.observe(target, { attributes: true, attributeFilter: ['data-info'] });

      const info = target.getAttribute('data-info');
      if (info && infoText.textContent !== info) {
        infoText.classList.add('updating');
        setTimeout(() => {
          infoText.textContent = info;
          infoText.classList.remove('updating');
        }, 80);
      }
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-info]');
    if (target && target === currentTarget && (!e.relatedTarget || !target.contains(e.relatedTarget))) {
      currentTarget = null;
      observer.disconnect();
      infoText.classList.add('updating');
      setTimeout(() => {
        infoText.textContent = 'Ready';
        infoText.classList.remove('updating');
      }, 80);
    }
  });
}

