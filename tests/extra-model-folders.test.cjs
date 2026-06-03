'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildExtraModelPathsYaml } = require('../routes/yamlHelper');
const { normalizeExtraModelFolders } = require('../routes/shared');
const comfyRouter = require('../routes/comfy');
const { getComfyPath, getEngineRoot } = require('../routes/platformEngine');

test('buildExtraModelPathsYaml only emits multiline additive buckets', () => {
    const yaml = buildExtraModelPathsYaml('C:\\Models', {
        loras: ['D:\\Loras', 'E:\\More Loras'],
        upscale_models: ['D:\\Upscalers'],
        checkpoints: ['D:\\Ignored'],
    });

    assert.match(yaml, /base_path: C:\/Models/);
    assert.match(yaml, /    loras: \|\n        loras\/\n        D:\/Loras\n        E:\/More Loras/);
    assert.match(yaml, /    upscale_models: \|\n        upscale_models\/\n        D:\/Upscalers/);
    assert.match(yaml, /    checkpoints: checkpoints\//);
    assert.doesNotMatch(yaml, /D:\/Ignored/);
});

test('normalizeExtraModelFolders validates, normalizes, and dedupes bucket folders', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cubric-extra-folders-'));
    const loraDir = path.join(root, 'loras');
    const upscaleDir = path.join(root, 'upscale');
    await fs.mkdir(loraDir);
    await fs.mkdir(upscaleDir);

    const normalized = await normalizeExtraModelFolders({
        loras: [loraDir, `${loraDir}${path.sep}`],
        upscale_models: [upscaleDir],
        checkpoints: [root],
    }, { validateExists: true });

    assert.deepEqual(normalized, {
        loras: [await fs.realpath(loraDir)],
        upscale_models: [await fs.realpath(upscaleDir)],
    });

    await assert.rejects(
        () => normalizeExtraModelFolders({ loras: [path.join(root, 'missing')] }, { validateExists: true }),
        /does not exist/
    );
});

test('extra folder routes persist, preserve set-path extras, and union list-files', async () => {
    const engineRoot = getEngineRoot();
    const yamlPath = getComfyPath(engineRoot, 'extra_model_paths.yaml');
    const foldersPath = getComfyPath(engineRoot, 'extra_model_folders.json');
    const backups = {};

    for (const filePath of [yamlPath, foldersPath]) {
        try {
            backups[filePath] = await fs.readFile(filePath);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
            backups[filePath] = null;
        }
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cubric-extra-route-'));
    const primary = path.join(root, 'primary');
    const extraLoras = path.join(root, 'extra-loras');
    const extraUpscalers = path.join(root, 'extra-upscalers');
    await fs.mkdir(path.join(primary, 'loras'), { recursive: true });
    await fs.mkdir(path.join(primary, 'upscale_models'), { recursive: true });
    await fs.mkdir(extraLoras);
    await fs.mkdir(extraUpscalers);
    await fs.writeFile(path.join(primary, 'loras', 'primary.safetensors'), '');
    await fs.writeFile(path.join(primary, 'loras', 'collision.safetensors'), '');
    await fs.writeFile(path.join(extraLoras, 'extra.safetensors'), '');
    await fs.writeFile(path.join(extraLoras, 'collision.safetensors'), '');

    const app = express();
    app.use(express.json());
    app.use(comfyRouter);
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        let res = await fetch(`${baseUrl}/comfy/extra-folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loras: [extraLoras], upscale_models: [extraUpscalers] }),
        });
        let data = await res.json();
        assert.equal(data.success, true);
        assert.deepEqual(data.folders, {
            loras: [await fs.realpath(extraLoras)],
            upscale_models: [await fs.realpath(extraUpscalers)],
        });

        res = await fetch(`${baseUrl}/comfy/set-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: primary }),
        });
        data = await res.json();
        assert.equal(data.success, true);

        const yamlAfterSetPath = await fs.readFile(yamlPath, 'utf8');
        assert.match(yamlAfterSetPath, /loras: \|/);
        assert.match(yamlAfterSetPath, /upscale_models: \|/);
        assert.match(yamlAfterSetPath.replace(/\\/g, '/'), new RegExp(extraLoras.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

        res = await fetch(`${baseUrl}/comfy/list-files?subDir=loras`);
        data = await res.json();
        assert.equal(data.success, true);
        assert.deepEqual(data.files, ['collision.safetensors', 'extra.safetensors', 'primary.safetensors']);

        res = await fetch(`${baseUrl}/comfy/set-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' }),
        });
        data = await res.json();
        assert.equal(data.success, true);
        const yamlAfterClear = await fs.readFile(yamlPath, 'utf8');
        assert.match(yamlAfterClear, /loras: \|/);
        assert.match(yamlAfterClear.replace(/\\/g, '/'), new RegExp(extraLoras.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const [filePath, content] of Object.entries(backups)) {
            if (content === null) {
                await fs.rm(filePath, { force: true });
            } else {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content);
            }
        }
        await fs.rm(root, { recursive: true, force: true });
    }
});
