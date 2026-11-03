const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function goalWindow(kicker,distance){
 const range=54+((kicker.kickPower??85)-75)*.45;
 const width=clamp(.24-(distance-20)*.003+((kicker.kickAccuracy??82)-82)*.001,.075,.27);
 return {range,minPower:clamp((distance-12)/(range-12),0,1),low:.5-width,high:.5+width};
}
export function goalResult(kicker,distance,power,accuracy){
 const w=goalWindow(kicker,distance),travel=12+clamp(power,0,1)*(w.range-12),offset=clamp(accuracy,0,1)-.5;
 const short=travel+.001<distance,wide=accuracy<w.low||accuracy>w.high;
 return {good:!short&&!wide,reason:short?'SHORT':wide?(offset<0?'WIDE LEFT':'WIDE RIGHT'):'THROUGH THE UPRIGHTS',travel,offset,window:w};
}
