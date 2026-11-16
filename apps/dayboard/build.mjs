import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {resolveTeamConfig} from './build-config.mjs';

const root=dirname(fileURLToPath(import.meta.url));
if(!existsSync(join(root,'node_modules','esbuild','package.json'))){
  const install=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,stdio:'inherit'});
  if(install.status!==0)process.exit(install.status||1);
}
for(const script of readdirSync(join(root,'public')).filter(name=>/\.(?:m?js)$/.test(name))){
  const checks=spawnSync(process.execPath,['--check',join(root,'public',script)],{stdio:'inherit'});
  if(checks.status!==0)process.exit(checks.status||1);
}
const tests=spawnSync(process.execPath,['--test',...readdirSync(join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>join(root,'tests',f))],{stdio:'inherit'});
if(tests.status!==0)process.exit(tests.status||1);
const out=join(root,'dist');rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});cpSync(join(root,'public'),out,{recursive:true});
const {TEAM_CONFIG:sourceConfig}=await import('./public/team-config.mjs');
const config=resolveTeamConfig(sourceConfig,process.env);
const {enabled}=config, backendOrigin=config.url;
writeFileSync(join(out,'team-config.mjs'),`export const TEAM_CONFIG = Object.freeze(${JSON.stringify(config)});\n`);
const {build}=await import('esbuild');
await build({entryPoints:[join(root,'public','app.js')],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:join(out,'app.js'),external:['./team-config.mjs'],minify:true,legalComments:'eof'});
if(enabled){
  const html=readFileSync(join(out,'index.html'),'utf8');
  writeFileSync(join(out,'index.html'),html.replace("connect-src 'self'",`connect-src 'self' ${backendOrigin} ${backendOrigin.replace(/^https:/,'wss:')}`));
}
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
writeFileSync(join(out,'build-info.json'),JSON.stringify({app:'Dayboard',version:pkg.version,commit:git.status===0?git.stdout.trim():null,teams:enabled?'configured':'disabled'},null,2));
console.log(`Dayboard built in apps/dayboard/dist. Team mode ${enabled?'configured':'disabled'}.`);
