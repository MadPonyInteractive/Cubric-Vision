// Verifies layered-mask round-trip: paint → swapToPreview → swapToCanvas restores layers.
// Drives MpiCanvasViewer directly in renderer (no UI clicks) so the test isolates
// the persist / restore wiring from tool-options compounds.

const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAFElEQVR42mNk+M9QzwAEjGQwACdfA/MhYO3qAAAAAElFTkSuQmCC';

test('viewer: paint → swapToPreview persists layers, swapToCanvas restores them', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async (imgUrl) => {
      const { MpiCanvasViewer } = await import('/js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
      const { state } = await import('/js/state.js');
      const { maskTempStore } = await import('/js/services/maskTempStore.js');

      // Force project + group + item ids so persistence has a key.
      state.currentProject = { ...(state.currentProject || {}), id: 'pTest' };

      const item = { id: 'iTest', filePath: imgUrl, type: 'image' };
      const host = document.createElement('div');
      host.style.width = '256px';
      host.style.height = '256px';
      document.body.appendChild(host);

      const viewer = MpiCanvasViewer.mount(host, {
        groupId: 'gTest',
        initialIdx: 0,
      });

      // Smoke check: data URL loads as Image at all in this renderer.
      const probe = await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = (e) => resolve({ ok: false, err: String(e) });
        im.src = imgUrl;
      });
      if (!probe.ok) return { stage: 'image-probe-failed', probe };

      // Drive canvas.loadImage directly first so we can capture any error.
      try {
        await viewer.el.canvas.loadImage(imgUrl);
      } catch (err) {
        return { stage: 'loadImage-threw', err: String(err) };
      }
      const directProbe = {
        hasImg: !!viewer.el.canvas.img,
        imgW: viewer.el.canvas.img?.width || 0,
        manualW: viewer.el.canvas.mask?.manualCanvas?.width || 0,
      };
      if (!directProbe.manualW) return { stage: 'loadImage-ok-but-no-mask', directProbe };

      // Now drive loadEntry to set _currentItem.
      try {
        await viewer.el.loadEntry(item, 0);
      } catch (err) {
        return { stage: 'loadEntry-threw', err: String(err) };
      }

      let core = viewer.el.canvas.mask;
      if (!core || !core.manualCanvas?.width) {
        return {
          stage: 'no-mask-init',
          hasImg: !!viewer.el.canvas.img,
          imgW: viewer.el.canvas.img?.width || 0,
          dims: core ? [core.manualCanvas?.width, core.manualCanvas?.height] : null,
        };
      }
      core.manualCtx.fillStyle = 'rgba(255,255,255,1)';
      core.manualCtx.fillRect(0, 0, 16, 16);
      core._recomposite();

      // Persist via swapToPreview path.
      await viewer.el.swapToPreview();

      // Confirm TEMP file written for manual layer.
      const t1 = await maskTempStore.read('pTest', 'gTest', 'iTest');
      const persistedManual = !!t1?.manual;

      // Now swap back. Layers should restore.
      await viewer.el.swapToCanvas();

      // Read back manual canvas pixels.
      const restored = viewer.el.canvas.mask;
      let painted = false;
      if (restored?.manualCtx && restored.manualCanvas?.width) {
        const w = restored.manualCanvas.width;
        const h = restored.manualCanvas.height;
        const data = restored.manualCtx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) { painted = true; break; }
        }
      }

      // Composite display layer should also have content.
      const displayHasContent = !!viewer.el.canvas.maskCanvas && (() => {
        const c = viewer.el.canvas.maskCanvas;
        const ctx = c.getContext('2d');
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true;
        }
        return false;
      })();

      // Cleanup.
      await maskTempStore.delete('pTest', 'gTest', 'iTest');
      viewer.el.destroy?.();
      host.remove();

      return {
        stage: 'ok',
        persistedManual,
        painted,
        displayHasContent,
      };
    }, TINY_PNG);

    console.log('Result:', result);
    expect(result.stage).toBe('ok');
    expect(result.persistedManual).toBe(true);
    expect(result.painted).toBe(true);
    expect(result.displayHasContent).toBe(true);
  } finally {
    if (app.windows().length > 0) {
      await app.close().catch(() => {});
    }
  }
});

test('viewer: destroy persists combined manual and auto mask for remount', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async (imgUrl) => {
      const { MpiCanvasViewer } = await import('/js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js');
      const { state } = await import('/js/state.js');
      const { maskTempStore } = await import('/js/services/maskTempStore.js');

      state.currentProject = { ...(state.currentProject || {}), id: 'pDestroyTest' };

      const item = { id: 'iDestroyTest', filePath: imgUrl, type: 'image' };
      const host = document.createElement('div');
      host.style.width = '256px';
      host.style.height = '256px';
      document.body.appendChild(host);

      const viewer = MpiCanvasViewer.mount(host, { groupId: 'gDestroyTest', initialIdx: 0 });
      await viewer.el.loadEntry(item, 0);

      const core = viewer.el.canvas.mask;
      core.manualCtx.fillStyle = 'rgba(255,255,255,1)';
      core.manualCtx.fillRect(0, 0, 8, 8);
      core._recomposite();

      await maskTempStore.writeAuto('pDestroyTest', 'gDestroyTest', 'iDestroyTest', {
        thumbs: [imgUrl],
        urls: [imgUrl],
        picks: [0],
      });

      viewer.el.destroy?.();

      let persisted = null;
      for (let i = 0; i < 20; i++) {
        persisted = await maskTempStore.read('pDestroyTest', 'gDestroyTest', 'iDestroyTest');
        if (persisted.manual && persisted.auto) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const remountHost = document.createElement('div');
      remountHost.style.width = '256px';
      remountHost.style.height = '256px';
      document.body.appendChild(remountHost);
      const remounted = MpiCanvasViewer.mount(remountHost, {
        groupId: 'gDestroyTest',
        initialIdx: 0,
        initialItem: item,
      });
      // Mirrors Group History mount ordering: the block passes initialItem,
      // then calls loadEntry for that same active entry. This must not wipe
      // the existing session-temp mask with a fresh empty canvas.
      await remounted.el.loadEntry(item, 0);

      const restored = remounted.el.canvas.mask;
      const manualData = restored.manualCtx.getImageData(0, 0, restored.manualCanvas.width, restored.manualCanvas.height).data;
      const displayData = restored.maskCtx.getImageData(0, 0, restored.maskCanvas.width, restored.maskCanvas.height).data;
      let manualHasContent = false;
      let displayHasContent = false;
      for (let i = 3; i < manualData.length; i += 4) {
        if (manualData[i] > 0) { manualHasContent = true; break; }
      }
      for (let i = 3; i < displayData.length; i += 4) {
        if (displayData[i] > 0) { displayHasContent = true; break; }
      }
      const autoPickCount = restored.selectedAutoPicks.size;

      await maskTempStore.delete('pDestroyTest', 'gDestroyTest', 'iDestroyTest');
      remounted.el.destroy?.();
      host.remove();
      remountHost.remove();

      return {
        persistedManual: !!persisted?.manual,
        persistedAuto: !!persisted?.auto,
        manualHasContent,
        displayHasContent,
        autoPickCount,
      };
    }, TINY_PNG);

    expect(result.persistedManual).toBe(true);
    expect(result.persistedAuto).toBe(true);
    expect(result.manualHasContent).toBe(true);
    expect(result.displayHasContent).toBe(true);
    expect(result.autoPickCount).toBe(1);
  } finally {
    if (app.windows().length > 0) {
      await app.close().catch(() => {});
    }
  }
});

test('navigation: history load restores active session-temp mask in prompt preview', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async (imgUrl) => {
      const { state } = await import('/js/state.js');
      const { navigate, PAGE_GALLERY, PAGE_GROUP_HISTORY } = await import('/js/router.js');
      const { maskTempStore } = await import('/js/services/maskTempStore.js');

      const item = { id: 'iNavTest', filePath: imgUrl, type: 'image', displayName: 'nav-test' };
      state.currentProject = {
        id: 'pNavTest',
        name: 'Nav Test',
        folderPath: 'C:/tmp/nav-test',
        itemGroups: [{
          id: 'gNavTest',
          type: 'image',
          name: 'Nav Group',
          selectedIndex: 0,
          history: [item],
        }],
      };

      const waitFor = async (predicate, label) => {
        const start = performance.now();
        while (performance.now() - start < 3000) {
          const value = predicate();
          if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`Timed out waiting for ${label}`);
      };

      await maskTempStore.writeManual('pNavTest', 'gNavTest', 'iNavTest', imgUrl);

      navigate(PAGE_GROUP_HISTORY, { groupId: 'gNavTest' });
      await waitFor(() => document.querySelector('.mpi-group-history-block'), 'history block');
      const previewMask = await waitFor(() => {
        const masked = document.querySelector('.mpi-masked-preview__masked');
        if (!masked) return null;
        const style = masked.style.webkitMaskImage || masked.style.maskImage || '';
        return style && style !== 'none' ? style : null;
      }, 'preview mask');

      const persisted = await maskTempStore.read('pNavTest', 'gNavTest', 'iNavTest');

      await maskTempStore.delete('pNavTest', 'gNavTest', 'iNavTest');
      return {
        persistedManual: !!persisted?.manual,
        previewHasMask: !!previewMask,
      };
    }, TINY_PNG);

    expect(result.persistedManual).toBe(true);
    expect(result.previewHasMask).toBe(true);
  } finally {
    if (app.windows().length > 0) {
      await app.close().catch(() => {});
    }
  }
});
