const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [];

function collect(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) collect(relativePath);
    else if (entry.name.endsWith('.js')) files.push(relativePath);
  }
}

collect('backend');
collect('device-simulator');

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`语法检查通过：${files.length} 个 JavaScript 文件`);
