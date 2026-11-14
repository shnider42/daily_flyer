import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateCatalog} from './catalog.js';
import {ART_KEYS} from './artwork.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const catalog=validateCatalog(JSON.parse(await readFile(path.join(root,'projects.json'),'utf8')));
for(const project of catalog)if(!ART_KEYS.includes(project.art))throw new Error(`Missing artwork for ${project.id}`);
const target=path.join(root,'dist');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
const versions={};
async function emitVersioned(filename,content){
  const ext=path.extname(filename),hash=createHash('sha256').update(content).digest('hex').slice(0,10);
  const output=`${filename.slice(0,-ext.length)}.${hash}${ext}`;
  await writeFile(path.join(target,output),content);
  versions[filename]=output;
}
for(const filename of ['catalog.js','artwork.js','projects.json','styles.css','favicon.svg']){
  const content=await readFile(path.join(root,filename),'utf8');
  await emitVersioned(filename,content);
  if(filename==='projects.json'||filename==='favicon.svg')await writeFile(path.join(target,filename),content);
}
let app=await readFile(path.join(root,'app.js'),'utf8');
for(const filename of ['catalog.js','artwork.js','projects.json'])app=app.replaceAll('./'+filename,'./'+versions[filename]);
await emitVersioned('app.js',app);
let html=await readFile(path.join(root,'index.html'),'utf8');
for(const filename of ['app.js','styles.css','favicon.svg'])html=html.replaceAll('./'+filename,'./'+versions[filename]);
await writeFile(path.join(target,'index.html'),html);
await writeFile(path.join(target,'release.json'),JSON.stringify({version:'2.1.0',projects:catalog.length,commit:process.env.RENDER_GIT_COMMIT||'local'},null,2)+'\n');
console.log(`Daily Flyer library: ${catalog.length} projects built with versioned assets into ${target}`);
