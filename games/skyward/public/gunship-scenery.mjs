// One compact scene description keeps the moonlit compounds and target
// silhouettes consistent across WebGL and Canvas compatibility rendering.
export const GUNSHIP_SITE_COLORS=Object.freeze({pad:'#606b65',road:'#485752',body:'#8d9a87',roof:'#a3aa8f',dark:'#394c48',steel:'#a1b0a6',cargo:'#7e8164',lamp:'#f5d595',pool:'#a6a176',red:'#c87859'});

const roads=[[-410,-600,870,-600],[220,-1120,220,310],[460,-910,460,-600],[10,-140,220,-140],[400,140,220,140],[650,-420,650,-600],[740,-70,740,-600],[-100,-1040,220,-1040],[-260,-420,-260,-600]];
export const GUNSHIP_ROAD_TILES=Object.freeze(roads.flatMap(([ax,az,bx,bz])=>{
  const length=Math.hypot(bx-ax,bz-az),count=Math.ceil(length/48),heading=Math.atan2(bx-ax,bz-az);
  return Array.from({length:count},(_,i)=>Object.freeze({x:ax+(bx-ax)*(i+.5)/count,z:az+(bz-az)*(i+.5)/count,width:18,depth:length/count+.04,heading}));
}));

const targetCache=new Map();
export function gunshipTargetParts(target){
  const relay=String(target.id).includes('relay'),kind=relay?'relay':target.type||'depot';
  if(targetCache.has(kind))return targetCache.get(kind);
  const parts=[],box=(x,y,z,w,h,d,color='body')=>parts.push({kind:'box',position:[x,y,z],size:[w,h,d],color}),
    cylinder=(x,y,z,r,h,color='dark')=>parts.push({kind:'cylinder',position:[x,y,z],radius:r,height:h,color}),
    beam=(from,to,width,color='steel')=>parts.push({kind:'beam',from,to,width,color}),
    lamp=(x,z)=>parts.push({kind:'lamp',position:[x,10,z],radius:22});
  const compound=kind==='depot'||relay,flak=kind==='flak';
  box(0,.25,0,compound?104:flak?55:40,.5,compound?86:flak?55:46,'pad');
  if(compound){
    const offset=relay?-12:0,w=relay?35:52,d=relay?32:44;
    box(offset,9,0,w,18,d);box(offset,18.7,0,w+2,2.4,d+2,'roof');
    for(const z of[-d*.32,0,d*.32])box(offset,20,z,w+1,.6,.5,'steel');
    box(offset,5.5,d*.5+.12,w*.29,11,.35,'dark');
    for(const x of[-w*.32,w*.32])box(offset+x,13,d*.5+.3,5,2.3,.6,'lamp');
    for(let i=0;i<5;i++){box(-40+(i%2)*8,2.5,20-Math.floor(i/2)*9,6,5,7,'cargo');if(i%2===0)box(-40+(i%2)*8,6.3,20-Math.floor(i/2)*9,5.5,2.6,6,'body');}
    if(relay){
      box(27,3,-3,12,6,15,'dark');beam([27,6,-3],[27,29,-3],1.2);beam([20,1,-10],[27,21,-3],.5);beam([34,1,4],[27,21,-3],.5);
      parts.push({kind:'dish',position:[27,30,-3],radius:8,color:'steel'});
      parts.push({kind:'beacon',position:[27,38,-3],radius:1.5,color:'red'});
    }else{
      for(let i=0;i<3;i++){cylinder(38,6,-19+i*15,5,12,'steel');cylinder(38,12.3,-19+i*15,5.1,.8,'roof');}
    }
    for(const x of[-47,47])for(const z of[-37,37])lamp(x,z);
  }else if(kind==='armor'){
    for(const x of[-5.8,5.8])box(x,2.1,0,2.6,4.2,20,'dark');
    box(0,4.8,0,10.4,4.4,18);box(0,8.1,-1,7,3.4,8,'roof');
    beam([0,8.2,1.5],[0,8.7,15],.85,'steel');cylinder(0,10,-2,2,.5,'dark');
    for(const x of[-3.3,3.3])box(x,5.2,9.2,1.7,.85,.4,'lamp');
    lamp(-16,-17);lamp(16,17);
  }else if(flak){
    cylinder(0,1,0,14,2,'cargo');cylinder(0,3,0,5.5,4,'dark');box(0,6,0,7,4,6);
    for(const x of[-2.1,-.75,.75,2.1])beam([x,6.5,1],[x,15,7.5],.42,'steel');
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box(Math.sin(a)*19,1.6,Math.cos(a)*19,7,3.2,4,'cargo');}
    lamp(-20,-20);lamp(20,20);
  }else{
    box(0,2.8,0,9,3.5,22,'dark');box(0,6.1,-4,8.7,5.4,13,'cargo');box(0,6,7.3,9.2,6,6.7);
    box(0,7.5,10.76,7,2.5,.2,'dark');
    for(const side of[-1,1])for(const z of[-8,-2,7.4])box(side*4.75,2.1,z,1.7,4,3.5,'dark');
    for(const side of[-1,1])box(side*3.4,4.1,10.9,1.8,1,.3,'lamp');
    lamp(-16,-18);lamp(16,18);
  }
  targetCache.set(kind,parts);return parts;
}
