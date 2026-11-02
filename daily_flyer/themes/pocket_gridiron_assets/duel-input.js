export function vector(v){let x=Number(v?.x),y=Number(v?.y);if(!Number.isFinite(x))x=0;if(!Number.isFinite(y))y=0;const n=Math.max(1,Math.hypot(x,y));return {x:x/n,y:y/n};}
