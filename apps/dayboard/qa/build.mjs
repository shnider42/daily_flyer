import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from '../node_modules/esbuild/lib/main.js';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, '../public');
const output = join(root, 'dist');
rmSync(output, {recursive: true, force: true});
mkdirSync(output, {recursive: true});
cpSync(source, output, {recursive: true});
cpSync(join(root, 'qa.css'), join(output, 'qa.css'));
writeFileSync(join(output, 'team-config.mjs'), 'export const TEAM_CONFIG = Object.freeze({enabled:true,url:"https://dayboard-qa.invalid",publishableKey:"sb_publishable_synthetic_qa_no_backend"});\n');
await build({
  entryPoints: [join(root, 'qa-entry.mjs')], outfile: join(output, 'app.js'),
  bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  alias: {'@supabase/supabase-js': join(root, 'fake-supabase.mjs')},
  external: ['./team-config.mjs'], sourcemap: true,
});
const html = readFileSync(join(source, 'index.html'), 'utf8')
  .replace('<title>Dayboard — personal workspace</title>', '<title>Dayboard — SYNTHETIC TEAM QA</title>')
  .replace("connect-src 'self'", "connect-src 'none'")
  .replace('<link rel="stylesheet" href="./style.css">', '<link rel="stylesheet" href="./style.css">\n  <link rel="stylesheet" href="./qa.css">');
writeFileSync(join(output, 'index.html'), html);
const hashes = Object.fromEntries(['app.js', 'shared.mjs', 'teams-ui.mjs', 'connection-status.mjs'].map(name => [name, createHash('sha256').update(readFileSync(join(source, name))).digest('hex')]));
writeFileSync(join(output, 'qa-build-info.json'), JSON.stringify({synthetic: true, backendSecurityTest: false, builtAt: new Date().toISOString(), productionSourceSHA256: hashes}, null, 2));
console.log(`Synthetic client/UI fixture built at ${output}. No hosted calls; connect-src is none.`);
