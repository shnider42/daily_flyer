import {cpSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=dirname(fileURLToPath(import.meta.url));
const checks=spawnSync(process.execPath,['--check',join(root,'public/app.js')],{stdio:'inherit'});
if(checks.status!==0)process.exit(checks.status||1);
const tests=spawnSync(process.execPath,['--test',...readdirSync(join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>join(root,'tests',f))],{stdio:'inherit'});
if(tests.status!==0)process.exit(tests.status||1);
const out=join(root,'dist');mkdirSync(out,{recursive:true});cpSync(join(root,'public'),out,{recursive:true});
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
writeFileSync(join(out,'build-info.json'),JSON.stringify({app:'Dayboard',version:pkg.version,commit:git.status===0?git.stdout.trim():null},null,2));
console.log('Dayboard built in apps/dayboard/dist. No runtime dependencies.');
