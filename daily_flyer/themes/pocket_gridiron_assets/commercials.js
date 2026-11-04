// Entirely fictional sponsors. Visuals use the timeout clock, never gameplay RNG.
export const COMMERCIALS=[
 {brand:'FOURTH DOWN FIZZ',line:'All the bubbles. None of the play calling.',tag:'Officially refreshing. Unofficially everything else.',color:'#7ad2bf',kind:'can'},
 {brand:'YELLOW MARKER XL',line:'For coaches who have run out of circles.',tag:'Now with 40% more BOOM. Marker cap sold somewhere.',color:'#f3ce5d',kind:'marker'},
 {brand:'POCKET PRETZELS',line:'The only twist your offensive line needs.',tag:'Crunch on third down. Please chew before celebrating.',color:'#e6ad71',kind:'pretzel'},
 {brand:'THIRD & LONG MATTRESSES',line:'Built for the deepest coverage.',tag:'Do not install in the defensive backfield.',color:'#bbb4e6',kind:'bed'}
];
export function commercialFor(quarter=1,weather='clear'){return COMMERCIALS[((quarter-1)+(weather==='heat'?0:1))%COMMERCIALS.length];}
export function paintCommercial(canvas,ad,time=0,moving=true){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,t=moving?time:0;
 c.clearRect(0,0,w,h);c.fillStyle='#0f2426';c.fillRect(0,0,w,h);c.fillStyle=ad.color;
 for(let x=0;x<w;x+=24){const y=18+Math.sin(t*2+x)*4;c.globalAlpha=.17;c.fillRect(x,y,12,3);}c.globalAlpha=1;
 const y=45+Math.sin(t*3)*3,x=w/2;c.save();c.translate(x,y);
 const r=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
 if(ad.kind==='can'){r(-24,-22,48,82,ad.color);r(-28,-24,56,7,'#e2e9d2');r(-28,55,56,7,'#dde0c5');r(-20,2,40,25,'#183f40');c.fillStyle='#f7e7af';c.font='bold 16px monospace';c.textAlign='center';c.fillText('4TH',0,20);for(let i=0;i<7;i++){r(-44+i*15,-30-((t*16+i*13)%30),3,3,ad.color);}}
 if(ad.kind==='marker'){c.rotate(-.25+Math.sin(t)*.06);r(-80,-5,125,26,ad.color);r(-95,-5,18,26,'#ecedc9');r(45,-5,28,26,'#d9d6b6');r(73,2,12,12,'#f3ce5d');c.strokeStyle=ad.color;c.lineWidth=4;c.beginPath();c.ellipse(0,47,60,12,0,0,Math.PI*2);c.stroke();}
 if(ad.kind==='pretzel'){c.strokeStyle=ad.color;c.lineWidth=11;c.beginPath();c.moveTo(-39,41);c.bezierCurveTo(-95,-40,25,-53,26,4);c.bezierCurveTo(27,55,-27,54,-27,4);c.bezierCurveTo(-25,-53,95,-40,39,41);c.lineTo(-39,41);c.stroke();for(let i=0;i<9;i++)r(-45+i*11,33+Math.sin(i)*5,2,3,'#fff4d5');}
 if(ad.kind==='bed'){r(-82,20,164,29,ad.color);r(-82,-10,8,80,'#e5d4ad');r(74,15,8,55,'#e5d4ad');r(-67,8,43,16,'#f3edd9');c.fillStyle='#e8dcae';c.font='bold 22px monospace';c.fillText('Z z',3,-10+Math.sin(t)*5);}
 c.restore();
}
