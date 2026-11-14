import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const dest=path.join(root,'dist');
const runtime=['index.html','style.css','app.mjs','map.mjs','navigation.mjs','progress.mjs','imports.mjs','service-worker.js','manifest.webmanifest','icons','data/area.json','data/LICENSE-OSM.txt'];
const area=JSON.parse(await readFile(path.join(root,'data/area.json'),'utf8'));
if(area.schemaVersion!==1||!area.routes.length)throw new Error('Invalid area pack');
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const name of runtime){const target=path.join(dest,name);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,name),target,{recursive:true});}
console.log('Built Trailmark 0.1.1. All map assets are local.');
