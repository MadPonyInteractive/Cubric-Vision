/**
 * scripts/addDepHashes.js — Add sha256: null to all DEPS entries missing it.
 * Safe to re-run; only adds the key where it's missing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEPS_PATH = path.join(__dirname, '..', 'js', 'data', 'modelConstants', 'dependencies.js');

let content = fs.readFileSync(DEPS_PATH, 'utf8');
const depsModule = require(DEPS_PATH);
const deps = depsModule.DEPS || depsModule;

let updated = 0;
for (const [id, dep] of Object.entries(deps)) {
    if (dep.sha256 !== undefined) continue; // already present, skip

    // Find the closing brace of this entry and insert sha256: null before it
    // Match the entry block: id: { ... }
    const openPat = `${id}: {`;
    const closePat = `},`;

    let startIdx = content.indexOf(openPat);
    if (startIdx === -1) {
        console.warn(`  ⚠ Could not find entry: ${id}`);
        continue;
    }

    // Find the matching closing brace for this entry (handle nested objects)
    let braceDepth = 0;
    let i = startIdx + openPat.length - 1; // start at the opening {
    let foundOpen = false;
    let closeIdx = -1;

    while (i < content.length) {
        if (content[i] === '{') { braceDepth++; foundOpen = true; }
        if (content[i] === '}') { braceDepth--; }
        if (foundOpen && braceDepth === 0) { closeIdx = i; break; }
        i++;
    }

    if (closeIdx === -1) {
        console.warn(`  ⚠ Could not find closing brace for: ${id}`);
        continue;
    }

    // Find the last comma before the closing brace to insert after the last property
    let insertIdx = closeIdx;
    let j = closeIdx - 1;
    while (j > startIdx && content[j] === ' ' || content[j] === '\t' || content[j] === '\n' || content[j] === '\r') j--;
    // now at last non-whitespace char before }
    // back up to find the comma that ends the last property
    while (j > startIdx && content[j] !== ',') j--;
    // j now at comma, so insert sha256 after it
    insertIdx = j + 1;

    const insert = `\n        sha256: null,`;
    content = content.slice(0, insertIdx) + insert + content.slice(insertIdx);
    updated++;
    console.log(`  ✓ ${id}`);
}

// Remove the trailing comma before the final closing brace of DEPS
// This handles the case where we inserted sha256 after the last property
// and it left a trailing comma issue - actually let's check if there's a problem

fs.writeFileSync(DEPS_PATH, content, 'utf8');
console.log(`\nDone. ${updated} entries updated with sha256: null.`);
