/**
 * Enhancer backends for the Stage 1 recipe harness — Ollama, ComfyUI, DeepInfra.
 *
 * Ported from Cubric-Prompt `src/main/engine/` (MPI-35 phase 4, the same
 * migration that brought `js/data/recipes/`). Vision has no TypeScript pipeline
 * for scripts and no vite-node, and its `scripts/` are plain `.mjs` with no
 * build step, so this is plain ESM. Three things were deliberately dropped in
 * the port and nothing else changed:
 *
 * 1. **The `Engine` interface and `types.ts`** — both were type-only, and the
 *    latter was Zod-first. Vision's data layer is dependency-free (see
 *    `js/data/recipes/registry.js`), so no schema came across. The three
 *    classes still expose the same `chat()` / `complete()` shape, which is what
 *    made them swappable in the first place.
 * 2. **`describeImage()`** — a v1 seam that threw on every backend.
 * 3. **`pull()` / `listModels()`** — never called by the harness.
 *
 * EVERYTHING THE SWEEPS WERE MEASURED ON IS CARRIED VERBATIM: Ollama's
 * `num_ctx: 8192` and `think: false`, the `keep_alive: 0` release, ComfyUI's
 * four-node graph, its `SAMPLING` constants and its hand-rolled ChatML. Those
 * numbers are the instrument. Changing one silently invalidates every green
 * recorded in `docs/recipes/research/`.
 *
 * Pure Node: native `fetch`, no Electron and no dependencies.
 */

// ---------------------------------------------------------------------------
// Model registry — the enhancer/judge LLMs, data not code.
// ---------------------------------------------------------------------------

/**
 * Ported from Cubric-Prompt `src/main/engine/registry.ts`, minus the Zod schema
 * and the `type`/`vram`/`tools` fields the harness never reads. The
 * descriptions stay: they carry measured findings, not marketing.
 *
 * Coverage is asymmetric on purpose — abliterated builds exist only locally (no
 * serverless catalogue carries them), frontier models only in the cloud.
 */
export const MODEL_REGISTRY = [
    {
        id: 'gemma-4-e4b',
        name: 'Gemma 4 (Default)',
        ollamaName: 'gemma4:e4b',
        deepInfraId: 'google/gemma-4-26B-A4B-it',
        description:
            'The v1 default for prompt construction. Local: the efficient Gemma 4 E4B. Cloud: the Gemma 4 26B MoE.',
    },
    {
        id: 'gemma-3-12b',
        name: 'Gemma 3 12B',
        ollamaName: 'gemma3:12b',
        deepInfraId: 'google/gemma-3-12b-it',
        description:
            'The JUDGE of record for every Stage 1 sweep. A 4B judge fabricates violations — see docs/recipes/playbook/05-model-ladder.md.',
    },
    {
        id: 'dolphin3-abliterated',
        name: 'Dolphin 3 (Uncensored, local only)',
        ollamaName: 'huihui_ai/dolphin3-abliterated',
        description:
            'Dolphin 3.0 (Llama 3.1 8B), abliterated. Local only. Use when Gemma sanitises a prompt instead of shaping it.',
    },
    {
        id: 'gemma-4-abliterated-12b',
        name: 'Gemma 4 Abliterated 12B (Uncensored, local only)',
        ollamaName: 'huihui_ai/gemma-4-abliterated:12b',
        description:
            'The ENHANCER of record: every v1 recipe is Stage 1 green on this model. Word-budget adherence is a capability threshold between 8B and 12B, so recipes hold their length here and drift on smaller models. Local only.',
    },
    {
        id: 'deepseek-v3.2',
        name: 'DeepSeek V3.2 (Cloud only)',
        deepInfraId: 'deepseek-ai/DeepSeek-V3.2',
        description: 'Cloud candidate for prompts Gemma refuses or waters down. Too large to run locally.',
    },
    {
        id: 'qwen3.6-35b-a3b',
        name: 'Qwen 3.6 35B A3B (Cloud only)',
        deepInfraId: 'Qwen/Qwen3.6-35B-A3B',
        description:
            'Cloud candidate — MoE, so cheap per token. Second opinion on whether sanitising is Gemma-specific or catalogue-wide.',
    },
];

/** The model reached for when none is specified. */
export const DEFAULT_MODEL_ID = MODEL_REGISTRY[0].id;

/** Look up a model by its neutral registry id. */
export function getModel(id) {
    return MODEL_REGISTRY.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Ollama — local inference, and ALWAYS the judge (see the harness header).
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaEngine {
    backend = 'ollama';

    constructor(baseUrl = OLLAMA_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    async chat(req) {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: req.model,
                messages: req.messages,
                stream: false,
                // Reasoning models (Qwen3, DeepSeek-R1, …) split their reply into
                // `message.thinking` + `message.content` and can return reasoning
                // with EMPTY content — a blank prompt, with no error. Ollama
                // accepts this flag on non-reasoning models too, so it needs no
                // per-model branch.
                //
                // ADVISORY, NOT A GUARANTEE: some builds ignore it. Measured on
                // huihui_ai/qwen3-vl-abliterated:4b — still emitted 24k-53k chars
                // of thinking with think:false set and returned nothing.
                think: false,
                options: {
                    // Ollama defaults to a 4096-token context. A recipe
                    // systemPrompt runs ~950 tokens before the user's idea, so a
                    // long idea overruns the window and the model returns EMPTY
                    // content. Measured on qwen3-vl-abliterated:4b with the Krea 2
                    // recipe and a ~300-token idea: 1/3 runs empty at 4096, 0/3 at
                    // 8192.
                    num_ctx: 8192,
                    ...(req.options?.temperature !== undefined && {
                        temperature: req.options.temperature,
                    }),
                    ...(req.options?.maxTokens !== undefined && {
                        num_predict: req.options.maxTokens,
                    }),
                    ...(req.options?.stop !== undefined && { stop: req.options.stop }),
                },
            }),
        });
        if (!res.ok) {
            throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return { text: data.message?.content ?? '', model: req.model, backend: this.backend };
    }

    async complete(prompt, opts) {
        return this.chat({
            model: opts.model,
            messages: [
                ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
                { role: 'user', content: prompt },
            ],
        });
    }

    /** True if the local Ollama server is reachable. */
    async isRunning() {
        try {
            const res = await fetch(`${this.baseUrl}/`);
            return res.ok;
        } catch {
            return false;
        }
    }

    /** Currently-loaded (in-memory) model names, from `GET /api/ps`. */
    async loadedModels() {
        const res = await fetch(`${this.baseUrl}/api/ps`);
        if (!res.ok) {
            throw new Error(`Ollama ps failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return (data.models ?? []).map((m) => m.name);
    }

    /**
     * Unload a model from VRAM immediately. There is no dedicated endpoint — an
     * empty chat request with `keep_alive: 0` evicts it after it returns.
     */
    async unload(model) {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [], keep_alive: 0 }),
        });
        if (!res.ok) {
            throw new Error(`Ollama unload failed: ${res.status} ${res.statusText}`);
        }
    }

    /** Free VRAM held by our own models: unload everything currently loaded. */
    async releaseOwnModels() {
        const loaded = await this.loadedModels();
        await Promise.all(loaded.map((name) => this.unload(name)));
    }
}

// ---------------------------------------------------------------------------
// DeepInfra — cloud inference (OpenAI-compatible).
// ---------------------------------------------------------------------------

const DEEPINFRA_BASE_URL = 'https://api.deepinfra.com/v1/openai';

/**
 * An experimentation seam, NOT a multi-provider feature. Every provider worth
 * testing (Novita, Together, Groq, …) is OpenAI-compatible, so pointing this
 * elsewhere is enough to A/B how much each one sanitises.
 */
const BASE_URL_ENV = 'CUBRIC_OPENAI_BASE_URL';

export class DeepInfraEngine {
    backend = 'deepinfra';

    /** @param apiKey explicit key; defaults to `DEEPINFRA_API_KEY`, resolved
     *  lazily per request so a key set after construction still works. */
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    resolveBaseUrl() {
        return this.baseUrl ?? process.env[BASE_URL_ENV] ?? DEEPINFRA_BASE_URL;
    }

    resolveKey() {
        const key = this.apiKey ?? process.env['DEEPINFRA_API_KEY'];
        if (!key) {
            throw new Error(
                'DeepInfra API key missing: set DEEPINFRA_API_KEY or pass it to DeepInfraEngine.',
            );
        }
        return key;
    }

    async chat(req) {
        const res = await fetch(`${this.resolveBaseUrl()}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.resolveKey()}`,
            },
            body: JSON.stringify({
                model: req.model,
                messages: req.messages,
                stream: false,
                ...(req.options?.temperature !== undefined && {
                    temperature: req.options.temperature,
                }),
                ...(req.options?.maxTokens !== undefined && { max_tokens: req.options.maxTokens }),
                ...(req.options?.stop !== undefined && { stop: req.options.stop }),
            }),
        });
        if (!res.ok) {
            throw new Error(`DeepInfra chat failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return {
            text: data.choices?.[0]?.message?.content ?? '',
            model: req.model,
            backend: this.backend,
        };
    }

    async complete(prompt, opts) {
        return this.chat({
            model: opts.model,
            messages: [
                ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
                { role: 'user', content: prompt },
            ],
        });
    }

    /**
     * Is the cloud reachable AND the key valid? Hits the lightweight
     * `GET /models` — no generation cost. `false` if no key, the key is rejected
     * (401/403), or the network is down.
     */
    async isReady() {
        let key;
        try {
            key = this.resolveKey();
        } catch {
            return false;
        }
        try {
            const res = await fetch(`${this.resolveBaseUrl()}/models`, {
                headers: { Authorization: `Bearer ${key}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}

// ---------------------------------------------------------------------------
// ComfyUI — the backend that measures the encoder the PromptBox button runs.
// ---------------------------------------------------------------------------

/** Vision's bundled ComfyUI. Fabio's own bench is :8188 — a different, and
 *  differently-versioned, instance. Default to the one the button uses. */
const COMFY_BASE_URL = 'http://127.0.0.1:48188';
const COMFY_URL_ENV = 'CUBRIC_COMFY_URL';

/**
 * `CLIPLoader.type` is not free: `comfy/sd.py` binds krea2<->QWEN3VL_4B and
 * boogu<->QWEN3VL_8B, and anything unmatched falls through to the generic
 * `qwen3vl` tokenizer — which is the honest one for text generation. `krea2` is
 * the default because it is what the shipped enhancer graph loads, so the 4B
 * rung measures the button; the 8B silently degrades to the generic path, and
 * the 32B ignores `type` entirely (it binds `MiniMaxH3Tokenizer`).
 */
const DEFAULT_CLIP_TYPE = 'krea2';

/**
 * The shipped graph caps output at 512 tokens, which can truncate a recipe whose
 * budget runs long (minimax-h3 reference mode targets 350-500 words). The
 * harness must not inherit that cap or every long recipe fails for the wrong
 * reason, so this sits well clear of every `wordBudget.max`.
 */
const DEFAULT_MAX_LENGTH = 2048;

/**
 * MATCHED TO THE OLLAMA SWEEPS, not to the node's defaults and not to the
 * shipped graph. A ladder comparison that also changes the sampler measures two
 * things at once.
 *
 * `temperature`/`top_k`/`top_p` are read from the Modelfiles of the models that
 * actually ran Stage 1 — `GET /api/show` reports `temperature 1, top_k 64,
 * top_p 0.95` for gemma4:e4b, gemma3:12b AND huihui_ai/gemma3-abliterated:12b
 * alike, so there is one set to match, not three. The node defaults
 * (0.7 / 64 / 0.95) would have understated temperature by a third; the shipped
 * enhancer graph's 0.5 is the character-designer author's taste, not a setting.
 *
 * RESIDUAL DELTA, recorded rather than guessed: no Modelfile sets `min_p` or
 * `repeat_penalty`, so the Ollama runs used Ollama's own documented defaults
 * (0.0 and 1.1) — documented, not read out of a running server, which is the one
 * number here that is not first-hand.
 */
const SAMPLING = {
    temperature: 1.0,
    top_k: 64,
    top_p: 0.95,
    min_p: 0.0,
    repetition_penalty: 1.1,
};

const OUTPUT_NODE = '4';

/**
 * Submits a MINIMAL four-node graph, deliberately NOT the shipped
 * `comfy_workflows/qwen3vl_4b_prompt_enhancer.json`: that workflow strips every
 * newline, regex-scrubs negation clauses and caps output at 512 tokens, so
 * measuring a recipe through it would blame the model for a regex.
 *
 *   CLIPLoader -> TextGenerate -> MpiClearVram -> PreviewAny
 *
 * `MpiClearVram` is in the chain because it is free and is a safety device: it
 * returns VRAM to baseline between runs so a settings change does not OOM.
 * `PreviewAny` is the only reason the text is readable from `/history` at all —
 * `TextGenerate` is not an output node.
 */
export class ComfyUIEngine {
    backend = 'comfy';

    constructor(baseUrl, opts = {}) {
        this.baseUrl = baseUrl;
        this.clipType = opts.clipType ?? DEFAULT_CLIP_TYPE;
        this.maxLength = opts.maxLength ?? DEFAULT_MAX_LENGTH;
        this.timeoutMs = opts.timeoutMs ?? 300_000;
        this.pollMs = opts.pollMs ?? 1_000;
        // ComfyUI's seed widget is a FIXED value — the shipped graph feeds it a
        // literal 0 — so without randomising here `--runs N` produces N identical
        // runs and silently voids the consistency gate that IS the twice-green
        // rule.
        this.seed = opts.seed ?? (() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    }

    resolveBaseUrl() {
        return this.baseUrl ?? process.env[COMFY_URL_ENV] ?? COMFY_BASE_URL;
    }

    async chat(req) {
        const system = req.messages.find((m) => m.role === 'system')?.content;
        const user = req.messages
            .filter((m) => m.role !== 'system')
            .map((m) => m.content)
            .join('\n\n');

        const graph = this.buildGraph({
            clipName: req.model,
            prompt: buildChatML(user, system),
            maxLength: req.options?.maxTokens ?? this.maxLength,
        });

        const promptId = await this.submit(graph);
        const text = await this.awaitResult(promptId);
        return { text, model: req.model, backend: this.backend };
    }

    async complete(prompt, opts) {
        return this.chat({
            model: opts.model,
            messages: [
                ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
                { role: 'user', content: prompt },
            ],
        });
    }

    /** True if the ComfyUI server is reachable. */
    async isRunning() {
        try {
            const res = await fetch(`${this.resolveBaseUrl()}/system_stats`);
            return res.ok;
        } catch {
            return false;
        }
    }

    /** `CLIPLoader`'s installed encoder files, for a "no such clip_name" message. */
    async listClipNames() {
        const res = await fetch(`${this.resolveBaseUrl()}/object_info/CLIPLoader`);
        if (!res.ok) {
            throw new Error(`ComfyUI object_info failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return data.CLIPLoader?.input?.required?.clip_name?.[0] ?? [];
    }

    buildGraph(p) {
        return {
            1: {
                class_type: 'CLIPLoader',
                inputs: { clip_name: p.clipName, type: this.clipType, device: 'default' },
            },
            2: {
                class_type: 'TextGenerate',
                inputs: {
                    clip: ['1', 0],
                    prompt: p.prompt,
                    max_length: p.maxLength,
                    // A dynamic combo serialises FLAT in the API format: the key,
                    // then `key.field` for each of its inputs. Copied from the
                    // shipped graph, which is the only proof of the wire shape.
                    sampling_mode: 'on',
                    'sampling_mode.temperature': SAMPLING.temperature,
                    'sampling_mode.top_k': SAMPLING.top_k,
                    'sampling_mode.top_p': SAMPLING.top_p,
                    'sampling_mode.min_p': SAMPLING.min_p,
                    'sampling_mode.repetition_penalty': SAMPLING.repetition_penalty,
                    'sampling_mode.seed': this.seed(),
                    thinking: false,
                    // `execute()` passes `skip_template = not use_default_template`,
                    // and the built-in Qwen3-VL template is USER-TURN ONLY — it has
                    // no slot for a system prompt, which is the entire input a
                    // recipe provides. So the template is hand-rolled below and
                    // switched off here.
                    use_default_template: false,
                },
            },
            3: { class_type: 'MpiClearVram', inputs: { passthrough: ['2', 0] } },
            [OUTPUT_NODE]: { class_type: 'PreviewAny', inputs: { source: ['3', 0] } },
        };
    }

    async submit(graph) {
        const res = await fetch(`${this.resolveBaseUrl()}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: graph }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.prompt_id) {
            // Validation failures come back as a body, not a status line — a bad
            // clip_name or an absent node class is reported here, not thrown.
            throw new Error(
                `ComfyUI rejected the graph (${res.status}): ${JSON.stringify(data.error ?? data.node_errors ?? data)}`,
            );
        }
        return data.prompt_id;
    }

    async awaitResult(promptId) {
        const deadline = Date.now() + this.timeoutMs;
        for (;;) {
            const res = await fetch(`${this.resolveBaseUrl()}/history/${promptId}`);
            if (res.ok) {
                const history = await res.json();
                const entry = history[promptId];
                if (entry) {
                    if (entry.status?.status_str === 'error') {
                        throw new Error(
                            `ComfyUI execution failed: ${JSON.stringify(entry.status.messages ?? [])}`,
                        );
                    }
                    const text = entry.outputs?.[OUTPUT_NODE]?.text?.[0];
                    // An entry exists but carries no output only when the run ended
                    // without reaching PreviewAny — report it rather than polling on.
                    if (text === undefined) {
                        throw new Error(
                            `ComfyUI returned no text for prompt ${promptId} (outputs: ${Object.keys(entry.outputs ?? {}).join(', ') || 'none'}).`,
                        );
                    }
                    return text;
                }
            }
            if (Date.now() > deadline) {
                throw new Error(
                    `ComfyUI did not finish prompt ${promptId} within ${this.timeoutMs}ms.`,
                );
            }
            await new Promise((r) => setTimeout(r, this.pollMs));
        }
    }
}

/**
 * Hand-rolled ChatML, because the built-in template cannot carry a system prompt
 * (`comfy/text_encoders/qwen3vl.py`: `llama_template` wraps a USER turn only).
 *
 * TWO THINGS HERE WERE SETTLED BY MEASUREMENT, NOT BY READING THE CODE
 * (2026-09-01, same idea + system prompt, seed 12345, 4B abliterated):
 *
 * 1. NO `<think>\n\n</think>\n\n` SUFFIX. The code says the tokenizer appends
 *    that empty think block itself — the Qwen3 no-reasoning convention — but only
 *    on the branch that applies its own template, so skipping the template skips
 *    the suffix. Adding it back by hand looks obviously right and is wrong: with
 *    it, this checkpoint returned the five characters `user\n`; the identical
 *    prompt without it returned a clean 122-character sentence.
 * 2. THE TRAILING NEWLINE AFTER `assistant` IS LOAD-BEARING. Without it the model
 *    opens its reply with a stray `: ` — 4 of 4 runs across two prompt shapes.
 *    The built-in template ends `<|im_start|>assistant\n` for the same reason.
 */
export function buildChatML(user, system) {
    const head = system ? `<|im_start|>system\n${system}<|im_end|>\n` : '';
    return `${head}<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
}
