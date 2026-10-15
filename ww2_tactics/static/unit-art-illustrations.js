/* Detailed-only presentation data. No rules, state writes or external requests. */
'use strict';
(()=>{
 const atlases={
  infantry:{file:'detailed-infantry-v2.webp',width:1254,height:1254},
  armour:{file:'detailed-armour-v2.webp',width:1448,height:1086},
  air:{file:'detailed-air-v2.webp',width:1448,height:1086},
  naval:{file:'detailed-naval-v2.webp',width:1774,height:887}
 };
 const portraits={};
 function add(atlas,key,box,clip){portraits[key]={key,atlas,box,clip};}
 // Hand-checked source windows. A few stepped edges exclude a neighbouring
 // rifle/antenna without cutting either miniature. Source images stay intact.
 add('infantry','rifle_us',[36,46,326,265],'M36 46H363V175H337V311H36Z');
 add('infantry','rifle_de',[339,50,340,260],'M366 50H679V170H660V310H339V170H366Z');
 add('infantry','leader',[658,47,322,260],'M683 47H980V307H658V170H683Z');
 add('infantry','commander',[987,27,221,286]);
 add('infantry','scout',[36,317,233,269],'M36 317H269V586H77V550H36Z');
 add('infantry','engineer',[333,317,279,267]);
 add('infantry','at_team',[634,319,309,265],'M634 319H943V420H932V584H634Z');
 add('infantry','sniper',[932,332,314,254],'M943 332H1246V586H932V420H943Z');
 add('infantry','radioman',[38,547,226,329],'M38 547H78V600H264V876H38Z');
 add('infantry','mortar',[319,605,305,271]);
 add('infantry','commando',[648,609,292,267]);
 add('infantry','mountain',[955,602,288,269]);
 add('infantry','partisan',[38,914,309,284],'M38 914H347V1080H333V1198H38Z');
 add('infantry','askari',[333,898,342,294],'M348 898H675V1192H333V1090H348Z');
 add('infantry','pathfinder',[645,887,250,319],'M645 887H895V1206H645V1060H681V980H645Z');
 add('infantry','paratrooper',[935,866,298,366]);
 add('armour','sherman',[5,107,347,252]);
 add('armour','tiger',[355,119,406,232],'M355 119H761V200H732V351H355Z');
 add('armour','firefly',[732,124,388,235],'M765 124H1120V208H1092V359H732V200H765Z');
 add('armour','kv1',[1092,109,353,242],'M1092 109H1445V351H1092V208H1122V148H1092Z');
 add('armour','matilda',[5,433,354,220]);
 add('armour','halftrack',[363,412,360,258]);
 add('armour','at_gun',[727,451,407,200]);
 add('armour','mg',[1147,438,288,218]);
 add('armour','supply',[39,752,300,254]);
 add('armour','light_flak',[379,708,318,308]);
 add('armour','heavy_flak',[717,666,398,355]);
 add('armour','spotlight',[1123,711,305,301]);
 add('air','spitfire',[31,56,345,266]);
 add('air','bf109',[388,70,337,265]);
 add('air','wildcat',[727,75,359,284]);
 add('air','zero',[1082,73,351,259]);
 add('air','bomber',[11,377,370,283]);
 add('air','dive_bomber',[379,383,351,278]);
 add('air','torpedo_bomber',[733,382,357,272]);
 add('air','dakota',[1084,375,356,295]);
 add('air','lancaster',[13,708,382,281]);
 add('air','halifax',[384,711,362,269]);
 add('air','mosquito',[732,715,358,288]);
 add('air','bf110',[1090,715,349,283]);
 add('naval','carrier_us',[6,46,471,380],'M6 46H455V240H477V426H6Z');
 add('naval','carrier_jp',[454,80,446,331],'M454 80H900V411H478V240H454Z');
 add('naval','battleship',[888,43,470,382],'M888 43H1325V260H1358V425H888Z');
 add('naval','cruiser',[1325,77,439,324],'M1325 77H1764V401H1358V260H1325Z');
 add('naval','destroyer',[3,509,465,334],'M3 509H451V700H468V843H3Z');
 add('naval','landing_craft',[453,545,434,260],'M453 545H887V805H470V700H453Z');
 add('naval','radar',[949,464,329,379]);
 add('naval','airfield',[1324,470,450,374]);
 function resolve(u,board){
  let key=u.kind,badge=null;
  const faction=u.faction||u.side;
  if(key==='tank')key=portraits[u.variant]?u.variant:faction==='de'?'tiger':faction==='su'?'kv1':'sherman';
  if(key==='squad')key=faction==='de'?'rifle_de':'rifle_us';
  if(key==='amphibious')key=!board?.naval_version||['water','objective'].includes(board.map?.[u.pos[1]]?.[u.pos[0]])?'landing_craft':faction==='de'?'rifle_de':'rifle_us';
  if(key==='carrier')key=faction==='jp'?'carrier_jp':'carrier_us';
  if(key==='fighter')key=({mosquito_fighter:'mosquito',bf110:'bf110'})[u.variant]||({jp:'zero',de:'bf109',gb:'spitfire'})[faction]||'wildcat';
  if(key==='bomber')key=({mosquito_pathfinder:'mosquito',lancaster:'lancaster',halifax:'halifax',dive_bomber:'dive_bomber',torpedo_bomber:'torpedo_bomber'})[u.variant]||'bomber';
  if(key==='transport_aircraft')key='dakota';
  if(key==='aa_gun')key=u.variant==='light_flak'?'light_flak':'heavy_flak';
  if(key==='flak')key='light_flak';
  // Rank and specialist marks remain readable even when two roles share a model.
  if(u.kind==='leader')badge='leader';
  if(u.kind==='commander'){badge='commander';if(faction!=='de')key='leader';}
  if(u.variant==='mosquito_pathfinder')badge='pathfinder';
  if(u.variant==='aa_escort')badge='aa';
  if(u.variant==='torpedo_cruiser')badge='torpedo';
  return portraits[key]?{...portraits[key],badge}:null;
 }
 window.ww2UnitIllustrations=Object.freeze({atlases,portraits,resolve});
})();
