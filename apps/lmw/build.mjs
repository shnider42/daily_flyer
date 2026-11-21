import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
for (const file of ['index.html', 'style.css', 'app.js', 'appearance.js', 'config.js', 'qr.svg']) {
  const contents = await readFile(join(root, 'public', file), 'utf8');
  if (!contents.trim()) throw new Error(`Missing content in ${file}`);
}
await rm(join(root, 'dist'), { recursive: true, force: true });
await mkdir(join(root, 'dist'), { recursive: true });
await cp(join(root, 'public'), join(root, 'dist'), { recursive: true });
const { writeFile } = await import('node:fs/promises');
const organizerShell = (await readFile(join(root, 'public', 'index.html'), 'utf8'))
  .replace('<title>Keep the connection going · Leadership MetroWest</title>', '<title>Organizer workspace · Leadership MetroWest</title>')
  .replace('data-page="attendee"', 'data-page="organizer"')
  .replace('id="portal-label">Alumni connections', 'id="portal-label">Organizer workspace')
  .replace('aria-label="Organizer navigation" hidden', 'aria-label="Organizer navigation"');
await mkdir(join(root, 'dist', 'organizer'), { recursive: true });
await writeFile(join(root, 'dist', 'organizer', 'index.html'), organizerShell);
console.log('LMW static site built. No packages, remote fonts, or analytics required.');
