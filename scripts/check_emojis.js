const fs = require('fs');
const path = require('path');

// Comprehensive Unicode Emoji pattern
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/u;

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.git', 'dist', '.gemini', 'artifacts'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (/\.(html|js|css|json|py|md|sql)$/.test(file)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const files = walk('.');
let found = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (emojiRegex.test(line)) {
      console.log(`EMOJI FOUND in ${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
      found++;
    }
  });
}
console.log(`Scan completed. Total emojis found: ${found}`);
