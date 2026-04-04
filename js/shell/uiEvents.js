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

/**
 * Intercepts right-clicks globally to provide Media Context Menus.
 */
export function bindGlobalContextMenu() {
  document.addEventListener('contextmenu', async (e) => {
    e.preventDefault();

    const target = e.target;
    let mediaUrl = null;
    const mediaType = 'image';

    // 1. Direct Image
    if (target.tagName.toLowerCase() === 'img' && target.src) {
      mediaUrl = target.src;
    } 
    // 2. Comparison Canvas
    else if (target.tagName.toLowerCase() === 'canvas' && target.dataset.mediaUrl) {
      const base = target.dataset.mediaUrl;
      const comp = target.dataset.comparisonUrl;
      if (base && !comp) {
        mediaUrl = base;
      } else if (base && comp) {
        const rect = target.getBoundingClientRect();
        const relativeX = (e.clientX - rect.left) / rect.width;
        const sliderPos = parseFloat(target.dataset.sliderPos ?? 0.5);
        mediaUrl = relativeX < sliderPos ? base : comp;
      }
    }

    // 3. Fallback to parent img
    if (!mediaUrl) {
      const parentImg = target.closest('img');
      if (parentImg?.src) mediaUrl = parentImg.src;
    }

    if (!mediaUrl || mediaUrl.startsWith('chrome-extension://') || mediaUrl === 'about:blank') return;
    if (mediaUrl.includes('placeholder')) return;

    let context = 'library';
    if (target.closest('#history-panel') || target.closest('.history-list')) context = 'history';

    const compUrl = target.dataset?.comparisonUrl;
    const isSaved = !(compUrl && mediaUrl === compUrl);

    // Lazy load the context menu module
    const { MediaContextMenu } = await import('../components/mediaContextMenu.js');
    MediaContextMenu.show(e.clientX, e.clientY, {
      url: mediaUrl,
      filename: mediaUrl.split('/').pop().split('?')[0] || 'media_file',
      type: mediaType,
      isSaved,
    }, context);
  }, { capture: true });
}
