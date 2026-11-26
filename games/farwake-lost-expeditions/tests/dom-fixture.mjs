// Minimal DOM contract for running the real app module in Node. This verifies
// event wiring and persistence, not browser layout, CSS or device audio.
const voidTags=new Set(['meta','link','img','input','br','hr','source']);
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
class Classes {
  constructor(el){this.el=el;}
  values(){return new Set((this.el.className||'').split(/\s+/).filter(Boolean));}
  contains(c){return this.values().has(c);}
  add(...names){const a=this.values();names.forEach(n=>a.add(n));this.el.className=[...a].join(' ');}
  remove(...names){const a=this.values();names.forEach(n=>a.delete(n));this.el.className=[...a].join(' ');}
  toggle(name,force){const yes=force??!this.contains(name);yes?this.add(name):this.remove(name);return yes;}
}
export class Element {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentNode=null;this.attrs={};this.dataset={};this.className='';this.classList=new Classes(this);this.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};this.events={};this.hidden=false;this.open=false;this.inert=false;this.tabIndex=0;this._text='';this.naturalWidth=1672;this.naturalHeight=941;this.complete=true;this.offsetWidth=70;this.offsetHeight=44;}
  setAttribute(k,v=''){this.attrs[k]=String(v);if(k==='id')this.id=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[camel(k.slice(5))]=String(v);if(k==='hidden')this.hidden=true;if(k==='open')this.open=true;if(k==='disabled')this.disabled=true;}
  getAttribute(k){if(k.startsWith('data-'))return this.dataset[camel(k.slice(5))]??null;return this.attrs[k]??null;}
  append(...items){for(const el of items){el.parentNode=this;this.children.push(el);}}
  appendChild(el){this.append(el);return el;}
  replaceChildren(...items){this.children.forEach(x=>x.parentNode=null);this.children=[];this._text='';this.append(...items);}
  set innerHTML(html){this.replaceChildren();parse(html,this,this.ownerDocument);}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set textContent(v){this.replaceChildren();this._text=String(v??'');}
  set src(v){this._src=v;}
  get src(){return this._src;}
  get isConnected(){return this===this.ownerDocument?.root||Boolean(this.parentNode?.isConnected);}
  matches(selector){
    if(selector===':disabled')return Boolean(this.disabled);
    if(selector==='details:not([open])')return this.tagName==='DETAILS'&&!this.open;
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));
    const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if(attr)return this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);
    return this.tagName===selector.toUpperCase();
  }
  closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
  all(){return this.children.flatMap(c=>[c,...c.all()]);}
  querySelector(s){return this.all().find(el=>el.matches(s))||null;}
  querySelectorAll(s){return this.all().filter(el=>el.matches(s));}
  contains(el){return this===el||this.all().includes(el);}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  removeEventListener(type,fn){this.events[type]=(this.events[type]||[]).filter(x=>x!==fn);}
  async emit(type,event={}){const e={target:this,preventDefault(){},...event};for(const fn of this.events[type]||[])await fn(e);if(type==='click'&&this.parentNode)await this.parentNode.emit(type,e);}
  focus(){this.ownerDocument.activeElement=this;}
  getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:390,bottom:this.id==='stage'?500:64,width:390,height:this.id==='stage'?500:64};}
  getClientRects(){return [this.getBoundingClientRect()];}
  showModal(){this.open=true;}
  close(){this.open=false;void this.emit('close');}
  scrollIntoView(){}
  click(){return this.emit('click');}
  setPointerCapture(){}
}
function parse(html,parent,doc){
  const stack=[parent];
  for(const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g)){
    const value=token[0];
    if(value.startsWith('<!--')||value.startsWith('<!'))continue;
    if(value.startsWith('</')){const name=value.slice(2,-1).trim().toUpperCase();while(stack.length>1){if(stack.pop().tagName===name)break;}continue;}
    if(value.startsWith('<')){
      const m=value.match(/^<([a-z][\w-]*)([\s\S]*?)\/?\s*>$/i);if(!m)continue;
      const el=new Element(m[1],doc);
      for(const a of m[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));
      stack.at(-1).append(el);if(!voidTags.has(m[1].toLowerCase()))stack.push(el);
    }else stack.at(-1)._text+=decode(value);
  }
}
export function installDOM(t,html,{storage=new Map(),compact=true}={}){
  const doc=new Element('document',null);doc.ownerDocument=doc;doc.root=doc;doc.hidden=false;doc.createElement=tag=>new Element(tag,doc);parse(html,doc,doc);doc.body=doc.querySelector('body');doc.activeElement=doc.body;doc.dispatchEvent=event=>{void doc.emit(event.type,event);return true;};
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  let now=0;
  class LoadedImage{constructor(){this.complete=true;}set src(value){this._src=value;this.onload?.();}}
  const values={document:doc,localStorage,matchMedia:query=>({matches:query.includes('reduced-motion')?true:compact,addEventListener(){}}),ResizeObserver:class{observe(){}},Image:LoadedImage,requestAnimationFrame:fn=>fn(),getComputedStyle:()=>({paddingBottom:'10'}),performance:{now:()=>now+=1000},window:{scrollTo(){},addEventListener(){}},AudioContext:undefined,webkitAudioContext:undefined};
  const old=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const [k,v]of Object.entries(values))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
  t.after(()=>{for(const [k,v]of old)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];});
  return {document:doc,storage,localStorage};
}
