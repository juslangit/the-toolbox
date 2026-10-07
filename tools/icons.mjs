// Adds Lucide icons to js/icons.js, which keeps them inline so the app works offline.
//   node tools/icons.mjs <name> [name…]     add these icons
//   node tools/icons.mjs                    rebuild the ones already there
// Downloads lucide-static once (npm pack) into a temp folder.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'icons.js');
const src = readFileSync(file, 'utf8');
const have = [...src.matchAll(/^ "([a-z0-9-]+)":/gm)].map(m => m[1]);
const names = [...new Set([...have, ...process.argv.slice(2)])].sort();

const dir = mkdtempSync(join(tmpdir(), 'lucide-'));
execSync('npm pack lucide-static@latest --silent && tar xzf lucide-static-*.tgz', { cwd: dir, stdio: 'ignore' });
const missing = [];
const paths = {};
for (const n of names) {
  const p = join(dir, 'package', 'icons', n + '.svg');
  if (!existsSync(p)) { missing.push(n); continue; }
  paths[n] = readFileSync(p, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}
if (missing.length) { console.error('not in Lucide: ' + missing.join(', ')); process.exitCode = 1; }

const body = Object.entries(paths).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
const out = src.replace(/const PATHS = \{[\s\S]*?\n\};/, `const PATHS = {\n${body}\n};`);
writeFileSync(file, out);
console.log(`js/icons.js: ${Object.keys(paths).length} icons`);
