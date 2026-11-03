const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function goalWindow(kicker,distance,conditions={}){
 const range=(54+((kicker.kickPower??85)-75)*.45)*(conditions.rangeFactor??1)+(conditions.wind?.y||0)*.30;
 const width=clamp(.24-(distance-20)*.003+((kicker.kickAccuracy??82)-82)*.001,.075,.27);
 const halfWidth=width*(conditions.accuracyFactor??1),bias=clamp((conditions.wind?.x||0)*.0035*distance/40,-.14,.14),center=.5-bias;
 return {range,minPower:clamp((distance-12)/(range-12),0,1),center,halfWidth,bias,low:center-halfWidth,high:center+halfWidth};
}
export function goalResult(kicker,distance,power,accuracy,conditions={}){
 const w=goalWindow(kicker,distance,conditions),travel=12+clamp(power,0,1)*(w.range-12),offset=clamp(accuracy,0,1)-w.center;
 const short=travel+.001<distance,wide=accuracy<w.low||accuracy>w.high;
 return {good:!short&&!wide,reason:short?'SHORT':wide?(offset<0?'WIDE LEFT':'WIDE RIGHT'):'THROUGH THE UPRIGHTS',travel,offset,window:w};
}
