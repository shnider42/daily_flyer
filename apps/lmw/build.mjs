import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
for (const file of ['index.html', 'style.css', 'app.js', 'config.js', 'qr.svg']) {
  const contents = await readFile(join(root, 'public', file), 'utf8');
  if (!contents.trim()) throw new Error(`Missing content in ${file}`);
}
await rm(join(root, 'dist'), { recursive: true, force: true });
await mkdir(join(root, 'dist'), { recursive: true });
await cp(join(root, 'public'), join(root, 'dist'), { recursive: true });
console.log('LMW static site built. No packages, remote fonts, or analytics required.');
