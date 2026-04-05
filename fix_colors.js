const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, 'js', 'components');

function walk(dir) {
    let results = [];
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

const cssFiles = walk(COMPONENTS_DIR);

let modifiedFiles = 0;

cssFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Replace background: rgba(255,255,255, 0.xx) with var(--bg-recessed)
    content = content.replace(/background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\);/g, 'background: var(--bg-recessed);');
    content = content.replace(/background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[0-9]+\s*\);/g, 'background: var(--bg-recessed);');
    
    content = content.replace(/background-color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\);/g, 'background-color: var(--bg-recessed);');
    content = content.replace(/background-color:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[0-9]+\s*\);/g, 'background-color: var(--bg-recessed);');

    // Replace borders
    content = content.replace(/border:\s*([0-9]+px)\s+solid\s+rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\);/g, 'border: $1 solid var(--border);');
    content = content.replace(/border-color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\);/g, 'border-color: var(--border);');

    // Replace text color
    content = content.replace(/color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\);/g, 'color: var(--text-2);');
    
    // Replace surface colors
    content = content.replace(/var\(--bg-secondary,\s*rgba\([^)]+\)\)/g, 'var(--surface)');
    content = content.replace(/var\(--bg-tertiary,\s*rgba\([^)]+\)\)/g, 'var(--surface-2)');
    content = content.replace(/var\(--border-secondary,\s*rgba\([^)]+\)\)/g, 'var(--border)');
    content = content.replace(/var\(--text-primary,\s*#[0-9a-fA-F]+\)/g, 'var(--text)');

    if (content !== original) {
        fs.writeFileSync(file, content);
        modifiedFiles++;
    }
});

console.log(`Updated ${modifiedFiles} CSS files to use design tokens.`);
