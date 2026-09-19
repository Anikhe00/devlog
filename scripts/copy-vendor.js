// Copies the two browser libraries out of node_modules into public/vendor so they are plain
// static files (Vercel serves public/ from its CDN and ignores express.static). Runs on `npm install`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });

for (const [name, from] of [
  ['marked.js', 'marked/lib/marked.umd.js'],
  ['purify.js', 'dompurify/dist/purify.min.js'],
]) {
  fs.copyFileSync(path.join(root, 'node_modules', from), path.join(out, name));
}
