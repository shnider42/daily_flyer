// Pointer normalization is identical on Safari, desktop and other touch browsers.
export function stickVector(clientX,clientY,rect){
 let x=(clientX-(rect.left+rect.width/2))/(rect.width*.38),y=((rect.top+rect.height/2)-clientY)/(rect.height*.38);
 const length=Math.hypot(x,y);if(length<.1)return{x:0,y:0};if(length>1){x/=length;y/=length;}return{x,y};
}
export function driveSteer(x){return Math.abs(x)<.1?0:Math.sign(x)*(Math.abs(x)-.1)/.9;}
