// Initial-load budget check. Run after `npm run build`: npm run perf
// Measures what a phone downloads before the start screen is usable: index.html, the entry
// JS/CSS (+ modulepreloads), and the Google Fonts files for the subsets the page uses.
// Also fails on raster images in public/ that aren't WebP.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 3 * 1024 * 1024;
const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PUBLIC = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// Google serves woff2 + unicode-range subsets to modern browsers based on the UA
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const problems: string[] = [];

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ missing: run `npm run build` first');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf-8');
const local = [
  'index.html',
  ...[...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
];

let rawTotal = 0;
let wireTotal = 0;
console.log('Initial load (from dist/):');
for (const file of [...new Set(local)]) {
  const buf = readFileSync(join(DIST, file));
  const gz = gzipSync(buf).length;
  rawTotal += buf.length;
  wireTotal += gz;
  console.log(`  ${file.padEnd(40)} ${kb(buf.length).padStart(10)}  gz ${kb(gz).padStart(9)}`);
}

// Lazy chunks: everything in assets/ not loaded up front
const lazy = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js') && !local.includes(`assets/${f}`));
console.log('\nLazy chunks (loaded on demand):');
for (const f of lazy) {
  const buf = readFileSync(join(DIST, 'assets', f));
  console.log(`  ${f.padEnd(40)} ${kb(buf.length).padStart(10)}  gz ${kb(gzipSync(buf).length).padStart(9)}`);
}

// Fonts: fetch the same CSS the page links to and sum the woff2 files a Latin-script page needs
const fontLinks = [...new Set([...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
let fontTotal = 0;
console.log('\nFonts (Google Fonts, woff2):');
try {
  for (const href of fontLinks) {
    const css = await (await fetch(href, { headers: { 'User-Agent': CHROME_UA } })).text();
    const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)];
    const urls = new Set<string>();
    for (const [, subset, body] of blocks) {
      // Unlabelled blocks come from text= requests (tiny custom subsets)
      if (subset && subset !== 'latin' && subset !== 'latin-ext') continue;
      const url = body.match(/url\((https:[^)]+)\)/)?.[1];
      if (url) urls.add(url);
    }
    for (const url of urls) {
      const size = (await (await fetch(url)).arrayBuffer()).byteLength;
      fontTotal += size;
      console.log(`  ${url.split('/').slice(-2).join('/').slice(0, 40).padEnd(40)} ${kb(size).padStart(10)}`);
    }
  }
} catch (err) {
  console.log(`  (couldn't reach Google Fonts: ${(err as Error).message})`);
}

const initial = wireTotal + fontTotal;
console.log(`\nInitial download: ${kb(initial)} (JS/CSS/HTML gz ${kb(wireTotal)} + fonts ${kb(fontTotal)}); budget ${kb(BUDGET_BYTES)}`);
if (initial > BUDGET_BYTES) problems.push(`initial load ${kb(initial)} exceeds ${kb(BUDGET_BYTES)}`);
console.log(`(uncompressed JS/CSS/HTML: ${kb(rawTotal)})`);

// Images must be WebP (SVG is fine for icons)
const walk = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : [];
const rasters = walk(PUBLIC).filter((f) => ['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(extname(f).toLowerCase()));
for (const f of rasters) problems.push(`not WebP: ${f.replace(PUBLIC, 'public/')}`);
console.log(`\nImages in public/: ${rasters.length ? `${rasters.length} non-WebP raster(s)` : 'all WebP/SVG ✓'}`);

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nPerf budget OK');
process.exit(problems.length ? 1 : 0);
