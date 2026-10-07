// Writes the offline file list and a content-hash version into <dir>/sw.js.
//   node tools/stamp-sw.mjs <staged site dir>
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: stamp-sw.mjs <dir>'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name !== 'sw.js' && !name.startsWith('.')) files.push(relative(dir, p));
  }
})(dir);

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dir, f)));
const version = hash.digest('hex').slice(0, 10);

const swPath = join(dir, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const out = sw
  .replace(/const CACHE = '[^']*';/, `const CACHE = 'toolbox-${version}';`)
  .replace(/const FILES = \[.*?\]; \/\* @files \*\//, `const FILES = ${JSON.stringify(['./', ...files])}; /* @files */`);
if (out === sw) { console.error('stamp-sw: markers not found in sw.js'); process.exit(1); }
writeFileSync(swPath, out);
console.log(`sw.js: ${files.length} files, cache toolbox-${version}`);
