/* Actual resolved air/AA shots, desktop flight preview, and reduced motion. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const tmp=fs.mkdtempSync('/tmp/ww2-effects-'),db=path.join(tmp,'game.sqlite'),base='http://127.0.0.1:8192';
const fixtures=JSON.parse(cp.execFileSync('python',['-c',`
import hashlib,json,sqlite3,sys
from ww2_web import create_app
from ww2_tactics.engine import initial
create_app(sys.argv[1],background_ai=False)
fixtures={}
for slot,(code,kind) in enumerate([('EEEE000001','bombing'),('EEEE000002','aa'),('EEEE000003','flak')],1):
 s=initial('fubar' if kind=='flak' else 'current:nightfall_beacon','dsl');s.update(ready=True,fog_of_war=False)
 for u in s['units']:u['overwatch']=False
 if kind=='bombing':
  shooter=next(u for u in s['units'] if u.get('variant')=='lancaster');shooter.update(pos=[8,13],ap=4)
  target=next(u for u in s['units'] if u.get('mission_radar'));target.update(pos=[8,12])
 else:
  s['turn']='de';shooter=next(u for u in s['units'] if u['kind']==('flak' if kind=='flak' else 'aa_gun'));shooter.update(pos=[12,10],ap=4)
  target=next(u for u in s['units'] if u['side']=='us' and u['kind']=='bomber');target.update(pos=[12,12])
 if kind=='flak':s['units']=[shooter,target]
 # The disposable Flak fixture omits other units; night cargo remains viable.
 fixtures[kind]={'code':code,'shooter':shooter['id'],'target':target['id'],'side':shooter['side']}
 with sqlite3.connect(sys.argv[1]) as d:d.execute('INSERT INTO match VALUES (?,?,?,?,?)',(slot,code,hashlib.sha256(b'fx-us').hexdigest(),hashlib.sha256(b'fx-de').hexdigest(),json.dumps(s)))
print(json.dumps(fixtures))
`,db],{encoding:'utf8'}));
const server=cp.spawn('python',['-c',`import os
import ww2_tactics.engine as engine
engine.secrets.randbelow=lambda n:n-1
from ww2_web import create_app
create_app(os.environ['WW2_DB_PATH'],background_ai=False).run(host='127.0.0.1',port=8192,threaded=True)
`],{env:{...process.env,WW2_DB_PATH:db},stdio:['ignore','ignore','pipe']});
const pages=[],errors=[];let browser;
async function settled(p){await p.waitForFunction(()=>state&&!busy&&!polling);}
async function open(kind,width=1440,reduced=false){const f=fixtures[kind],p=await browser.newPage({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000,reducedMotion:reduced?'reduce':'no-preference'});pages.push(p);p.setDefaultTimeout(16000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.addInitScript(({code,side})=>localStorage.setItem('ww2-session',JSON.stringify({code,token:'fx-'+side})),f);await p.goto(base);await p.locator('.saved-session').first().click();await settled(p);await p.locator('#map').waitFor({state:'visible'});return p;}
async function select(p,id){const index=await p.evaluate(id=>state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).findIndex(u=>u.id===id),id);await tap(p,p.locator('#roster button').nth(index));await settled(p);await tap(p,p.locator('#findUnit'));}
async function fire(p,kind){const f=fixtures[kind];await select(p,f.shooter);await tap(p,p.locator(`#map .unit[data-unit-id="${f.target}"]`));if(await p.locator('#groundStack').isVisible())await tap(p,p.locator(`#groundStack button[data-unit-id="${f.target}"]`));const revision=await p.evaluate(()=>state.revision);await tap(p,p.locator('#fire'));await p.waitForFunction(r=>state.revision>r&&!busy,revision);}
async function burstCapture(p,name){await new Promise(r=>setTimeout(r,650));const clip=await p.evaluate(()=>{const [x,y]=center(...state.effects.at(-1).positions[0]),point=new DOMPoint(x,y).matrixTransform($('map').getScreenCTM());return {x:Math.max(0,Math.min(innerWidth-180,point.x-90)),y:Math.max(0,Math.min(innerHeight-180,point.y-90)),width:180,height:180};});await p.screenshot({path:path.join(tmp,name+'-close.png'),clip});await p.screenshot({path:path.join(tmp,name+'.png')});}
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const bomb=await open('bombing');await select(bomb,fixtures.bombing.shooter);
 const flight=await bomb.evaluate(()=>state.legal[selected].moves.find(m=>m.path?.length===2&&m.pos[1]>=14));assert.ok(flight);await bomb.locator(`#map .hex.move[data-x="${flight.pos[0]}"][data-y="${flight.pos[1]}"]`).hover();
 const trail=await bomb.locator('#map .flight-trail').evaluate(e=>({fill:getComputedStyle(e).fill,stroke:getComputedStyle(e).stroke,points:e.points.numberOfItems}));assert.equal(trail.fill,'none');assert.notEqual(trail.stroke,'none');assert.equal(trail.points,3);await bomb.screenshot({path:path.join(tmp,'flight-preview-desktop.png')});
 await fire(bomb,'bombing');await bomb.locator('#map .effect-bombing .effect-falling-bomb').waitFor({state:'attached'});assert.equal(await bomb.locator('#map .effect-bombing.effect-hit').count(),1);await burstCapture(bomb,'bombing-desktop');
 const aa=await open('aa');await fire(aa,'aa');await aa.locator('#map .effect-anti_air .effect-flak-burst').waitFor({state:'attached'});assert.equal(await aa.locator('#map .effect-aa-tracer').count(),3);await burstCapture(aa,'flak-desktop');
 const flak=await open('flak',390,true);await fire(flak,'flak');await flak.locator('#map .effect-anti_air .effect-light-battery').waitFor({state:'attached'});assert.equal(await flak.locator('#map .effect-air-tracer').first().evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await flak.locator('#map .effect-flak-puff').first().evaluate(e=>getComputedStyle(e).animationName),'none');assert.ok(await flak.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await flak.screenshot({path:path.join(tmp,'aa-reduced-motion-phone.png')});
 const before=await aa.evaluate(()=>JSON.stringify(state));await aa.evaluate(()=>{const svg=$('map');paintEffects(svg,[{kind:'anti_air',positions:[[12,12]],layer:'air',hit:false,battery:'heavy'}]);});const hidden=aa.locator('#map .effect-anti_air.effect-miss');assert.equal(await hidden.locator('.effect-aa-tracer').count(),0);assert.equal(await hidden.locator('.effect-muzzle-flash').count(),0);assert.equal(await aa.evaluate(()=>JSON.stringify(state)),before);
 assert.deepEqual(errors,[]);console.log('PASS: actual bomber release/impact, AA and light Flak tracers/bursts, unfilled desktop multi-hex flight preview, hidden origins omitted, reduced-motion phone cues, no presentation state mutation.',JSON.stringify({screenshots:tmp}));
})().catch(async e=>{console.error(e,errors);for(let i=0;i<pages.length;i++)try{await pages[i].screenshot({path:path.join(tmp,'failure-'+i+'.png')});console.error(i,await pages[i].evaluate(()=>({message:$('message').textContent,selected,busy,polling})));}catch{}console.error(tmp);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
