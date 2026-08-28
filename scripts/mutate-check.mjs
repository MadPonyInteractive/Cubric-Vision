#!/usr/bin/env node
/**
 * mutate-check.mjs — break one file on purpose, run a check, and prove the check bites.
 *
 * A test that cannot fail is worth nothing, and a green run is indistinguishable from a
 * vacuous one. `docs/testing.md` has required the restore-in-`finally` mutation for a while;
 * this is the tool, written after the same ~30 lines were hand-rolled FIVE times in one
 * session (MPI-638/641) and caught three real defects — including two assertions that passed
 * against genuinely broken code.
 *
 *   node scripts/mutate-check.mjs --file js/foo.js --from "a === b" --to "a !== b" \
 *     --run "npx playwright test tests/desktop/x.spec.js --config=playwright.desktop.config.js"
 *
 *   node scripts/mutate-check.mjs --file x.css --from-file /tmp/snippet.txt \
 *     --run "npm test"                                  # --to omitted = DELETE the snippet
 *
 *   node scripts/mutate-check.mjs --self-check          # prove the harness itself works
 *
 * Exit 0 = mutant KILLED (the check failed, so it bites). Exit 1 = mutant SURVIVED — the
 * check passes with the code broken, which is the finding. Exit 2 = the harness could not run
 * (target absent, bad args, restore failed); never confuse that with a verdict.
 *
 * ONE mutation per invocation. Two cases = two invocations; that keeps the CLI free of array
 * parsing for a loop the caller writes anyway.
 *
 * WHY `--from-file` EXISTS: Git Bash on Windows eats backticks inside double quotes and
 * mangles heredocs, and this repo's guard hooks block both. A mutation snippet containing
 * `code spans`, quotes or backslashes cannot travel as an inline argument — put it in a file.
 *
 * THE RESTORE IS THE POINT. It runs in `finally` and is verified byte-identical, because a
 * crash mid-run otherwise leaves a real source file broken on disk, and the mutant then reads
 * as your own bad edit. That has happened; it is why this is a script and not a habit.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXIT = { KILLED: 0, SURVIVED: 1, HARNESS: 2 };

/** Minimal `--flag value` parser; repeated flags are not supported (one mutation per run). */
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
        out[key] = next;
        i++;
    }
    return out;
}

function die(msg) {
    console.error(`mutate-check: ${msg}`);
    process.exit(EXIT.HARNESS);
}

/**
 * Break `file` by replacing `from` with `to`, run `cmd`, restore, and report.
 * @returns {number} one of EXIT
 */
function mutate({ file, from, to, cmd, cwd = REPO, quiet = false }) {
    const abs = path.resolve(cwd, file);
    if (!fs.existsSync(abs)) die(`no such file: ${abs}`);

    const original = fs.readFileSync(abs, 'utf8');
    // Refuse rather than run an UNMUTATED check — that prints green and means nothing, which
    // is the exact failure this tool exists to catch. A stale snippet is the usual cause.
    if (!original.includes(from)) {
        die(`the target text is not in ${file} — this mutation is stale, and running the `
            + 'check now would pass against unmutated code');
    }
    const mutated = original.replace(from, to);
    if (mutated === original) die('the replacement changed nothing — from and to are identical');

    let failed;
    try {
        fs.writeFileSync(abs, mutated, 'utf8');
        try {
            const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
            if (!quiet) process.stdout.write(out);
            failed = false;
        } catch (e) {
            if (!quiet) process.stdout.write((e.stdout || '') + (e.stderr || ''));
            failed = true;
        }
    } finally {
        // Always, and verified — see the header. A silent half-restore is worse than a crash.
        fs.writeFileSync(abs, original, 'utf8');
        if (fs.readFileSync(abs, 'utf8') !== original) {
            console.error(`mutate-check: RESTORE FAILED for ${file} — fix this before anything else`);
            process.exit(EXIT.HARNESS);
        }
    }

    if (failed) {
        console.log(`MUTANT KILLED — the check fails when ${file} is broken, so it bites.`);
        return EXIT.KILLED;
    }
    console.log(`MUTANT SURVIVED — the check PASSES with ${file} broken. It proves nothing `
        + 'about this behaviour. Read docs/testing.md § the mutation is the point.');
    return EXIT.SURVIVED;
}

/**
 * The harness testing itself: a temp file, a real mutation, a command that greps it. Proves
 * both verdicts and the restore, without touching the repo.
 */
function selfCheck() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-check-'));
    const file = path.join(dir, 'subject.txt');
    const node = JSON.stringify(process.execPath);
    const target = JSON.stringify(file);
    // Exits 1 when the file no longer says GOOD — a check that bites.
    const biting = `${node} -e "process.exit(require('fs').readFileSync(${target},'utf8').includes('GOOD')?0:1)"`;
    // Never looks at the file — a check that cannot fail.
    const vacuous = `${node} -e "process.exit(0)"`;
    let failures = 0;
    const expect = (label, got, want) => {
        const ok = got === want;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label} (got ${got}, want ${want})`);
        if (!ok) failures++;
    };
    try {
        fs.writeFileSync(file, 'GOOD\n', 'utf8');
        expect('a biting check kills the mutant',
            mutate({ file, from: 'GOOD', to: 'BAD', cmd: biting, cwd: dir, quiet: true }), EXIT.KILLED);
        expect('the file was restored', fs.readFileSync(file, 'utf8'), 'GOOD\n');
        expect('a vacuous check lets it survive',
            mutate({ file, from: 'GOOD', to: 'BAD', cmd: vacuous, cwd: dir, quiet: true }), EXIT.SURVIVED);
        expect('the file was restored again', fs.readFileSync(file, 'utf8'), 'GOOD\n');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(failures ? `self-check FAILED (${failures})` : 'self-check passed');
    return failures ? EXIT.HARNESS : EXIT.KILLED;
}

const args = parseArgs(process.argv.slice(2));

if (args['self-check']) process.exit(selfCheck());

const file = args.file;
const cmd = args.run;
if (!file || !cmd) {
    die('usage: --file <path> --run "<command>" (--from <text> | --from-file <path>) '
        + '[--to <text> | --to-file <path>] [--self-check]');
}
const read = (p) => fs.readFileSync(path.resolve(REPO, p), 'utf8');
const from = args['from-file'] ? read(args['from-file']) : args.from;
// `--to` omitted means DELETE the snippet, which is the commonest mutation of all: drop the
// guard, drop the declaration, and see whether anything notices.
const to = args['to-file'] ? read(args['to-file']) : (args.to === undefined ? '' : args.to);
if (typeof from !== 'string' || !from) die('--from or --from-file is required');

process.exit(mutate({ file, from, to: typeof to === 'string' ? to : '', cmd }));
