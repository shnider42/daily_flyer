/** Development server. Production is the public/ directory on Render. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=fileURLToPath(new URL('./public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"game":"suncoast","version":"0.1.0"}');return;}const decoded=decodeURIComponent(u.pathname),name=decoded==='/'?'index.html':decoded.slice(1),file=path.resolve(root,name);if(!file.startsWith(root)||!(await stat(file)).isFile())throw Error('Not found');const buf=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:buf);}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
const port=Number(arg('--port',process.env.PORT||3000)),host=arg('--host','0.0.0.0');server.listen(port,host,()=>console.log(`SUNCOAST ready on http://${host}:${port}`));
