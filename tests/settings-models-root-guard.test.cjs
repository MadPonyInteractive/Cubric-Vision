'use strict';

/**
 * MPI-392 — Settings must never rewrite the models root from a cached-path heuristic.
 *
 * MpiSettings mounted with a stored path containing 'temp'/'tmp' anywhere used to call
 * _setComfyPath(''), which POSTs /comfy/set-path with an empty path; the route treats
 * falsy as "revert to default" and rewrites extra_model_paths.yaml — the single source
 * of truth for where every model lives. A user with D:/AI/temp_models lost their root
 * every time they opened Settings, silently.
 *
 * The renderer half is asserted on source text: there is no jsdom in this suite, so the
 * component cannot be mounted. The pin is that no unconditional _setComfyPath('') exists
 * in the file at all — the mount path was its only caller.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const SETTINGS_JS = path.join(__dirname, '..', 'js', 'components', 'Compounds', 'LandingPages', 'MpiSettings', 'MpiSettings.js');

test('MpiSettings never resets the server models root from a cached path heuristic', async () => {
    const src = await fs.readFile(SETTINGS_JS, 'utf8');

    // Strip block/line comments so the explanatory comment about the old guard
    // cannot satisfy — or trip — these assertions.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    assert.doesNotMatch(
        code,
        /_setComfyPath\(\s*(''|""|``)\s*\)/,
        "MpiSettings must not POST an empty models root: /comfy/set-path treats it as 'revert to default' and rewrites extra_model_paths.yaml (MPI-392)"
    );
    assert.doesNotMatch(
        code,
        /includes\(\s*['"]t(e)?mp['"]\s*\)/,
        'substring matching on temp/tmp is not a temp-directory test — it matches D:/AI/temp_models (MPI-392)'
    );
});

test('POST /comfy/set-path logs every successful root change, old -> new', async () => {
    const logger = require('../routes/logger');
    const comfyRouter = require('../routes/comfy');
    const { getComfyPath, getEngineRoot } = require('../routes/platformEngine');

    const yamlPath = getComfyPath(getEngineRoot(), 'extra_model_paths.yaml');
    let backup = null;
    try {
        backup = await fs.readFile(yamlPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cubric-set-path-log-'));
    const primary = path.join(root, 'primary');
    await fs.mkdir(primary, { recursive: true });

    const lines = [];
    const origInfo = logger.info;
    logger.info = (category, message) => { lines.push(`${category}: ${message}`); };

    const app = express();
    app.use(express.json());
    app.use(comfyRouter);
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const setPath = async (p) => {
        const res = await fetch(`${baseUrl}/comfy/set-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: p }),
        });
        return res.json();
    };

    try {
        assert.equal((await setPath(primary)).success, true);
        const custom = lines.filter(l => l.includes('set-path: models root'));
        assert.equal(custom.length, 1, 'a successful custom-root write must log exactly once');
        assert.match(custom[0].replace(/\\/g, '/'), new RegExp(`-> ${primary.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

        lines.length = 0;
        assert.equal((await setPath('')).success, true);
        const reverted = lines.filter(l => l.includes('set-path: models root'));
        assert.equal(reverted.length, 1, 'reverting to the default must log too — that silence is what hid MPI-392');
        // The old root must be named, so a mystery reset can be attributed from app.log alone.
        assert.match(reverted[0].replace(/\\/g, '/'), new RegExp(primary.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(reverted[0], /reverted to default/);
    } finally {
        logger.info = origInfo;
        await new Promise(resolve => server.close(resolve));
        if (backup === null) await fs.rm(yamlPath, { force: true });
        else await fs.writeFile(yamlPath, backup);
        await fs.rm(root, { recursive: true, force: true });
    }
});
