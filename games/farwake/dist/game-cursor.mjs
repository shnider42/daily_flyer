/** A small native cursor over the playable canvas; menus keep their normal pointer. */
export function createGameCursor({canvas,active=()=>false,aiming=()=>false,document=globalThis.document,window=globalThis.window}={}) {
  if(!canvas?.addEventListener||!canvas.dataset)return {update:()=>null,reset(){},dispose(){}};
  let inside=false,mouse=false,focused=document?.hasFocus?.()!==false,current=null,disposed=false;
  const bindings=[];
  const bind=(target,type,handler)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler);bindings.push([target,type,handler]);};
  const set=value=>{
    if(current===value)return value;
    current=value;
    if(value)canvas.dataset.gameCursor=value;else delete canvas.dataset.gameCursor;
    return value;
  };
  const update=()=>set(!disposed&&inside&&mouse&&focused&&!document?.hidden&&active()?(aiming()?'aim':'navigate'):null);
  const reset=()=>{inside=false;mouse=false;return set(null);};
  const locate=event=>{
    mouse=!event.pointerType||event.pointerType==='mouse';
    if(!mouse){inside=false;update();return;}
    const rect=canvas.getBoundingClientRect();
    inside=Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&event.clientX>=rect.left&&event.clientX<rect.right&&event.clientY>=rect.top&&event.clientY<rect.bottom;
    update();
  };
  bind(canvas,'pointerenter',locate);
  bind(canvas,'pointermove',locate);
  bind(canvas,'pointerdown',locate);
  bind(canvas,'pointerleave',reset);
  bind(canvas,'pointercancel',reset);
  bind(window,'blur',()=>{focused=false;reset();});
  bind(window,'focus',()=>{focused=true;update();});
  bind(document,'visibilitychange',()=>{focused=document?.hasFocus?.()!==false;reset();});
  return {update,reset,dispose(){disposed=true;for(const [target,type,handler] of bindings)target.removeEventListener?.(type,handler);bindings.length=0;reset();}};
}
