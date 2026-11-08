/** Small rolling measurements; no session identity or gameplay data is collected. */
export class FrameMonitor {
  constructor({capacity=240,clock=()=>globalThis.performance?.now?.()??Date.now()}={}){this.capacity=capacity;this.clock=clock;this.frames=[];this.gaps=[];this.previousFrame=null;this.previousSnapshot=null;this.lastTick=null;this.cached=null;this.cachedAt=-Infinity;}
  frame(now,visible=true){
    if(!visible){this.previousFrame=null;return;}
    if(this.previousFrame!==null){const ms=now-this.previousFrame;if(ms>0&&ms<1000){this.frames.push(ms);if(this.frames.length>this.capacity)this.frames.shift();}}
    this.previousFrame=now;
  }
  snapshot(packet,now=this.clock()){
    if(packet.type==='welcome'){this.gaps=[];this.previousSnapshot=null;this.lastTick=null;this.cached=null;}
    if(packet.type!=='snapshot'||packet.tick===this.lastTick)return;
    if(this.previousSnapshot!==null){const gap=now-this.previousSnapshot;if(gap>0&&gap<5000){this.gaps.push(gap);if(this.gaps.length>60)this.gaps.shift();}}
    this.previousSnapshot=now;this.lastTick=packet.tick;
  }
  summary(now=this.clock()){
    if(this.cached&&now-this.cachedAt<200)return this.cached;
    const stats=values=>{if(!values.length)return{mean:0,p95:0,max:0};const ordered=[...values].sort((a,b)=>a-b);return{mean:values.reduce((a,b)=>a+b,0)/values.length,p95:ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*.95)-1)],max:ordered.at(-1)};};
    const frame=stats(this.frames),gap=stats(this.gaps);this.cachedAt=now;
    return this.cached={fps:frame.mean?1000/frame.mean:0,frameP95:frame.p95,frameMax:frame.max,updateHz:gap.mean?1000/gap.mean:0,updateP95:gap.p95,updateMax:gap.max};
  }
}
