const { readdirSync, statSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const roots = ['src', 'scripts', 'build.js'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'app', '.git']);
const files = [];

function collect(path) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
        const name = path.split(/[\\/]/).pop();
        if (ignoredDirectories.has(name)) return;
        for (const entry of readdirSync(path)) collect(join(path, entry));
        return;
    }

    if (path.endsWith('.js')) files.push(path);
}

for (const root of roots) collect(root);

let hasError = false;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) hasError = true;
}

if (hasError) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
