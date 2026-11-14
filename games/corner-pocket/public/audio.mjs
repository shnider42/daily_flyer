/** Small, original synthesized table sounds. Starts only after a player gesture. */
export class PoolAudio {
  constructor(enabled=false){this.enabled=enabled;this.context=null;this.lastEvent=0;this.gameId=null;this.lastCollision=0;}
  async unlock(){if(!this.enabled)return;try{const A=globalThis.AudioContext||globalThis.webkitAudioContext;if(!A)return;if(!this.context)this.context=new A();if(this.context.state==='suspended')await this.context.resume();}catch{}}
  setEnabled(enabled){this.enabled=enabled;if(enabled)this.unlock();}
  tone(freq,duration,volume,type='sine',endFreq=freq){if(!this.enabled||!this.context||this.context.state!=='running')return;const c=this.context,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),t+duration);g.gain.setValueAtTime(Math.max(.0001,volume),t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};}
  click(speed=1){const v=Math.min(.09,.014+Math.abs(speed)*.018);this.tone(1750,.026,v,'sine',850);this.tone(430,.045,v*.3,'triangle',170);}
  process(state){if(!state)return;if(this.gameId!==state.id){this.gameId=state.id;this.lastEvent=0;}for(const event of state.events||[]){if(event.id<=this.lastEvent)continue;this.lastEvent=event.id;if(!this.enabled)continue;const now=performance.now();if(event.kind==='shot'){this.tone(690,.055,.08,'triangle',120);}else if(event.kind==='collision'&&now-this.lastCollision>22){this.click(event.speed||1);this.lastCollision=now;}else if(event.kind==='rail'&&now-this.lastCollision>45){this.tone(180,.055,.028,'triangle',75);this.lastCollision=now;}else if(event.kind==='pocket'){this.tone(125,.12,.07,'sine',45);setTimeout(()=>this.tone(340,.04,.025,'triangle',180),75);}}}
  dispose(){this.context?.close().catch(()=>{});this.context=null;}
}
