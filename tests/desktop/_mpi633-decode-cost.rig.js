/**
 * MPI-633 M1 — TEMPORARY measurement rig, not a regression spec. Delete after use.
 *
 * brief.md claims a 3000x1280 clip in a ~300px card decodes ~100x the pixels the card
 * shows, so a proxy would cost far less VRAM. That is reasoned from how browsers decode
 * video (native resolution regardless of display size) and had never been sampled here.
 *
 * M1a — VRAM against the clip's NATIVE resolution at a fixed card box.
 * M1b — the same 3000x1280 clip at a small card box vs a large one. If they agree,
 *       decode cost is native-resolution-driven and display size is irrelevant, which is
 *       the mechanism the whole card rests on.
 *
 * Ladder built from ONE shipped clip (comfy_workflows/display/flow-scribble.mp4,
 * 1280x800, 6 s) so only pixel count varies.
 *
 * ONE APP LAUNCH PER CONFIG, deliberately. A first pass measured the whole ladder in a
 * single app and the numbers were junk: after a grid is torn down the GPU pool does NOT
 * give the memory back within seconds (r1280w left 740 MB resident after unmount), so
 * every later step measured only what it needed BEYOND the pool the previous step had
 * already grown. Each config therefore gets its own process.
 *
 * Two numbers per config: `delta` (baseline -> K cards) carries a fixed compositor cost,
 * so `slope` (K -> 2K cards, divided by K) is the honest marginal cost of one more
 * promoted video.
 *
 * Sampler: '\GPU Process Memory(*)\Dedicated Usage' over Electron's own getAppMetrics()
 * pids (scratchpad/gpusnap.ps1). ComfyUI engine OFF, so the app is measured alone.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow } = require('./shellWindow');

// Fixture + output directory. Override with MPI633_SCRATCH; the fixtures themselves
// are built by rig/ladder.sh (M1) and rig/m2media.sh (M2) in the card workspace, which
// write into the same directory.
const SCRATCH = process.env.MPI633_SCRATCH || path.join(os.tmpdir(), 'mpi633');
const RIG = path.resolve(__dirname, '../../.agents/mpi-kanban/tasks/MPI-633/rig');
const SNAP = path.join(RIG, 'gpusnap.ps1');
const LADDER = path.join(SCRATCH, 'ladder');

const K = 6;

const CONFIGS = [
  { phase: 'M1a', key: 'r480', clip: 'r480', native: '768x480', px: 768 * 480, sizeLevel: 3 },
  { phase: 'M1a', key: 'r720', clip: 'r720', native: '1152x720', px: 1152 * 720, sizeLevel: 3 },
  { phase: 'M1a', key: 'r800', clip: 'r800', native: '1280x800', px: 1280 * 800, sizeLevel: 3 },
  { phase: 'M1a', key: 'r1080', clip: 'r1080', native: '1728x1080', px: 1728 * 1080, sizeLevel: 3 },
  { phase: 'M1a', key: 'r1280w', clip: 'r1280w', native: '3000x1280', px: 3000 * 1280, sizeLevel: 3 },
  { phase: 'M1b', key: 'r1280w@L1', clip: 'r1280w', native: '3000x1280', px: 3000 * 1280, sizeLevel: 1 },
  { phase: 'M1b', key: 'r1280w@L4', clip: 'r1280w', native: '3000x1280', px: 3000 * 1280, sizeLevel: 4 },
];

test.setTimeout(1800000);

/**
 * launch.js sets CUBRIC_E2E, and main.js:259 turns that into
 * `disableHardwareAcceleration()` + `--disable-gpu` — so the standard harness can never
 * measure VRAM (every sample reads 0). This launch keeps the profile and port isolation
 * (CUBRIC_E2E_USER_DATA + the run's CUBRIC_PORT — MPI-458) and leaves the GPU on.
 */
async function launchGpuApp(testInfo, tag) {
  const userDataDir = testInfo.outputPath(`user-data-${tag}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUBRIC_E2E;
  env.CUBRIC_E2E_USER_DATA = userDataDir;
  const app = await electron.launch({ args: ['.'], env });
  const window = await shellWindow(app);
  return { app, window };
}

/**
 * Electron's own pid list — Browser, GPU, Tab, Utility. A process-TREE walk finds only
 * the main process (Win32_Process reports no children for it), which is why the first
 * runs of this rig read 0.0 MB everywhere.
 */
async function sample3(app) {
  const pids = (await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => m.pid))).join(',');
  const one = () => JSON.parse(execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SNAP, '-Pids', pids,
  ], { encoding: 'utf8' })).totalMB;
  const v = [one(), one(), one()].sort((a, b) => a - b);
  return { median: v[1], all: v };
}

/** Mount one more grid of `count` cards; returns the running total of promoted videos. */
async function addGrid(window, { file, count, sizeLevel, index }) {
  await window.evaluate(async ({ file, count, sizeLevel, index }) => {
    const { state } = await import('/js/state.js');
    state.gallerySizeLevel = sizeLevel;
    const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
    const host = document.createElement('div');
    host.className = 'mpi633-host';
    // Stacked, all on screen: every card must sit inside the promote observer's margin
    // or the counts below are a scroll-position artefact.
    host.style.cssText = `position:fixed;left:${index * 620}px;top:0;width:600px;height:1000px;z-index:0;`;
    document.body.appendChild(host);

    const src = `/project-file?path=${encodeURIComponent(file)}`;
    const groups = Array.from({ length: count }, (_, i) => ({
      id: `mpi633-${index}-${i}`,
      type: 'video',
      selectedIndex: 0,
      history: [{
        id: `mpi633-item-${index}-${i}`,
        type: 'video',
        filePath: src,
        // Real shipped poster: a 404 takes the missing-media path, which empties the
        // card's media so nothing promotes (MPI-631's fixture trap).
        thumbPath: '/comfy_workflows/display/flow-scribble.webp',
      }],
    }));
    (window.__mpi633 ||= []).push({ grid: MpiGalleryGrid.mount(host, { groups }), host });
  }, { file, count, sizeLevel, index });
}

async function waitDecoded(window, total) {
  await expect(window.locator('video.mpi-group-card__thumb--hover-video')).toHaveCount(total);
  await window.waitForFunction((n) => {
    const v = [...document.querySelectorAll('video.mpi-group-card__thumb--hover-video')];
    return v.length === n && v.every((e) => e.readyState >= 2);
  }, total, { timeout: 60000 });
}

test('MPI-633 M1 — per-video VRAM against resolution and against card box', async ({}, testInfo) => {
  const results = { K, runs: [] };

  for (const cfg of CONFIGS) {
    const { app, window } = await launchGpuApp(testInfo, cfg.key.replace(/[^\w]/g, '_'));
    try {
      await window.waitForTimeout(8000); // shell boot settles
      const baseline = await sample3(app);

      const file = path.join(LADDER, `${cfg.clip}.mp4`).replace(/\//g, '\\');
      await addGrid(window, { file, count: K, sizeLevel: cfg.sizeLevel, index: 0 });
      await waitDecoded(window, K);
      const box = await window.evaluate(() => {
        const el = document.querySelector('.mpi-group-card');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      await window.waitForTimeout(10000);
      const at1K = await sample3(app);

      await addGrid(window, { file, count: K, sizeLevel: cfg.sizeLevel, index: 1 });
      await waitDecoded(window, K * 2);
      await window.waitForTimeout(10000);
      const at2K = await sample3(app);

      const run = {
        ...cfg,
        box,
        baselineMB: baseline.median,
        at1K: at1K.median,
        at2K: at2K.median,
        deltaMB: +(at1K.median - baseline.median).toFixed(1),
        perVideoFromDelta: +((at1K.median - baseline.median) / K).toFixed(1),
        slopePerVideoMB: +((at2K.median - at1K.median) / K).toFixed(1),
        samples: { baseline: baseline.all, at1K: at1K.all, at2K: at2K.all },
      };
      results.runs.push(run);
      console.log(`[${cfg.phase}] ${cfg.key} ${cfg.native} box ${box?.w}x${box?.h} ` +
        `base ${run.baselineMB} -> ${K}x ${run.at1K} -> ${K * 2}x ${run.at2K} | ` +
        `delta/vid ${run.perVideoFromDelta} slope/vid ${run.slopePerVideoMB}`);
      fs.writeFileSync(path.join(SCRATCH, 'm1-decode-cost.json'), JSON.stringify(results, null, 2));
    } finally {
      await app.close().catch(() => {});
    }
  }
});
