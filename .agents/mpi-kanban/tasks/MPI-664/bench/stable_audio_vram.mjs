// Stable Audio 3 — measure the two-node VRAM fix on the bench (port 8188).
//
// Arm A = the blueprint as shipped: no unload between the reprompter and the audio
//         stage, un-chunked `VAEDecodeAudio`.
// Arm B = the fix: `MpiClearVram` on the TextGenerate -> encoder edge, and
//         `VAEDecodeAudioTiled` in place of `VAEDecodeAudio`.
//
// Both arms run the reprompter ON, because that is the only condition under which
// the 4.55 GB Qwen weight is resident at all. Peak is read from ComfyUI's own
// /system_stats (vram_total - vram_free), polled while the prompt runs — not from
// nvidia-smi, which reports what the allocator chose rather than what was needed.
//
// Usage: node stable_audio_vram.mjs [A|B|both] [seconds]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const BLUEPRINT = 'G:/ComfyUi/ComfyUI/blueprints/Audio Generation (Stable Audio 3 Medium).json';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const ARM = (process.argv[2] || 'both').toUpperCase();
const SECONDS = Number(process.argv[3] || 60);
const CATEGORY = 'Music';
const USER_INPUT = 'a warm lo-fi hip hop beat with a dusty rhodes and brushed drums';

// ---- the reprompter prompt, rebuilt exactly as the blueprint's StringReplace chain does
function buildRepromptPrompt() {
  const wf = JSON.parse(fs.readFileSync(BLUEPRINT, 'utf8'));
  const sub = wf.definitions.subgraphs[0];
  const node = (id) => sub.nodes.find((n) => n.id === id);
  const recipes = JSON.parse(node(49).widgets_values[0]);
  if (!recipes[CATEGORY]) throw new Error(`no recipe for category ${CATEGORY}`);
  return node(38).widgets_values[0]
    .replace('SYSTEM_PROMPTS', recipes[CATEGORY])
    .replace('USER_INPUT', USER_INPUT)
    .replace('AUDIO_LENGTH', String(Math.round(SECONDS)));
}

function graph(arm, seed) {
  const g = {
    25: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'stable_audio_3_medium.safetensors' } },
    26: { class_type: 'CLIPLoader', inputs: { clip_name: 't5gemma_b_b_ul2.safetensors', type: 'stable_audio', device: 'default' } },
    29: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3.5_2b_bf16.safetensors', type: 'stable_diffusion', device: 'default' } },
    28: {
      class_type: 'TextGenerate',
      inputs: {
        clip: ['29', 0],
        prompt: buildRepromptPrompt(),
        max_length: 256,
        sampling_mode: 'on',
        'sampling_mode.temperature': 0.7,
        'sampling_mode.top_k': 64,
        'sampling_mode.top_p': 0.95,
        'sampling_mode.min_p': 0.05,
        'sampling_mode.repetition_penalty': 1.05,
        'sampling_mode.seed': seed,
        'sampling_mode.presence_penalty': 0,
        thinking: false,
        use_default_template: true,
      },
    },
    6: { class_type: 'CLIPTextEncode', inputs: { clip: ['26', 0], text: ['28', 0] } },
    7: { class_type: 'CLIPTextEncode', inputs: { clip: ['26', 0], text: '' } },
    11: { class_type: 'EmptyLatentAudio', inputs: { seconds: SECONDS, batch_size: 1 } },
    3: {
      class_type: 'KSampler',
      inputs: {
        model: ['25', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['11', 0],
        seed, steps: 8, cfg: 1.0, sampler_name: 'lcm', scheduler: 'simple', denoise: 1.0,
      },
    },
    12: { class_type: 'VAEDecodeAudio', inputs: { samples: ['3', 0], vae: ['25', 2] } },
    99: { class_type: 'SaveAudio', inputs: { audio: ['12', 0], filename_prefix: `audio/sa3_vram_${arm}` } },
  };

  // Arms: A = neither fix, B = both, C = unload only, D = chunked decode only.
  if (arm === 'B' || arm === 'C') {
    // (1) unload between the reprompter and the audio stage. Sits on the
    //     TextGenerate -> encoder edge so it is ordered between them, and stays
    //     inside the reprompter's lazy branch.
    g[200] = { class_type: 'MpiClearVram', inputs: { passthrough: ['28', 0] } };
    g[6].inputs.text = ['200', 0];
  }
  if (arm === 'B' || arm === 'D') {
    // (2) chunked decode.
    g[12] = { class_type: 'VAEDecodeAudioTiled', inputs: { samples: ['3', 0], vae: ['25', 2], tile_size: 512, overlap: 64 } };
  }
  return g;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}: ${await r.text()}`);
  return r.json();
};

async function used() {
  const s = await j(`${HOST}/system_stats`);
  const d = s.devices[0];
  return { used: d.vram_total - d.vram_free, total: d.vram_total };
}

async function runArm(arm) {
  const seed = Math.floor(Math.random() * 1e9);
  // Cold every time: the whole point is the co-residency peak on a fresh load.
  await fetch(`${HOST}/free`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  });
  await sleep(3000);
  const base = await used();

  const { prompt_id } = await j(`${HOST}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph(arm, seed) }),
  });

  const t0 = Date.now();
  let peak = base.used;
  let hist = null;
  for (;;) {
    const u = await used();
    if (u.used > peak) peak = u.used;
    const h = await j(`${HOST}/history/${prompt_id}`);
    if (h[prompt_id]?.status?.completed !== undefined) { hist = h[prompt_id]; break; }
    if (Date.now() - t0 > 600000) throw new Error(`arm ${arm} timed out`);
    await sleep(200);
  }
  const wall = (Date.now() - t0) / 1000;
  const status = hist.status;
  if (!status.completed) throw new Error(`arm ${arm} FAILED: ${JSON.stringify(status.messages).slice(0, 2000)}`);
  const cached = (status.messages.find((m) => m[0] === 'execution_cached') || [null, { nodes: [] }])[1].nodes;
  const file = Object.values(hist.outputs).flatMap((o) => o.audio || []).map((a) => a.filename);
  return { arm, seed, baseline: base.used, peak, wall, cached, file, total: base.total };
}

const GB = (b) => (b / 1024 ** 3).toFixed(2) + ' GB';

const arms = ARM === 'BOTH' ? ['A', 'B'] : ARM === 'ALL' ? ['A', 'C', 'D', 'B'] : ARM.split(',');
const out = [];
for (const a of arms) {
  process.stdout.write(`running arm ${a} (${SECONDS}s, reprompt ON) …\n`);
  const r = await runArm(a);
  out.push(r);
  console.log(`  arm ${r.arm}: peak ${GB(r.peak)} of ${GB(r.total)} | idle before ${GB(r.baseline)} | ${r.wall.toFixed(1)}s | cached=${JSON.stringify(r.cached)} | ${r.file.join(',')}`);
}
if (out.length === 2) {
  const [a, b] = out;
  console.log(`\nDELTA: ${GB(a.peak)} -> ${GB(b.peak)}  (${((a.peak - b.peak) / 1024 ** 3).toFixed(2)} GB saved, ${(100 * (a.peak - b.peak) / a.peak).toFixed(1)}%)`);
  console.log(`TIME:  ${a.wall.toFixed(1)}s -> ${b.wall.toFixed(1)}s`);
}
fs.writeFileSync(path.join(HERE, 'stable_audio_vram.results.json'), JSON.stringify(out, null, 2));
