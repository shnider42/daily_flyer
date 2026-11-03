import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../../daily_flyer/themes/last_exit_assets/',import.meta.url);
const types={'terrain.js':'text/javascript; charset=utf-8','landmarks.js':'text/javascript; charset=utf-8','index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','models.js':'text/javascript; charset=utf-8','textures.js':'text/javascript; charset=utf-8','controls.js':'text/javascript; charset=utf-8','engine.js':'text/javascript; charset=utf-8','render.js':'text/javascript; charset=utf-8','audio.js':'text/javascript; charset=utf-8','game.js':'text/javascript; charset=utf-8','icon.svg':'image/svg+xml'};
export const server=createServer(async(req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
 if(path==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end(req.method==='HEAD'?'':'ok');return;}
 const file=path==='/'||path==='/last-exit/'?'index.html':path.replace(/^\/(last-exit\/)?/,'');
 if(!Object.hasOwn(types,file)){res.writeHead(404);res.end('Not found');return;}
 try{const body=await readFile(new URL(file,root));res.writeHead(200,{'Content-Type':types[file],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500);res.end('Game files unavailable');}
});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Last Exit file server ready'));
