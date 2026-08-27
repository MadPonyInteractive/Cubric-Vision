/**
 * MPI-633 M2 — TEMPORARY measurement rig, not a regression spec. Delete after use.
 *
 * brief.md rejects capping the max card size with an ARITHMETIC table: the screen's
 * pixel count is fixed, so two huge cards or six small ones cost about the same, and a
 * size-matched rendition therefore fixes quality without costing memory. That table was
 * never measured. This measures it.
 *
 * Four configs, each in its own app process (a torn-down grid does not hand GPU memory
 * back within seconds, so configs sharing a process contaminate each other):
 *
 *   L1_thumb512  — today, smallest cards: many cards, one 512px WebP each
 *   L4_thumb512  — today, biggest cards: few cards, the SAME 512px source upscaled
 *                  (this is the quality complaint)
 *   L4_master    — the proposal at the biggest card size: few cards, 1280x800 source
 *   L1_master    — what a WRONG tier selection costs: many cards, all at 1280x800
 *
 * Fixture: 120 image groups, each its own file on disk (Chromium caches decoded images
 * by URL, so 120 copies of one file are 120 decodes). Tour matches MPI-631's: scroll to
 * the bottom, then sit idle and sample the resting cost.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, _electron: electron } = require('@playwright/test');
const { shellWindow } = require('./shellWindow');

// Fixture + output directory. Override with MPI633_SCRATCH; the fixtures themselves
// are built by rig/ladder.sh (M1) and rig/m2media.sh (M2) in the card workspace, which
// write into the same directory.
const SCRATCH = process.env.MPI633_SCRATCH || path.join(os.tmpdir(), 'mpi633');
const RIG = path.resolve(__dirname, '../../.agents/mpi-kanban/tasks/MPI-633/rig');
const SNAP = path.join(RIG, 'gpusnap.ps1');
const M2 = path.join(SCRATCH, 'm2');
const COUNT = 120;

const ALL_CONFIGS = [
  { key: 'L1_thumb512', sizeLevel: 1, render: 'thumb' },
  { key: 'L4_thumb512', sizeLevel: 4, render: 'thumb' },
  { key: 'L4_master', sizeLevel: 4, render: 'master' },
  { key: 'L1_master', sizeLevel: 1, render: 'master' },
  // Controls: mount and sit, no tour. Separates what the visible band costs from what
  // the GPU image cache RETAINS for every card the scroll ever passed.
  { key: 'L4_master_noscroll', sizeLevel: 4, render: 'master', scroll: false },
  { key: 'L4_thumb512_noscroll', sizeLevel: 4, render: 'thumb', scroll: false },
  // Phase 4: the SHIPPED build. The card gets both renditions and the ladder + the
  // scroll-out demote decide, instead of the rig pinning one source. L4_ladder is the
  // number the card has to land: near L4_master_noscroll (23.7), not near L4_master (238).
  { key: 'L4_ladder', sizeLevel: 4, render: 'ladder' },
  { key: 'L1_ladder', sizeLevel: 1, render: 'ladder' },
  // A FLING, not a dwell tour: one continuous scroll to the bottom, no rests. The
  // stepped tour above pauses 450 ms every 0.8 viewport, which is 44 dwell points and
  // therefore asks the gallery to decode every card -- a real 'scroll to the bottom' is
  // one gesture that stops once. This is the config the scroll gate is FOR.
  { key: 'L4_ladder_fling', sizeLevel: 4, render: 'ladder', fling: true },
  { key: 'L4_master_fling', sizeLevel: 4, render: 'master', fling: true },
];

// Each config is its own app process and its own ~90 s, so re-measuring two of them
// after a code change should not re-run all eight: MPI633_CONFIGS=L4_ladder,L4_master
const ONLY = (process.env.MPI633_CONFIGS || '').split(',').filter(Boolean);
const CONFIGS = ONLY.length ? ALL_CONFIGS.filter((c) => ONLY.includes(c.key)) : ALL_CONFIGS;

test.setTimeout(1800000);

async function launchGpuApp(testInfo, tag) {
  const userDataDir = testInfo.outputPath(`user-data-${tag}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUBRIC_E2E; // main.js:259 would disable the GPU outright
  env.CUBRIC_E2E_USER_DATA = userDataDir;
  const app = await electron.launch({ args: ['.'], env });
  const window = await shellWindow(app);
  return { app, window };
}

async function sample3(app) {
  const pids = (await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => m.pid))).join(',');
  const one = () => JSON.parse(execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SNAP, '-Pids', pids,
  ], { encoding: 'utf8' })).totalMB;
  const v = [one(), one(), one()].sort((a, b) => a - b);
  return { median: v[1], all: v };
}

test('MPI-633 M2 — gallery VRAM across card sizes and rendition sizes', async ({}, testInfo) => {
  const results = { count: COUNT, runs: [] };

  for (const cfg of CONFIGS) {
    const { app, window } = await launchGpuApp(testInfo, cfg.key);
    try {
      await window.waitForTimeout(8000);
      const baseline = await sample3(app);

      await window.evaluate(async ({ count, sizeLevel, render, m2 }) => {
        const { state } = await import('/js/state.js');
        state.gallerySizeLevel = sizeLevel;
        const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
        const host = document.createElement('div');
        host.id = 'mpi633-host';
        host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:0;';
        document.body.appendChild(host);

        const url = (p) => `/project-file?path=${encodeURIComponent(p)}`;
        const groups = Array.from({ length: count }, (_, i) => {
          const master = `${m2}\\master\\a${i}.png`;
          const thumb = `${m2}\\thumb512\\a${i}.webp`;
          return {
            id: `m2-${i}`,
            type: 'image',
            selectedIndex: 0,
            history: [{
              id: `m2-item-${i}`,
              type: 'image',
              filePath: url(master),
              // 'master' models a rendition as large as the source: the card renders
              // the full 1280x800 rather than the 512px thumb. 'ladder' hands the card
              // BOTH and lets the shipped rule choose — which is the only config that
              // measures the code rather than a hypothesis about it.
              thumbPath: render === 'master' ? url(master) : url(thumb),
              thumbPathLg: render === 'ladder' ? url(master) : null,
              // Wide, so the justified packer really does put two cards on a row at
              // level 4 — with no dimensions the ratio defaults to 1.0, the packer
              // fits four, and the card lands UNDER the ladder's boundary.
              pixelDimensions: { w: 1280, h: 800 },
            }],
          };
        });
        window.__m2 = { grid: MpiGalleryGrid.mount(host, { groups }), host };
      }, { count: COUNT, sizeLevel: cfg.sizeLevel, render: cfg.render, m2: M2.replace(/\//g, '\\') });

      // Same tour as MPI-631: scroll all the way down, then sit still.
      //
      // Step by a VIEWPORT, not by a fraction of scrollHeight. A fixed step count is
      // not the same tour at both levels: level 4's content is ~9x taller, so twelve
      // proportional jumps skip most of it while level 1's twelve cover everything —
      // and the two runs then differ in how many cards were ever rasterised, not in
      // what a card costs. First pass measured exactly that artefact.
      await window.waitForTimeout(4000);
      const scroller = window.locator('#mpi633-host .mpi-gallery-grid__grid');
      let steps = 0;
      if (cfg.fling) {
        // One gesture, no dwell: ~16 ms apart, which is what a wheel fling or a
        // scrollbar drag looks like to the page. The scroll gate is supposed to keep
        // the cards it flies past off the large rendition entirely.
        for (;;) {
          const more = await scroller.evaluate((el) => {
            const before = el.scrollTop;
            el.scrollTop = Math.min(before + el.clientHeight * 0.8, el.scrollHeight);
            return el.scrollTop > before + 1;
          });
          steps++;
          await window.waitForTimeout(16);
          if (!more || steps > 300) break;
        }
      } else if (cfg.scroll !== false) {
        for (;;) {
          const more = await scroller.evaluate((el) => {
            const before = el.scrollTop;
            el.scrollTop = Math.min(before + el.clientHeight * 0.8, el.scrollHeight);
            return el.scrollTop > before + 1;
          });
          steps++;
          await window.waitForTimeout(450);
          if (!more || steps > 300) break;
        }
      }
      await window.waitForTimeout(12000); // settle at rest

      const stats = await window.evaluate(() => {
        const scroller = document.querySelector('#mpi633-host .mpi-gallery-grid__grid');
        const cards = [...document.querySelectorAll('#mpi633-host .mpi-group-card')];
        const r0 = scroller.getBoundingClientRect();
        const visible = cards.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.bottom > r0.top && r.top < r0.bottom;
        });
        const box = visible[0]?.getBoundingClientRect();
        const imgs = [...document.querySelectorAll('#mpi633-host img')].filter((i) => i.naturalWidth > 0);
        return {
          cards: cards.length,
          visible: visible.length,
          box: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
          decodedImgs: imgs.length,
          // The claim the demote rests on: if every off-screen card really did swap
          // back and the VRAM did not move, the retention is not reference-based.
          onLarge: imgs.filter((i) => i.naturalWidth > 512).length,
          natural: imgs[0] ? { w: imgs[0].naturalWidth, h: imgs[0].naturalHeight } : null,
        };
      });

      const resting = await sample3(app);
      const run = {
        ...cfg, ...stats, scrollSteps: steps,
        baselineMB: baseline.median,
        restingMB: resting.median,
        deltaMB: +(resting.median - baseline.median).toFixed(1),
        samples: { baseline: baseline.all, resting: resting.all },
      };
      results.runs.push(run);
      console.log(`[M2] ${cfg.key} box ${stats.box?.w}x${stats.box?.h} visible ${stats.visible}/${stats.cards} onLarge ${stats.onLarge} ` +
        `natural ${stats.natural?.w}x${stats.natural?.h} steps ${steps} | base ${run.baselineMB} resting ${run.restingMB} ` +
        `delta ${run.deltaMB}`);
      fs.writeFileSync(path.join(SCRATCH, 'm2-gallery-vram.json'), JSON.stringify(results, null, 2));
    } finally {
      await app.close().catch(() => {});
    }
  }
});
