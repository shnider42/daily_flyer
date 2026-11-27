/** Fit independent thumb sizes around Farwake's separate fire / brake controls. */
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function normalizeThumbPreferences(value={}){
 return{steeringStickScale:clamp(finite(value.steeringStickScale,.9),.65,1.2),strafeStickScale:clamp(finite(value.strafeStickScale,1.1),.8,1.5)};
}
export function touchControlLayout({width=390,height=844,left=18,right=18,bottom=0,controlScale=1,steeringStickScale=.9,strafeStickScale=1.1,
 onFoot=false,combat=false,gunnery=false,leftHanded=false}={}){
 width=Math.max(240,finite(width,390));height=Math.max(240,finite(height,844));
 left=clamp(finite(left,18),0,width/5);right=clamp(finite(right,18),0,width/5);bottom=clamp(finite(bottom,0),0,height/5);
 const landscape=width>height,scales=normalizeThumbPreferences({steeringStickScale,strafeStickScale}),buttons=clamp(finite(controlScale,1),.8,1.2);
 const centerWidth=clamp(76*buttons,60,88),gap=8,available=width-left-right-centerWidth-gap*2;
 const wantedMove=104*scales.steeringStickScale,wantedAim=(onFoot&&combat?88:100)*scales.strafeStickScale;
 const aimMin=onFoot&&combat?72:82,moveSize=Math.max(64,Math.min(wantedMove,available-aimMin,landscape?height*.31:Infinity));
 const aimWidth=Math.max(64,Math.min(wantedAim,available-moveSize,landscape?height*.37:Infinity)),aimHeight=onFoot&&combat?aimWidth:Math.max(44,46*scales.strafeStickScale);
 const thumbBottom=bottom+24,moveLeft=leftHanded?width-right-moveSize:left,aimLeft=leftHanded?left:width-right-aimWidth;
 const gapLeft=leftHanded?aimLeft+aimWidth:moveLeft+moveSize,gapRight=leftHanded?moveLeft:aimLeft,center=(gapLeft+gapRight)/2;
 const centerLeft=landscape?(leftHanded?gapLeft+8:gapRight-centerWidth-8):center-centerWidth/2;
 const actionLeft=landscape?(leftHanded?centerLeft+centerWidth+8:gapLeft+8):gapLeft+8;
 const actionRight=landscape?(leftHanded?gapRight-8:centerLeft-8):gapRight-8;
 const fireWidth=Math.min(80*buttons,aimWidth),fireHeight=Math.max(44,50*buttons);
 const fireBottom=gunnery?thumbBottom:thumbBottom+aimHeight+12;
 const deckHeight=bottom+Math.max(thumbBottom-bottom+moveSize+24,fireBottom-bottom+(gunnery?moveSize:fireHeight)+16,148*buttons);
 return{move:{left:moveLeft,bottom:thumbBottom,width:moveSize,height:moveSize},aim:{left:aimLeft,bottom:thumbBottom,width:aimWidth,height:aimHeight},
  fire:{left:aimLeft+(aimWidth-(gunnery?moveSize:fireWidth))/2,bottom:fireBottom,width:gunnery?moveSize:fireWidth,height:gunnery?moveSize:fireHeight},
  center:{left:centerLeft,width:centerWidth,bottom:bottom+24,brakeBottom:bottom+76,safeLeft:gapLeft+8,safeWidth:Math.max(44,gapRight-gapLeft-16),actionLeft,actionWidth:Math.max(44,actionRight-actionLeft)},deckHeight,landscape};
}
