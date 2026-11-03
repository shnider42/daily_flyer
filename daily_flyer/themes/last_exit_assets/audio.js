// Original procedural score and effects. All audio starts inside a user gesture.
export class Sound{
 constructor(){this.enabled=true;this.music=true;this.effects=true;this.ctx=null;this.running=false;this.next=0;this.step=0;}
 unlock(){try{if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();const c=this.ctx;this.master=c.createGain();this.master.gain.value=.5;this.master.connect(c.destination);this.fx=c.createGain();this.fx.connect(this.master);this.song=c.createGain();this.song.gain.value=.45;this.song.connect(this.master);
 this.motor=c.createOscillator();this.motor.type='sawtooth';this.motorGain=c.createGain();this.motorGain.gain.value=0;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=300;this.motor.connect(filter);filter.connect(this.motorGain);this.motorGain.connect(this.fx);this.motor.start();
 const buf=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;this.noiseBuffer=buf;const noise=c.createBufferSource();noise.buffer=buf;noise.loop=true;const nf=c.createBiquadFilter();nf.type='bandpass';nf.frequency.value=1400;this.tyres=c.createGain();this.tyres.gain.value=0;noise.connect(nf);nf.connect(this.tyres);this.tyres.connect(this.fx);noise.start();
 this.siren=c.createOscillator();this.siren.type='sine';this.sirenGain=c.createGain();this.sirenGain.gain.value=0;this.siren.connect(this.sirenGain);this.sirenGain.connect(this.fx);this.siren.start();}
 this.ctx.resume().catch(()=>{});this.next=this.ctx.currentTime+.05;
 }catch(e){console.warn('Audio unavailable',e.message);}}
 setRunning(v){this.running=v;if(this.ctx){this.master.gain.setTargetAtTime(this.enabled&&v?.55:0,this.ctx.currentTime,.08);this.next=this.ctx.currentTime+.05;}}
 toggle(){this.enabled=!this.enabled;this.unlock();this.setRunning(this.running);return this.enabled;}
 tone(freq,start,len,vol,type='triangle',bus=this.song){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(vol,start+.008);g.gain.exponentialRampToValueAtTime(.001,start+len);o.connect(g);g.connect(bus);o.start(start);o.stop(start+len+.03);o.onended=()=>{o.disconnect();g.disconnect();};}
 noise(at,len,vol,hz,bus=this.song){const c=this.ctx,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=this.noiseBuffer;f.type='highpass';f.frequency.value=hz;g.gain.setValueAtTime(vol,at);g.gain.exponentialRampToValueAtTime(.001,at+len);s.connect(f);f.connect(g);g.connect(bus);s.start(at);s.stop(at+len);s.onended=()=>{s.disconnect();g.disconnect();f.disconnect();};}
 update(game,input){if(!this.ctx)return;const c=this.ctx,t=c.currentTime;this.master.gain.setTargetAtTime(this.running&&this.enabled?.55:0,t,.05);if(!this.running||!this.enabled)return;
 this.fx.gain.setTargetAtTime(this.effects?1:0,t,.03);this.song.gain.setTargetAtTime(this.music?.45:0,t,.04);
 const speed=Math.abs(game.car.speed),rev=40+(speed%11)*5+(input.gas?17:0);this.motor.frequency.setTargetAtTime(rev,t,.12);this.motorGain.gain.setTargetAtTime(game.onFoot||game.car.engineDamage>=100?0:(.04+speed*.0014)*(game.car.engineDamage>55&&Math.sin(game.car.motorClock*11)>.3?.25:1),t,.08);this.tyres.gain.setTargetAtTime(!game.onFoot&&game.car.slip>2?Math.min(.08,game.car.slip*.009):0,t,.08);this.siren.frequency.setTargetAtTime(640+Math.sin(t*4)*220,t,.02);const nearestSiren=Math.min(Infinity,...game.cops.filter(p=>p.sirens).map(p=>Math.hypot(p.x-game.actor.x,p.z-game.actor.z)));this.sirenGain.gain.setTargetAtTime(game.heat?.04*Math.max(0,1-nearestSiren/140):0,t,.1);
 if(game.onFoot&&game.person.speed>.5&&t-(this.lastStep||0)>(game.person.speed>4?.23:.38)){this.noise(t,.04,.022,250,this.fx);this.lastStep=t;}
 if(game.impact>5&&t-(this.lastCrash||0)>.5){this.noise(t,.19,Math.min(.3,game.impact*.012),220,this.fx);this.lastCrash=t;}
 if((game.propImpactCount||0)!==(this.lastPropImpact||0)){this.lastPropImpact=game.propImpactCount;const e=game.street?.events?.at(-1);if(e&&t-(this.lastClatter||0)>.18){const d=Math.hypot(e.x-game.actor.x,e.z-game.actor.z),volume=.13*Math.max(0,1-d/65);if(volume>.005){this.noise(t,.13,volume,e.kind==='bench'?450:1200,this.fx);if(e.kind!=='bench')this.tone(e.kind==='lamp'?145:260,t,.2,volume*.35,'triangle',this.fx);this.lastClatter=t;}}}
 if((game.explosionCount||0)!==(this.lastExplosion||0)){this.lastExplosion=game.explosionCount;if(game.explosions?.length){const e=game.explosions[game.explosions.length-1],d=Math.hypot(e.x-game.actor.x,e.z-game.actor.z),volume=.4*Math.max(0,1-d/130);if(volume>0){this.noise(t,.6,volume,75,this.fx);this.tone(46,t,.65,volume*.6,'sine',this.fx);}}}
 if(this.next<t-.5)this.next=t+.05;
 while(this.next<t+.12){if(this.music)this.sequence(this.step,this.next);this.next+=60/108/4;this.step++;}
 }
 sequence(step,t){const n=step%64,bass=[40,40,47,50,40,52,47,43,45,45,52,55,45,57,52,48];const bar=Math.floor(n/16),i=n%16;
 if(i%4===0){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(42,t+.14);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(this.song);o.start(t);o.stop(t+.2);o.onended=()=>{o.disconnect();g.disconnect();};}
 if(i===4||i===12)this.noise(t,.13,.15,1000);
 if(i%2===0)this.noise(t,.035,i%4===0?.055:.035,6500);
 if([0,3,6,8,10,14].includes(i)){const note=bass[(bar*4+Math.floor(i/4))%bass.length];this.tone(440*2**((note-69)/12),t,.22,.22,'triangle');}
 if(i===2||i===7||i===11||i===15){const root=[52,52,57,59][bar];for(const interval of[0,3,7,10])this.tone(440*2**((root+interval-69)/12),t,.09,.025,'sawtooth');}
 if(n===30||n===46||n===62)this.tone(440*2**((76-69)/12),t,.14,.025,'sine');
 }
}
