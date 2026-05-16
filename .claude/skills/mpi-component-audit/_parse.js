const fs = require('fs');
const path = require('path');
const root = process.cwd();
const d = JSON.parse(fs.readFileSync(path.join(root, '.claude/skills/mpi-component-audit/.last-audit.json'), 'utf8'));
const g = {};
let total = 0;
for (const f of d) {
  for (const m of f.messages) {
    const r = m.ruleId || '(parse-error)';
    const rel = path.relative(root, f.filePath).replace(/\\/g, '/');
    (g[r] = g[r] || []).push({ file: rel, line: m.line, msg: m.message });
    total++;
  }
}
const sorted = Object.entries(g).sort((a, b) => b[1].length - a[1].length);

const out = [];
out.push(`## Component Audit Report — ${new Date().toISOString()}`);
out.push('');
out.push(`**Total violations:** ${total}`);
out.push('');
out.push('### Summary Heatmap');
out.push('| Rule | Violations |');
out.push('|---|---|');
for (const [r, v] of sorted) out.push(`| ${r} | ${v.length} |`);
out.push('');
for (const [r, v] of sorted) {
  out.push(`### Rule: ${r}`);
  out.push('| File | Line | Message |');
  out.push('|---|---|---|');
  for (const x of v) {
    const safe = (x.msg || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    out.push(`| ${x.file} | ${x.line} | ${safe} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
