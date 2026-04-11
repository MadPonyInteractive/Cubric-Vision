const fs = require('fs');
const path = require('path');

const cssDirs = [
    path.join(__dirname, 'js', 'components'),
    path.join(__dirname, 'styles', 'shell')
];

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.css')) {
            results.push(file);
        }
    });
    return results;
}

let cssFiles = [];
cssDirs.forEach(dir => {
    cssFiles = cssFiles.concat(walk(dir));
});

let modifiedFiles = 0;

cssFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. Strip all CSS variable fallbacks that are colors, px, or quotes
    // e.g., var(--surface-glass, rgba(22, 19, 31, 0.75)) -> var(--surface-glass)
    const fallbackRegex = /var\((--[a-zA-Z0-9-]+)\s*,\s*(?:rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}|[0-9]+px|'[^']+'|"[^"]+")\)/g;
    content = content.replace(fallbackRegex, 'var($1)');

    // Repeat once more in case of nested fallbacks or skipped overlaps
    content = content.replace(fallbackRegex, 'var($1)');

    // 2. Fix specific legacy variable naming if present still
    content = content.replace(/var\(--bg-base\)/g, 'var(--bg)');
    content = content.replace(/var\(--text-primary\)/g, 'var(--text)');
    content = content.replace(/var\(--bg-secondary\)/g, 'var(--surface)');
    content = content.replace(/var\(--bg-tertiary\)/g, 'var(--surface-2)');
    content = content.replace(/var\(--border-secondary\)/g, 'var(--border)');
    
    // 3. Fix typical pure white or red overrides inside component contexts 
    // Example: color: #fff; -> color: var(--text); (only if it looks structural)
    // Actually, we'll avoid wiping *all* #fff since some icons need it, but we can target specific component classes if needed. No blind replace for #fff.
    
    // 4. Overwrite any stray black alpha shadows that should be background recess
    content = content.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[3-9][0-9]*\s*\)/g, 'var(--bg-recessed)');
    
    // Fix my own rogue rgba inputs from MpiInput
    content = content.replace(/rgba\(10,\s*10,\s*15,\s*0\.45\)/g, 'var(--surface-3)');
    content = content.replace(/rgba\(10,\s*10,\s*15,\s*0\.6\)/g, 'var(--surface)');
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.04\)/g, 'var(--border-soft)');
    content = content.replace(/rgba\(0,\s*0,\s*0,\s*0\.5\)/g, 'var(--bg-recessed)');
    
    if (content !== original) {
        fs.writeFileSync(file, content);
        modifiedFiles++;
        console.log('Fixed:', file);
    }
});

console.log(`Updated ${modifiedFiles} CSS files globally to enforce pure tokens.`);

