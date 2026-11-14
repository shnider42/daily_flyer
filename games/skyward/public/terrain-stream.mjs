/* Keep terrain regeneration off the animation thread. The current exact near
 * mesh remains in view while the next sector is built; requests coalesce to
 * the latest camera sector instead of accumulating an unbounded work queue. */
export class TerrainStream{
  constructor(WorkerClass=globalThis.Worker){
    this.worker=null;this.ready=null;this.pending=null;this.activeKey=null;
    if(typeof WorkerClass!=='function')return;
    try{
      this.worker=new WorkerClass(new URL('./terrain-worker.mjs',import.meta.url),{type:'module',name:'skyward-terrain'});
      this.worker.onmessage=event=>{this.ready=event.data;this.activeKey=null;if(this.pending){const next=this.pending;this.pending=null;this._send(next);}};
      this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;this.pending=null;this.activeKey=null;};
    }catch{this.worker=null;}
  }
  _send(job){this.activeKey=job.key;this.worker.postMessage(job);}
  request(job){
    if(!this.worker)return false;
    if(job.key===this.activeKey||job.key===this.ready?.key){this.pending=null;return true;}
    if(job.key===this.pending?.key)return true;
    if(this.activeKey)this.pending=job;else this._send(job);return true;
  }
  take(){const result=this.ready;this.ready=null;return result;}
  dispose(){this.worker?.terminate();this.worker=null;this.pending=null;this.ready=null;this.activeKey=null;}
}
