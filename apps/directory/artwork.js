/** Original Daily Flyer cover designs. Fixed vectors; no external assets.
 * The visible card supplies the accessible name. These covers are decorative.
 */
export const ART_PALETTES = Object.freeze({
  'ball-knowledge':{background:'#f7f5ee',foreground:'#17191a',accent:'#db412d'},
  dsl:{background:'#5c6746',foreground:'#f0edd8',accent:'#e58b53'},
  gridiron:{background:'#202631',foreground:'#fff0c8',accent:'#efac32'},
  infierno:{background:'#e8dfc8',foreground:'#26251f',accent:'#ba342e'},
  'further-in':{background:'#c3b351',foreground:'#282919',accent:'#e5d577'},
  breach:{background:'#e45f32',foreground:'#f9ebcc',accent:'#242629'},
  'irish-today':{background:'#eae1c8',foreground:'#233e2d',accent:'#9b6c3f'},
  garage:{background:'#1c56a2',foreground:'#f1ebd7',accent:'#e3b13e'},
  'night-transfer':{background:'#142b2c',foreground:'#dee6d8',accent:'#e5ae58'},
  mypassages:{background:'#f0e8d6',foreground:'#276b60',accent:'#b26745'},
  saltbound:{background:'#163e44',foreground:'#efdfb7',accent:'#d8793d'},
  empires:{background:'#253f32',foreground:'#e3c38d',accent:'#aa5c3e'},
  huddle:{background:'#eae6d2',foreground:'#234b3a',accent:'#c99638'},
  vineyard:{background:'#e9dfc5',foreground:'#593541',accent:'#657443'},
  'roster-radar':{background:'#172a22',foreground:'#d6ed8c',accent:'#77b591'},
  lockstep:{background:'#2b2c27',foreground:'#f1ddb0',accent:'#e8b14a'},
  'next-chapter':{background:'#f0e7d3',foreground:'#37352d',accent:'#c45f3d'},
  'soph-slump':{background:'#dbb23d',foreground:'#252924',accent:'#e9dfc7'},
  'magic-catch-up':{background:'#342945',foreground:'#e7d7ae',accent:'#a98a58'},
  rlcs:{background:'#1f4b9d',foreground:'#f3ebda',accent:'#ef8c3a'},
  skyward:{background:'#b8cbd0',foreground:'#223f4c',accent:'#c86e38'},
  hockey:{background:'#e5e8df',foreground:'#234a7e',accent:'#ce4e39'},
  soccer:{background:'#e6c836',foreground:'#212821',accent:'#69884a'},
  volleyball:{background:'#092f3b',foreground:'#fff7d8',accent:'#ef7156'},
  'sleeve-notes':{background:'#de6d3c',foreground:'#f2e2b8',accent:'#263f63'},
  battlezone:{background:'#111c17',foreground:'#b0df7d',accent:'#d9edac'},
  'when-ants-stare':{background:'#292326',foreground:'#d4ac7f',accent:'#f0d9b8'},
  'last-exit':{background:'#272539',foreground:'#f1e4d2',accent:'#d6859e'},
  afterglow:{background:'#533047',foreground:'#f5c894',accent:'#e68873'},
  'claim-denied':{background:'#d9cfb2',foreground:'#292a23',accent:'#b63d2e'},
  'magic-duel':{background:'#4b2937',foreground:'#e6c18b',accent:'#769893'},
  'relay-fieldguide':{background:'#d9decb',foreground:'#2c493c',accent:'#d86e34'},
  farwake:{background:'#142329',foreground:'#e5e4cd',accent:'#d8874b'},
  dayboard:{background:'#e9e5d9',foreground:'#252c29',accent:'#db7040'},
  baseball:{background:'#e9e2c9',foreground:'#234b3e',accent:'#b84135'},
  'sunday-broadcast':{background:'#172a3d',foreground:'#eee8d5',accent:'#e7b348'},
  'shenanigans-golf':{background:'#e8dfc1',foreground:'#285647',accent:'#d7673e'},
  'corner-pocket':{background:'#183f35',foreground:'#f0dfb7',accent:'#ca8a4d'},
  'low-water':{background:'#172c32',foreground:'#d5d9c9',accent:'#bd694d'},
  skybreak:{background:'#a8cbd4',foreground:'#182f44',accent:'#e76f38'},
  trailmark:{background:'#e9e4cf',foreground:'#2a4b3e',accent:'#ba7937'},
  loudsource:{background:'#e37b43',foreground:'#f4e5c6',accent:'#36273f'},
  gravebloom:{background:'#17221e',foreground:'#e9dec2',accent:'#bd5349'},
  chalk:{background:'#262923',foreground:'#e6dcc3',accent:'#c58c4b'},
  lmw:{background:'#0F2346',foreground:'#ffffff',accent:'#F37721'},
  suncoast:{background:'#214e61',foreground:'#f8e4c8',accent:'#ed8a7a'},
  'first-riff':{background:'#262526',foreground:'#e9e1cc',accent:'#d46c43'},
  'galaxy-granite':{background:'#fbfaf7',foreground:'#151515',accent:'#b79255'},
  'hll-daily':{background:'#e4ddc8',foreground:'#29372d',accent:'#a74e35'},
  'magic-quadratic':{background:'#2e3046',foreground:'#eee4c8',accent:'#a5bb94'},
  birthday:{background:'#f3e6c8',foreground:'#403d37',accent:'#bb643d'},
  'passages-daily':{background:'#082b66',foreground:'#fff2a6',accent:'#00cf9a'},
});
const F={display:"Impact, Haettenschweiler, 'Arial Narrow', sans-serif",sans:'Arial, Helvetica, sans-serif',serif:"Georgia, 'Times New Roman', serif",mono:"'Courier New', Courier, monospace"};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function type(text,x,y,size,color,o={}){
  const {family='display',width,weight=900,spacing=0,italic=false,anchor='start',stroke,strokeWidth=1,opacity=1}=o;
  return `<text x="${x}" y="${y}" font-family="${esc(F[family]||family)}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="${anchor}" fill="${color}" opacity="${opacity}"${width?` textLength="${width}" lengthAdjust="spacingAndGlyphs"`:''}${italic?' font-style="italic"':''}${stroke?` stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke fill"`:''}>${esc(text)}</text>`;
}
const note=(text,x,y,color,o={})=>type(text,x,y,o.size||13,color,{family:'mono',weight:700,spacing:1.4,...o});
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const line=(d,color,width=1,extra='')=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
const paper=(u,opacity=.22)=>rect(0,0,640,420,`url(#${u}-grain)`,`opacity="${opacity}"`);
const dotfield=(u,x,y,w,h,opacity=.18)=>rect(x,y,w,h,`url(#${u}-dots)`,`opacity="${opacity}"`);
const hatch=(u,x,y,w,h,opacity=.2)=>rect(x,y,w,h,`url(#${u}-hatch)`,`opacity="${opacity}"`);
const jet='M0-108 11-63 16-22 89 38 89 48 19 23 13 78 38 96 37 105 0 93-37 105-38 96-13 78-19 23-89 48-89 38-16-22-11-63Z';
const ship='M0-116 19-51 42-15 51 47 21 36 13 90-13 90-21 36-51 47-42-15-19-51Z';

const covers={
  'ball-knowledge':u=>({
    body:`${rect(0,0,640,420,'#f7f5ee')}${rect(24,24,592,372,'none','stroke="#17191a" stroke-width="2"')}
      ${note('EVERY SUBJECT. EVERY SECOND.',43,56,'#17191a',{size:13,spacing:2})}
      ${type('BALL',38,175,135,'#17191a',{width:340})}${type('KNOWLEDGE',38,265,90,'#17191a',{width:555})}
      <circle cx="497" cy="130" r="64" fill="#db412d"/><circle cx="497" cy="130" r="51" fill="none" stroke="#f7f5ee" stroke-width="2" stroke-dasharray="2 9"/>
      ${type('15',497,153,69,'#f7f5ee',{anchor:'middle'})}${line('M43 290H595','#17191a',2)}
      ${rect(43,313,79,13,'#808980')}${rect(134,313,79,13,'#4e805b')}${rect(225,313,79,13,'#396b9f')}${rect(316,313,79,13,'#815392')}${rect(407,313,79,13,'#b67616')}${rect(498,313,96,13,'#db412d')}
      ${note('COMMON TO ONE OF ONE',43,363,'#17191a',{size:15,spacing:2})}${paper(u,.08)}`,
  }),
  dsl:u=>({
    defs:`<pattern id="${u}-hex" width="70" height="60" patternUnits="userSpaceOnUse"><path d="M18 1H52L70 30 52 59H18L0 30Z" fill="none" stroke="#d9d9a9" stroke-width="1"/></pattern>`,
    body:`${rect(0,0,640,420,'#5c6746')}${rect(0,0,640,420,`url(#${u}-hex)`,'opacity=".19"')}${rect(459,0,181,420,'#202e25')}${hatch(u,459,0,181,420,.13)}
      ${note('DOUBLE SECRET',32,41,'#e4e1c7',{size:17,spacing:4})}${type('DSL',22,272,245,'#efe9c9',{width:425})}
      ${rect(30,292,420,3,'#ece5c2')}${type('SQUAD LEADER',31,337,49,'#f0e9c9',{width:418})}${note('WWII HEX TACTICS',33,378,'#d4d9b7',{size:12,spacing:2})}
      ${line('M500 40V135L584 184V273L500 326V392','#df8e54',4,'stroke-dasharray="9 7"')}
      <g fill="#d7d4af" stroke="#1d2b22" stroke-width="3"><rect x="476" y="72" width="49" height="38"/><rect x="560" y="185" width="49" height="38"/><rect x="476" y="326" width="49" height="38"/></g>
      ${line('M484 80 517 102M517 80 484 102M569 193 600 215M600 193 569 215','#33432d',2)}<ellipse cx="500" cy="345" rx="15" ry="8" fill="none" stroke="#33432d" stroke-width="2"/>
      ${line('M32 152H445M28 228H450','#5c6746',4)}${line('M19 20V401H435','#c1c5a0',1,'opacity=".6"')}${paper(u,.26)}`,
  }),
  gridiron:u=>({
    body:`${rect(0,0,640,420,'#202631')}<path d="M0 0H640V51L0 110Z" fill="#efac32"/><path d="M0 114 640 55V82L0 142Z" fill="#cf4939"/>
      ${note('POCKET',32,85,'#202631',{size:31,spacing:5})}${dotfield(u,0,143,640,277,.1)}
      ${type('GRIDIRON',29,251,144,'#cf4939',{width:580,stroke:'#202631',strokeWidth:8})}${type('GRIDIRON',23,240,144,'#fff0c8',{width:580,stroke:'#202631',strokeWidth:3})}
      <path d="M0 319 347 276 640 305V420H0Z" fill="#304835"/>${line('M0 358 347 312 640 342M0 397 347 350 640 380','#b9c89b',2)}${line('M81 420 153 299M224 420 254 287M369 420 355 281M514 420 455 288','#b9c89b',2,'stroke-dasharray="7 11"')}
      <g transform="translate(510 330) rotate(-24)"><path d="M-82 0Q0-69 82 0 0 69-82 0Z" fill="#c7753f" stroke="#fff0c8" stroke-width="4"/>${line('M-43 0H43M-27-12V12M-9-12V12M9-12V12M27-12V12','#fff0c8',4)}</g>
      ${note('NFL + COLLEGE CLASSICS',28,394,'#e4e7c4',{size:12,spacing:1})}${paper(u,.19)}`,
  }),
  infierno:u=>({
    body:`${rect(0,0,640,420,'#e8dfc8')}${rect(0,0,19,420,'#b9372f')}${rect(33,26,574,368,'none','stroke="#282720" stroke-width="1.5"')}${dotfield(u,346,29,260,362,.1)}
      ${note('REPORTS / EVIDENCE / COMMUNITY',49,57,'#4a483b',{size:12,spacing:1.8})}${line('M49 75H592','#282720',2)}
      ${type('INFIERNO',45,176,116,'#27271f',{width:546})}${type('LIBERADO',45,280,116,'#b9372f',{width:546})}
      ${rect(48,298,159,12,'#27271f')}${rect(216,298,84,12,'#27271f')}${rect(310,298,229,12,'#27271f')}
      <g transform="translate(361 321) rotate(-5)"><rect width="226" height="48" fill="none" stroke="#ad3029" stroke-width="3"/>${type('FIELD NOTES',12,34,34,'#ad3029',{width:202})}</g>
      ${line('M49 340H296M49 354H276M49 368H238','#6c6955',2)}${line('M130 0 117 420','#b6aa8b',1,'opacity=".6"')}${paper(u,.35)}`,
  }),
  'further-in':u=>({
    defs:`<pattern id="${u}-wall" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M16 1 23 8 16 15 9 8ZM16 17 23 24 16 31 9 24Z" fill="none" stroke="#615e2e" stroke-opacity=".3"/></pattern>`,
    body:`${rect(0,0,640,420,'#c3b351')}${rect(0,0,640,420,`url(#${u}-wall)`)}
      ${rect(361,44,213,376,'#6b642b')}${rect(379,62,177,358,'#8e8032')}${rect(397,80,141,340,'#554d22')}${rect(414,98,106,322,'#262b1f')}${rect(436,121,61,299,'#101f1d')}
      ${line('M0 420 414 98M640 420 520 98','#716a31',2,'opacity=".6"')}
      ${type('FURTHER',21,166,126,'#27291a',{width:589})}${type('FURTHER',19,162,126,'#e3d078',{width:589,stroke:'#27291a',strokeWidth:2.5})}
      ${type('IN',27,366,216,'#27291a',{width:297})}${type('IN',31,365,216,'none',{width:297,stroke:'#e2cf72',strokeWidth:1})}
      ${rect(21,179,590,6,'#c3b351')}${note('LIMINAL HORROR',32,398,'#34371e',{size:11,spacing:2})}${paper(u,.4)}`,
  }),
  breach:u=>({
    body:`${rect(0,0,640,420,'#242629')}
      <path d="M368-20 640 0V420H142L289 288 208 225 401 139 339 87Z" fill="#e45f32"/><path d="M538 0 413 135 476 180 324 272 408 296 318 420H384L489 279 404 255 555 166 491 124 611 0Z" fill="#f19b53" opacity=".55"/>
      ${hatch(u,373,0,267,420,.19)}${note('FIRST-PERSON ACTION',27,35,'#f5d6ac',{size:13,spacing:3})}
      <g transform="translate(4 4)">${type('BREACH',21,249,174,'#181f20',{width:594,stroke:'#181f20',strokeWidth:12})}</g>
      ${type('BREACH',21,239,174,'#f9ebcc',{width:594})}${line('M22 166 615 152M24 210 613 196','#242629',4)}
      <path d="M0 305 138 270 207 307 123 420H0Z" fill="#121e20"/>${line('M31 336H109M70 299V376','#e45f32',3)}<path d="m50 317 20-18 20 18m-40 42 20 17 20-17" fill="none" stroke="#e45f32" stroke-width="2"/>
      ${type('CO-OP MISSIONS',253,380,35,'#211f20',{width:342})}${paper(u,.28)}`,
  }),
  'irish-today':u=>({
    body:`${rect(0,0,640,420,'#eae1c8')}${rect(16,16,608,388,'none','stroke="#2c4933" stroke-width="2"')}${line('M28 30H612M28 390H612','#9b6c3f',1)}
      ${note('HISTORY · LANGUAGE · PLACE',36,57,'#5f684c',{size:12,spacing:1.5})}${line('M36 76H604','#3e5438',2)}
      ${type('Irish',32,184,117,'#233e2d',{family:'serif',weight:400,italic:true,width:328})}${type('Today',32,302,121,'#233e2d',{family:'serif',weight:700,width:361})}
      <g transform="translate(462 113)" stroke="#3e5438" stroke-width="2" fill="none"><path d="M-51 228-43 38 0-24 42 38 50 228Z" fill="#c5c4a3"/><path d="M-43 38 0-24 42 38Z" fill="#334a32"/><path d="M-43 42H42M-44 67H43M-45 92H44M-46 117H45M-47 142H46M-48 167H47M-49 192H48M-50 217H49"/><path d="M-20 42V67M11 67V92M-22 92V117M10 117V142M-21 142V167M10 167V192M-21 192V217M11 217V228"/><path d="M-14 228V193Q0 168 14 193V228" fill="#334a32"/><path d="M-10 82V104H10V82Q0 63-10 82Z" fill="#334a32"/></g>
      ${line('M385 344H565M394 350H553M407 356H577','#3e5438',2)}${type('A daily Irish edition.',36,362,25,'#656b4b',{family:'serif',weight:400,italic:true,width:281})}${paper(u,.34)}`,
  }),
  garage:u=>({
    defs:`<pattern id="${u}-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#c3d3d2" stroke-opacity=".15"/></pattern>`,
    body:`${rect(0,0,640,420,'#1c56a2')}${rect(0,0,640,420,`url(#${u}-grid)`)}${rect(0,0,25,420,'#e3b13e')}${line('M3 0 25 22M3 35 25 57M3 70 25 92M3 105 25 127M3 140 25 162M3 175 25 197M3 210 25 232M3 245 25 267M3 280 25 302M3 315 25 337M3 350 25 372M3 385 25 407','#173d70',10)}
      ${type('GARAGE',44,118,108,'#f1ebd7',{width:548})}${note('VEHICLES + INSTRUMENTS',48,148,'#c4d9e4',{size:13,spacing:2})}
      <g transform="translate(41 155)" stroke="#e0e6d5" stroke-width="2.5" fill="none" stroke-linejoin="round"><path d="M35 113 51 78 107 66 157 23H315L366 63 454 75 516 105 512 129H35Z"/><path d="M120 65 166 34H235V64ZM251 34H307L349 64H251Z"/><path d="M157 24 157 128M250 24V129M315 25 359 68 363 128M44 108H72M142 108H373M449 108H512"/><circle cx="107" cy="124" r="33" fill="#1c56a2"/><circle cx="107" cy="124" r="20"/><circle cx="415" cy="124" r="33" fill="#1c56a2"/><circle cx="415" cy="124" r="20"/><path d="M107 104V144M87 124H127M415 104V144M395 124H435" stroke-width="1"/></g>
      ${type('JOURNEY',44,390,95,'none',{width:548,stroke:'#f1ebd7',strokeWidth:2})}${paper(u,.2)}`,
  }),
  'night-transfer':u=>({
    body:`${rect(0,0,640,420,'#142b2c')}${rect(33,31,574,358,'none','stroke="#6c8781" stroke-width="1"')}${hatch(u,0,0,121,420,.12)}
      ${rect(456,285,96,135,'#b89051')}${rect(471,298,66,122,'#192e2d')}${line('M480 315H529M480 332H529M480 349H529M490 300V354M510 300V354M528 300V354','#8c9e8b',3)}
      ${type('NIGHT',40,156,135,'#dee6d8',{width:551})}${type('TRANSFER',40,252,106,'#dee6d8',{width:551})}
      ${rect(19,40,13,337,'#080f14')}${rect(603,32,18,361,'#080f14')}${rect(138,14,7,391,'#080f14','opacity=".35"')}${rect(364,18,8,389,'#080f14','opacity=".3"')}
      ${rect(42,273,368,2,'#6c8781')}${note('A PRISON ESCAPE',43,307,'#9ab6aa',{size:14,spacing:2})}
      <g transform="translate(44 333)" fill="#e5ae58"><rect width="4" height="42"/><rect x="9" width="2" height="42"/><rect x="15" width="7" height="42"/><rect x="27" width="3" height="42"/><rect x="36" width="6" height="42"/><rect x="48" width="2" height="42"/><rect x="55" width="4" height="42"/><rect x="66" width="8" height="42"/><rect x="80" width="3" height="42"/><rect x="88" width="5" height="42"/><rect x="99" width="3" height="42"/><rect x="108" width="6" height="42"/></g>${paper(u,.24)}`,
  }),
  mypassages:u=>({
    body:`${rect(0,0,640,420,'#f0e8d6')}${rect(0,0,31,420,'#276b60')}${line('M44 0V420','#b7c6b4',1)}
      <path d="M559-10V87Q559 120 523 120H476Q443 120 443 157V265Q443 298 487 298H527Q559 298 559 331V435" fill="none" stroke="#9bc0b0" stroke-width="30"/>
      <path d="M559-10V87Q559 120 523 120H476Q443 120 443 157V265Q443 298 487 298H527Q559 298 559 331V435" fill="none" stroke="#f0e8d6" stroke-width="24"/>
      ${type('my',67,139,84,'#276b60',{family:'serif',weight:400,italic:true,width:141})}${type('Passages',65,251,103,'#276b60',{family:'serif',weight:400,width:507})}
      ${line('M66 271Q227 263 397 273M69 280Q216 270 333 282','#b26745',2)}${type('Coaching with Tim.',69,334,30,'#547666',{family:'serif',weight:400,italic:true,width:327})}
      ${note('COACHING / CONVERSATION / PRACTICE',70,385,'#668674',{size:10,spacing:.8})}${paper(u,.25)}`,
  }),
  saltbound:u=>({
    defs:`<pattern id="${u}-sea" width="83" height="32" patternUnits="userSpaceOnUse"><path d="M0 16Q20 3 41 16T83 16M0 23Q20 10 41 23T83 23" fill="none" stroke="#bfcbaa" stroke-width="1"/></pattern>`,
    body:`${rect(0,0,640,420,'#163e44')}${rect(0,290,640,130,`url(#${u}-sea)`,'opacity=".35"')}${rect(0,0,640,18,'#d8793d')}
      ${type('SALT',29,174,164,'#efdfb7',{width:361})}${type('BOUND',29,310,150,'#efdfb7',{width:570})}
      <g transform="translate(494 117) scale(.8)" fill="#efdfb7"><path d="M-63 71H77L53 96H-34Z"/><path d="M-1-97V74" stroke="#efdfb7" stroke-width="4"/><path d="M-10-82Q-74-43-72 57H-10Z"/><path d="M7-80Q66-35 59 57H7Z"/><path d="M1-97 42-90 1-76Z" fill="#d8793d"/>${line('M-59 17H-12M-65 37H-12M9 16H45M9 36H54','#163e44',2)}<path d="M-90 104Q-18 120 89 106" fill="none" stroke="#d8793d" stroke-width="3"/></g>
      ${rect(29,327,570,2,'#b1c7ac')}${note('PIRATE EXTRACTION / CO-OP',31,367,'#c7d0b1',{size:13,spacing:1.5})}${paper(u,.3)}`,
  }),
  empires:u=>({
    body:`${rect(0,0,640,420,'#253f32')}${rect(18,18,604,384,'none','stroke="#a38c5a" stroke-width="2"')}${rect(26,26,588,368,'none','stroke="#a38c5a" stroke-width=".75"')}
      ${type('EMPIRES',37,130,103,'#e3c38d',{family:'serif',weight:400,width:566})}${line('M43 149H597','#b69b66',1)}
      <g stroke="#b89e6c" stroke-width="2" fill="#304c39"><path d="M109 357V246H131V221H154V246H178V357ZM462 357V246H486V221H509V246H533V357Z"/><path d="M177 357V210H205V184H233V210H258V357ZM382 357V210H407V184H435V210H463V357Z"/><path d="M255 357V257L320 205 385 257V357Z"/><path d="M294 357V289Q320 249 346 289V357" fill="#172e28"/><path d="M277 257H365M277 271H365M293 227H347M109 303H177M463 303H533M181 265H255M385 265H459"/><path d="M320 205V157"/><path d="M321 159H365L354 172 365 184H321Z" fill="#a35439"/></g>
      ${line('M68 357H574M85 365H556M102 373H538','#9b8c60',1)}${note('TURN-BASED STRATEGY',151,391,'#c8b783',{size:11,spacing:1.8})}${dotfield(u,33,160,574,221,.08)}${paper(u,.19)}`,
  }),
  huddle:u=>({
    body:`${rect(0,0,640,420,'#eae6d2')}${rect(23,23,594,374,'none','stroke="#234b3a" stroke-width="1"')}${note('BACK IN THE',37,54,'#234b3a',{size:17,spacing:4})}
      ${type('HUDDLE',31,190,148,'#234b3a',{width:577})}${rect(34,208,573,155,'#234b3a')}
      <g fill="none" stroke="#e4e4ca" stroke-width="2.5"><circle cx="103" cy="324" r="10"/><circle cx="159" cy="324" r="10"/><circle cx="215" cy="324" r="10"/><circle cx="271" cy="324" r="10"/><circle cx="327" cy="324" r="10"/><circle cx="383" cy="324" r="10"/><path d="M92 283 114 305M114 283 92 305M148 283 170 305M170 283 148 305M204 283 226 305M226 283 204 305M260 283 282 305M282 283 260 305M316 283 338 305M338 283 316 305"/></g>
      ${line('M103 308V239H64M383 307V243L448 226M271 309 312 340H444V268','#d4ae4c',4,'stroke-linecap="round" stroke-linejoin="round"')}${line('m75 231-11 8 11 8m360-16 13-5-3 13m-10 40 9-11 9 11','#d4ae4c',3)}
      ${type('NFL',484,328,77,'#c7d2b2',{width:102})}${note('GAMES / TEAMS / STORIES',39,385,'#466551',{size:12,spacing:2})}${paper(u,.3)}`,
  }),
  vineyard:u=>({
    body:`${rect(0,0,640,420,'#e9dfc5')}${rect(17,17,606,386,'none','stroke="#593541" stroke-width="2"')}${rect(26,26,588,368,'none','stroke="#a79b70" stroke-width=".8"')}
      <g stroke="#657443" stroke-width="2" fill="none"><path d="M57 369Q29 293 83 220T78 79Q67 36 133 34M586 368Q618 303 568 229T562 84Q579 45 513 34"/><path d="M59 330 108 296M62 285 31 245M77 238 131 217M91 187 49 161M88 132 139 99M579 327 530 295M578 281 608 246M570 236 518 209M556 180 599 153M558 127 508 96"/></g>
      <g fill="#7c8553" stroke="#59683e" stroke-width="1.2"><path d="M107 297Q75 266 113 254 132 279 107 297ZM47 267Q15 250 30 220 65 226 47 267ZM123 225Q103 187 143 183 153 213 123 225ZM62 174Q20 166 35 132 73 133 62 174ZM130 114Q107 78 145 73 160 102 130 114ZM532 297Q505 270 532 253 563 268 532 297ZM592 267Q575 235 610 220 630 250 592 267ZM522 222Q495 205 509 174 547 182 522 222ZM588 170Q569 138 604 126 625 158 588 170ZM511 110Q482 93 502 66 537 74 511 110Z"/></g>
      <g fill="#65404b" stroke="#e9dfc5" stroke-width="1"><circle cx="83" cy="89" r="9"/><circle cx="94" cy="99" r="9"/><circle cx="75" cy="104" r="9"/><circle cx="85" cy="115" r="9"/><circle cx="79" cy="128" r="8"/><circle cx="559" cy="90" r="9"/><circle cx="570" cy="102" r="9"/><circle cx="552" cy="105" r="9"/><circle cx="562" cy="118" r="9"/><circle cx="560" cy="131" r="8"/></g>
      ${type('Vineyard',125,207,75,'#593541',{family:'serif',weight:400,italic:true,width:390})}${type('TABLE',177,279,68,'#593541',{family:'serif',weight:400,width:286,spacing:5})}${line('M185 298H454','#9d895f',1)}${note('WORKER PLACEMENT',202,328,'#7b7354',{size:11,spacing:1.5})}${paper(u,.28)}`,
  }),
  'roster-radar':u=>({
    body:`${rect(0,0,640,420,'#172a22')}${rect(0,0,19,420,'#d6ed8c')}${hatch(u,430,0,210,420,.1)}
      ${note('FANTASY FOOTBALL',39,42,'#a2c3a1',{size:13,spacing:2})}${type('ROSTER',34,169,130,'#d6ed8c',{width:562})}${type('RADAR',34,291,139,'#d6ed8c',{width:429})}
      <g transform="translate(527 282)" fill="none" stroke="#7bad80" stroke-width="1.3"><path d="M-87 0H87M0-87V87"/><circle r="75"/><circle r="52"/><circle r="28"/><path d="M0 0 55-51" stroke="#d6ed8c" stroke-width="3"/><path d="M0 0 55-51A75 75 0 0 1 75 0Z" fill="#d6ed8c" stroke="none" opacity=".12"/><path d="M-43 39H-29M-36 32V46M28-26H40M34-32V-20" stroke="#d6ed8c" stroke-width="3"/></g>
      ${rect(39,320,335,2,'#5e8266')}${note('LEAGUES / NEWS / WATCHLISTS',40,356,'#b2ccaa',{size:12,spacing:1})}${line('M39 380H199M213 380H265M279 380H322','#7c9e74',4)}${paper(u,.18)}`,
  }),
  lockstep:u=>({
    body:`${rect(0,0,640,420,'#2b2c27')}${rect(0,0,640,19,'#e8b14a')}${line('M5 0 24 19M46 0 65 19M87 0 106 19M128 0 147 19M169 0 188 19M210 0 229 19M251 0 270 19M292 0 311 19M333 0 352 19M374 0 393 19M415 0 434 19M456 0 475 19M497 0 516 19M538 0 557 19M579 0 598 19M620 0 639 19','#2b2c27',15)}
      ${type('LOCK',29,184,169,'#f1ddb0',{width:426})}${type('STEP',186,325,170,'#e8b14a',{width:425})}
      <g transform="translate(535 136)"><path d="M-41 2V-38Q-41-79 0-79T41-38V2" fill="none" stroke="#e8b14a" stroke-width="12"/><rect x="-54" y="0" width="108" height="83" fill="#e8b14a"/><circle cy="29" r="10" fill="#2b2c27"/><path d="M-5 34-11 57H11L5 34Z" fill="#2b2c27"/></g>
      <path d="M31 212H104V281H155V350H216" fill="none" stroke="#91846a" stroke-width="4"/>${note('A BLACKWELL ESCAPE',32,391,'#c0b18f',{size:13,spacing:2.5})}${paper(u,.34)}`,
  }),
  'next-chapter':u=>({
    body:`${rect(0,0,640,420,'#f0e7d3')}${rect(0,0,31,420,'#c45f3d')}${line('M45 0V420','#bcae8e',1)}
      <path d="M526 0H640V112Z" fill="#dac9aa"/><path d="M526 0 526 112H640" fill="#f9f0dc" stroke="#c3b18f" stroke-width="1"/>
      ${note('A CAREER FIELD JOURNAL',67,57,'#746d57',{size:12,spacing:2})}${type('Next',60,181,120,'#37352d',{family:'serif',weight:400,italic:true,width:343})}${type('Chapter',58,296,114,'#37352d',{family:'serif',weight:400,width:523})}
      ${line('M67 317H571','#c45f3d',3)}${type('Opportunities, notes, follow-ups.',67,359,27,'#746d57',{family:'serif',weight:400,italic:true,width:441})}
      <path d="M465 0V126L488 110 510 126V0Z" fill="#c45f3d"/>${line('M68 390H206M216 390H384M394 390H560','#b5ad90',1)}${paper(u,.33)}`,
  }),
  'soph-slump':u=>({
    body:`${rect(0,0,640,420,'#dbb23d')}${dotfield(u,304,0,336,420,.15)}${rect(24,23,592,374,'none','stroke="#252924" stroke-width="2"')}
      ${type('SOPH(MORE)',41,102,69,'#252924',{width:543})}${type('SLUMP',37,253,151,'#252924',{width:439})}${type('?',445,350,288,'#e9dfc7',{family:'serif',weight:700,width:163})}
      <g fill="none" stroke="#252924" stroke-width="2" opacity=".8"><path d="M44 290V369H436"/><path d="m57 351 57-43 57 18 57-25 57 39 57-8 76 29" stroke-width="4"/><path d="m57 336 57-8 57-29 57 15 57-25 57-11 76 23" stroke-width="3" stroke-dasharray="7 6"/></g>
      ${note('THE SECOND-YEAR QUESTION',45,388,'#252924',{size:10,spacing:1.5})}${paper(u,.38)}`,
  }),
  'magic-catch-up':u=>({
    body:`${rect(0,0,640,420,'#342945')}${rect(22,20,596,380,'none','stroke="#a98a58" stroke-width="1.5"')}${rect(30,28,580,364,'none','stroke="#a98a58" stroke-width=".65"')}
      <path d="M32 95Q320-42 608 95M32 325Q320 462 608 325" fill="none" stroke="#a98a58" stroke-width="1"/>
      ${type('MAGIC',62,169,115,'#e7d7ae',{family:'serif',weight:400,width:516})}${line('M89 192H551','#a98a58',1)}${type('CATCH UP',92,274,81,'#e7d7ae',{family:'serif',weight:400,width:455})}
      <g transform="translate(320 337)" fill="none" stroke="#bd9e65" stroke-width="1.5"><path d="M-90 0-48-15 0-8 48-15 90 0 48 16 0 8-48 16Z"/><path d="M-90 0-48-15V16M0-8V8M48-15V16M-90 5-48 21 0 13 48 21 90 5"/><path d="M0-27 7-14 0-8-7-14Z" fill="#bd9e65"/></g>
      ${note('FORMATS / MILESTONES',196,68,'#aa91b0',{size:11,spacing:2})}<g fill="#bd9e65"><path d="m49 213 4-12 4 12-4 12Zm534 0 4-12 4 12-4 12Z"/></g>${paper(u,.22)}`,
  }),
  rlcs:u=>({
    body:`${rect(0,0,640,420,'#1f4b9d')}<path d="M465 0H640V420H139Z" fill="#ef8c3a"/><path d="M435 0H453L127 420H109ZM483 0H495L170 420H158Z" fill="#e6d5b8" opacity=".5"/>
      ${note('ROCKET LEAGUE ESPORTS',28,39,'#d6e4e4',{size:13,spacing:2})}${type('RLCS',23,226,210,'#153872',{width:584,stroke:'#153872',strokeWidth:9})}${type('RLCS',17,216,210,'#f3ebda',{width:584})}
      ${rect(29,252,445,71,'#183361')}${type('CATCH UP',45,304,56,'#f3ebda',{width:411})}
      <g transform="translate(529 318) rotate(-17)" stroke="#263e65" stroke-width="3"><path d="M-51 19-43-8-15-24H24L43-7 51 19Z" fill="#f3ebda"/><path d="M-13-18H21L31-7H-29Z" fill="#3863a2"/><path d="M-42 18V31M42 18V31" stroke="#263e65" stroke-width="15"/></g>
      ${line('M28 370H375M28 384H319','#bcd6df',3)}${note('ESPORTS HISTORY',397,390,'#273a5b',{size:12,spacing:.8})}${paper(u,.2)}`,
  }),
  skyward:u=>({
    defs:`<pattern id="${u}-grid" width="37" height="37" patternUnits="userSpaceOnUse"><path d="M37 0H0V37" stroke="#3c5c68" stroke-opacity=".13" fill="none"/></pattern>`,
    body:`${rect(0,0,640,420,'#b8cbd0')}${rect(0,0,640,420,`url(#${u}-grid)`)}<path d="M416 0H489L218 420H145Z" fill="#e8dfc4"/><path d="M503 0H522L251 420H232Z" fill="#c86e38"/>
      ${note('FLIGHT / EXPLORATION / COMBAT',28,35,'#3f5d65',{size:12,spacing:1.1})}
      <g transform="translate(420 184) rotate(34) scale(.92)"><path d="${jet}" fill="#223f4c"/>${line('M0-75V77M-9-34 0-50 9-34M-69 35-15 5M69 35 15 5','#93afb7',2)}</g>
      <g transform="translate(128 174) rotate(34)" fill="none" stroke="#274b59" stroke-width="2.5"><path d="M0-54V66M-67-19H67M-57 12H57M-22 47H22M-51-19V12M51-19V12M-20-19V12M20-19V12M-14-58H14"/><path d="M-6-47Q-14-5-6 57H6Q14-5 6-47Z" fill="#b8cbd0"/></g>
      ${type('SKYWARD',24,365,112,'#223f4c',{width:591})}${line('M28 385H611','#3c5c68',2)}${note('CAMPAIGN / FREE FLIGHT',29,405,'#3f5d65',{size:10,spacing:1.4})}${paper(u,.27)}`,
  }),
  hockey:u=>({
    body:`${rect(0,0,640,420,'#e5e8df')}<path d="M0 0H640V23H0Z" fill="#234a7e"/><path d="M0 244 640 161V190L0 273Z" fill="#ce4e39"/><path d="M0 284 640 201V212L0 295Z" fill="#234a7e"/>
      ${note('POCKET',30,69,'#234a7e',{size:27,spacing:5})}${type('HOCKEY',20,199,136,'#234a7e',{width:601})}
      <g transform="translate(470 316) rotate(-16)"><path d="M0-72 43 47 94 57 98 77 26 65-12-67Z" fill="#23364a"/><path d="M0-72-12-67" stroke="#ce4e39" stroke-width="8"/><path d="M33 47 40 66M43 50 50 69M53 51 60 72M63 53 70 73M73 55 80 75" stroke="#e5e8df" stroke-width="2"/></g>
      <ellipse cx="334" cy="346" rx="32" ry="11" fill="#253746"/><path d="M302 338V347Q334 367 366 347V338" fill="#253746"/><path d="M58 342Q169 376 285 347" fill="none" stroke="#98b1bd" stroke-width="2"/><path d="M67 355Q186 391 285 357" fill="none" stroke="#98b1bd" stroke-width="1"/>
      ${note('6 ON 6',30,397,'#234a7e',{size:13,spacing:2})}${dotfield(u,0,287,280,133,.07)}${paper(u,.3)}`,
  }),
  soccer:u=>({
    body:`${rect(0,0,640,420,'#e6c836')}${rect(0,0,640,420,'none','stroke="#212821" stroke-width="22"')}${note('POCKET',31,65,'#212821',{size:30,spacing:6})}
      ${type('SOCCER',22,216,155,'#212821',{width:595})}${rect(22,238,596,160,'#212821')}
      <g transform="translate(28 246)" stroke="#a5b872" stroke-width="1.5" fill="none"><path d="M0 0H360V145H0ZM180 0V145"/><circle cx="180" cy="72" r="31"/><path d="M0 34H55V111H0M360 34H305V111H360"/></g>
      <g transform="translate(502 319)"><circle r="66" fill="#e6dfb9"/><path d="M0-30 29-9 18 26H-18L-29-9Z" fill="#252d24"/><path d="m0-30-6-34 27 3 30 20-22 32M18 26l18 28-29 12-25-40M-29-9l-34-5 14-28 21-16-4 33M-18 26-45 48-17 64 6 50" fill="#252d24"/><circle r="66" fill="none" stroke="#e6c836" stroke-width="3"/></g>
      ${note('CLUB FOOTBALL',39,381,'#d6c75a',{size:12,spacing:2})}${paper(u,.26)}`,
  }),
  'sleeve-notes':u=>({
    body:`${rect(0,0,640,420,'#de6d3c')}${rect(19,18,602,384,'none','stroke="#f2e2b8" stroke-width="1.5"')}${rect(363,18,258,384,'#263f63')}
      <g transform="translate(516 209)"><circle r="146" fill="#232d31"/><g stroke="#c1a887" stroke-opacity=".27" fill="none"><circle r="131"/><circle r="120"/><circle r="109"/><circle r="98"/><circle r="87"/><circle r="76"/><circle r="65"/></g><circle r="48" fill="#de6d3c"/><path d="M-39 0H39" stroke="#f2e2b8" stroke-width="1"/><circle r="6" fill="#232d31"/></g>
      ${type('the',35,85,45,'#f2e2b8',{family:'serif',weight:400,italic:true,width:85})}${type('Sleeve',33,205,114,'#f2e2b8',{family:'serif',weight:700,width:397})}${type('Notes',33,313,111,'#f2e2b8',{family:'serif',weight:700,italic:true,width:373})}
      ${line('M36 335H340','#f2e2b8',1)}${note('ARTISTS / ALBUM CREDITS',38,373,'#f2e2b8',{size:11,spacing:1.5})}${paper(u,.3)}`,
  }),
  battlezone:u=>({
    body:`${rect(0,0,640,420,'#111c17')}${rect(16,16,608,388,'none','stroke="#75ad61" stroke-width="1"')}
      ${type('BATTLE',35,131,112,'none',{family:'mono',weight:700,width:566,stroke:'#b0df7d',strokeWidth:2})}${type('ZONE',34,237,112,'#b0df7d',{family:'mono',weight:700,width:387})}${type('1980',449,233,67,'#d9edac',{family:'mono',weight:400,width:151})}
      <g stroke="#75ad61" fill="none" stroke-width="1.1"><path d="M0 302H640M0 420 173 302M640 420 467 302M111 420 224 302M524 420 415 302M251 420 292 302M387 420 348 302M0 339H640M0 382H640"/></g>
      <g transform="translate(323 324)" fill="#111c17" stroke="#b0df7d" stroke-width="2"><path d="M-86 18-57-33H59L88 18 67 53H-68Z"/><path d="M-86 18H88M-57-33-34 18-45 53M59-33 34 18 46 53"/><path d="M-40-16-27-51H30L45-16Z"/><path d="M-27-51 0-64 30-51M0-64V-37M0-37 18-99 29-96 14-31Z"/></g>
      ${note('VECTOR ARCADE',35,392,'#94c57d',{size:12,spacing:2})}${rect(0,0,640,420,`url(#${u}-scan)`,'opacity=".45"')}`,
  }),
  'when-ants-stare':u=>({
    body:`${rect(0,0,640,420,'#292326')}${rect(21,20,598,380,'none','stroke="#826044" stroke-width="1"')}
      ${type('WHEN',35,115,101,'#d4ac7f',{family:'serif',weight:400,width:349})}${type('ANTS',35,224,112,'#d4ac7f',{family:'serif',weight:400,width:347})}${type('STARE',33,341,115,'#f0d9b8',{family:'serif',weight:400,width:566})}
      <g fill="none" stroke="#977052" stroke-width="1" opacity=".75"><path d="M393 75Q496 12 601 75M397 87Q496 25 597 87M404 99Q496 38 590 99M412 111Q496 51 582 111M421 123Q496 66 572 123M431 135Q496 80 561 135M443 147Q496 96 549 147"/><path d="M393 75Q496 208 601 75M397 87Q496 217 597 87M404 99Q496 228 590 99M412 111Q496 235 582 111M421 123Q496 241 572 123M431 135Q496 246 561 135M443 147Q496 249 549 147"/></g>
      <g transform="translate(499 137)" fill="#d4ac7f" stroke="#d4ac7f" stroke-width="1.3"><ellipse cy="8" rx="6" ry="10"/><ellipse cy="-7" rx="4" ry="6"/><circle cy="-17" r="4"/><path d="M-3-20-8-27M3-20 8-27M-4-9-12-13-17-10M4-9 12-13 17-10M-4-4-13 1-17 5M4-4 13 1 17 5M-4 8-11 17-15 22M4 8 11 17 15 22" fill="none"/></g>
      ${note('WHAT STARES BACK?',38,379,'#9e7b5c',{size:12,spacing:3})}${paper(u,.36)}`,
  }),
  'last-exit':u=>({
    body:`${rect(0,0,640,420,'#272539')}<path d="M428 0H640V420H163Z" fill="#8c4c73"/><path d="M482 0H505L231 420H208Z" fill="#c58096" opacity=".4"/>
      ${type('LAST',27,142,122,'#c58096',{width:348})}${type('LAST',22,135,122,'#f1e4d2',{width:348})}${type('EXIT',22,281,161,'#f1e4d2',{width:397})}
      <g stroke="#d39aab" stroke-width="1" fill="none" opacity=".75"><path d="M427 255V123H461V160H483V71H516V131H538V103H562V165H585V86H614V253"/><path d="M492 86H507M492 100H507M492 114H507M593 101H606M593 116H606"/></g>
      <path d="M244 420 400 263H472L635 420Z" fill="#202536"/>${line('M435 294V310M435 335V361M435 386V420','#e6c286',4)}
      <g transform="translate(438 343)"><path d="M-90 25-81-14-48-42H49L81-14 93 25Z" fill="#465169" stroke="#171e2c" stroke-width="3"/><path d="M-41-34H43L64-14H-62Z" fill="#a2849c"/><path d="M-77 3H-39M40 3H78" stroke="#e5b5a5" stroke-width="5"/><path d="M-76 27V41M77 27V41" stroke="#171e2c" stroke-width="15"/><rect x="-17" y="11" width="34" height="9" fill="#d9c49e"/></g>
      ${note('BOSTON / CAMBRIDGE',28,391,'#c6a8b4',{size:11,spacing:1.3})}${paper(u,.25)}`,
  }),
  afterglow:u=>({
    body:`${rect(0,0,640,420,'#533047')}${rect(19,20,602,380,'none','stroke="#cc826b" stroke-width="1"')}${dotfield(u,0,0,640,420,.12)}
      <g transform="rotate(-5 320 210)">${type('after',32,184,157,'#e68873',{family:'serif',weight:700,italic:true,width:501})}${type('glow',119,310,158,'#f5c894',{family:'serif',weight:700,italic:true,width:493})}</g>
      <path d="M-10 36Q134 85 320 41T650 31M-10 45Q134 94 320 50T650 40M-10 54Q134 103 320 59T650 49" fill="none" stroke="#cc826b" stroke-width="1.5"/>
      ${line('M28 344H611','#cc826b',1)}${note('ARTISTS / SHOWS / VENUES',31,378,'#f5c894',{size:15,spacing:2})}
      <path d="M547 347V400" stroke="#cc826b" stroke-width="2" stroke-dasharray="3 5"/>${type('LIVE',565,381,25,'#f5c894',{family:'sans',weight:700,width:41})}${paper(u,.25)}`,
  }),
  'claim-denied':u=>({
    body:`${rect(0,0,640,420,'#242721')}<path d="M19 12 96 18 160 8 214 16 302 11 373 19 439 9 504 18 617 12 607 70 623 129 611 194 621 248 610 319 619 406 558 398 481 412 412 400 348 408 280 400 211 411 140 398 78 408 20 400 29 328 17 266 28 203 16 129 26 67Z" fill="#d9cfb2"/>
      ${line('M45 55H593M45 73H593M45 345H593M45 365H593M45 385H593','#8b8569',1)}${note('CO-OP ZOMBIE SURVIVAL',45,46,'#595d48',{size:12,spacing:2})}
      <g transform="rotate(-6 320 210)">${type('CLAIM',40,196,139,'#b63d2e',{width:544})}${type('DENIED',38,308,128,'#b63d2e',{width:563})}${rect(32,83,577,242,'none','stroke="#b63d2e" stroke-width="6"')}</g>
      ${line('M117 0 104 420M490 0 507 420','#80795e',1,'opacity=".3"')}
      <g transform="translate(522 368)" fill="#343a2e"><path d="M-32 19V-18L0-43 32-18V19Z"/><path d="M-42-17 0-52 42-17-6-24 0-29-25-3Z"/><path d="M-11 19V-6H10V19" fill="#d9cfb2"/></g>${paper(u,.45)}`,
  }),
  'magic-duel':u=>({
    body:`${rect(0,0,640,420,'#4b2937')}<path d="M320 0H640V420H320Z" fill="#294445"/>${rect(19,19,602,382,'none','stroke="#bb9a67" stroke-width="1.5"')}
      ${type('MAGIC',106,104,88,'#e6c18b',{family:'serif',weight:400,width:429})}
      <g transform="translate(111 122) rotate(-11 76 94)"><rect width="151" height="181" fill="#803b43" stroke="#e6c18b" stroke-width="2"/><rect x="10" y="10" width="131" height="161" fill="none" stroke="#bb9a67" stroke-width="1"/><path d="M75 35Q29 82 52 113T102 129Q129 108 95 59 100 95 76 84 93 59 75 35Z" fill="#d7a36b"/></g>
      <g transform="translate(379 122) rotate(11 76 94)"><rect width="151" height="181" fill="#3d6664" stroke="#e6c18b" stroke-width="2"/><rect x="10" y="10" width="131" height="161" fill="none" stroke="#bb9a67" stroke-width="1"/><path d="M75 35 108 79 94 131H57L42 79Z" fill="none" stroke="#b6c9af" stroke-width="5"/><path d="M75 35V131M42 79H108M57 131 75 79 94 131" stroke="#b6c9af" stroke-width="2" fill="none"/></g>
      <path d="m320 153 12 30 25 15-25 15-12 30-12-30-25-15 25-15Z" fill="#e6c18b"/>
      ${type('DUEL',167,377,91,'#e6c18b',{family:'serif',weight:700,width:307})}${paper(u,.22)}`,
  }),
  'relay-fieldguide':u=>({
    defs:`<pattern id="${u}-contours" width="218" height="154" patternUnits="userSpaceOnUse"><path d="M-20 71Q38-18 109 40T238 29M-20 83Q38-6 109 52T238 41M-20 95Q38 6 109 64T238 53M-20 107Q38 18 109 76T238 65M-20 119Q38 30 109 88T238 77" fill="none" stroke="#71856b" stroke-width="1"/></pattern>`,
    body:`${rect(0,0,640,420,'#d9decb')}${rect(0,0,640,420,`url(#${u}-contours)`,'opacity=".28"')}${rect(0,0,34,420,'#d86e34')}${note('CREW COPY',55,43,'#2c493c',{size:12,spacing:3})}
      ${type('RELAY',49,200,163,'#2c493c',{width:546})}${rect(51,220,545,68,'#2c493c')}${type('FIELDGUIDE',63,267,48,'#d9decb',{width:519})}
      <path d="M60 367 137 332 196 350 280 315 365 348 436 328 531 365 593 328" fill="none" stroke="#d86e34" stroke-width="5" stroke-dasharray="8 6"/>
      <g fill="#d9decb" stroke="#2c493c" stroke-width="3"><rect x="129" y="324" width="16" height="16"/><rect x="272" y="307" width="16" height="16"/><rect x="428" y="320" width="16" height="16"/><rect x="585" y="320" width="16" height="16"/></g>${note('RACE-DAY CREW GUIDE',55,397,'#2c493c',{size:12,spacing:3})}${paper(u,.25)}`,
  }),
  farwake:u=>({
    body:`${rect(0,0,640,420,'#142329')}${rect(17,17,606,386,'none','stroke="#71877d" stroke-width="1"')}
      <g stroke="#789084" stroke-width="1" opacity=".55" fill="none"><path d="M0 0 320 163 640 0M0 420 320 163 640 420M0 86 320 163 640 86M0 304 320 163 640 304M115 0 320 163 525 0M93 420 320 163 547 420M234 0 320 163 406 0M238 420 320 163 403 420"/></g>
      <path d="M273 96H367L417 163 367 230H273L223 163Z" fill="#142329" stroke="#d8874b" stroke-width="15"/><path d="M284 113H356L394 163 356 213H284L246 163Z" fill="none" stroke="#e5e4cd" stroke-width="2"/>
      <g transform="translate(320 191) scale(.77)"><path d="${ship}" fill="#e5e4cd" stroke="#263d43" stroke-width="2"/><path d="M0-85 10-46 6-16H-6L-10-46Z" fill="#385d66"/><path d="M-18 20-30 49-25 66M18 20 30 49 25 66M0 6V89" fill="none" stroke="#789185" stroke-width="3"/><path d="M-9 89 0 149 9 89" fill="#d8874b"/></g>
      ${rect(18,301,604,102,'#142329')}${type('FARWAKE',26,374,105,'#e5e4cd',{width:589,spacing:2})}${note('SPACE EXPLORATION',28,45,'#bdc7af',{size:13,spacing:3})}${line('M507 38H594M572 29 594 38 572 47','#d8874b',2)}
      <g fill="#d1d6be"><path d="M81 115H91M86 110V120M541 243H551M546 238V248M165 211H173M169 207V215" stroke="#d1d6be" stroke-width="1"/><circle cx="505" cy="107" r="1.8"/><circle cx="192" cy="70" r="1.4"/><circle cx="66" cy="275" r="1.5"/></g>${paper(u,.18)}`,
  }),
  baseball:u=>({
    body:`${rect(0,0,640,420,'#e9e2c9')}${rect(0,0,640,22,'#b84135')}${note('POCKET',30,67,'#234b3e',{size:26,spacing:5})}
      ${type('BASEBALL',24,174,110,'#234b3e',{width:589})}${rect(0,200,640,220,'#234b3e')}
      <path d="M92 420 314 221 538 420Z" fill="#56704b"/><path d="m314 260 115 103-115 104-115-104Z" fill="#bf8a5c"/><path d="m314 290 81 73-81 73-81-73Z" fill="#56704b"/>
      ${line('M314 420 124 247M314 420 504 247','#e9e2c9',2)}<g fill="#f0e7cc"><path d="m309 286 6-6 6 6-6 6ZM389 357l6 6-6 6-6-6ZM233 357l6 6-6 6-6-6Z"/></g>
      <g transform="translate(535 269)"><circle r="44" fill="#eee7d4"/>${line('M-26-35Q4 0-26 35M26-35Q-4 0 26 35','#b84135',3)}${line('M-27-25-17-29M-20-12-10-14M-18 2-8 3M-21 16-11 19M-28 28-18 33M27-25 17-29M20-12 10-14M18 2 8 3M21 16 11 19M28 28 18 33','#b84135',2)}</g>
      ${note('SOLO / PRIVATE 1v1',27,392,'#e9e2c9',{size:12,spacing:1.5})}${paper(u,.28)}`,
  }),
  'sunday-broadcast':u=>({
    body:`${rect(0,0,640,420,'#172a3d')}${rect(24,24,592,372,'none','stroke="#637583" stroke-width="1"')}${rect(24,24,592,37,'#e7b348')}
      ${note('3D FOOTBALL',40,49,'#172a3d',{size:15,spacing:3})}${type('SUNDAY',33,194,126,'#eee8d5',{width:570})}${type('BROADCAST',37,257,67,'#e7b348',{width:563})}
      <path d="M123 284H519L640 420H0Z" fill="#355243"/>${line('M96 313H546M55 350H585M5 394H635','#c4cbb3',2)}${line('M202 284 146 420M320 284V420M439 284 495 420','#c4cbb3',2,'stroke-dasharray="5 8"')}
      <g fill="#e7b348" stroke="#172a3d" stroke-width="3"><circle cx="284" cy="348" r="10"/><circle cx="320" cy="348" r="10"/><circle cx="356" cy="348" r="10"/></g><g fill="#eee8d5" stroke="#172a3d" stroke-width="3"><circle cx="284" cy="319" r="9"/><circle cx="320" cy="319" r="9"/><circle cx="356" cy="319" r="9"/></g>
      ${line('M320 371 381 387 440 361','#e7b348',3)}${line('M424 361H440V377','#e7b348',3)}${note('SOLO + ONLINE 1v1',40,388,'#eee8d5',{size:11,spacing:1})}${paper(u,.18)}`,
  }),
  'shenanigans-golf':u=>({
    body:`${rect(0,0,640,420,'#e8dfc1')}${note('18 HOLES. IT ESCALATES.',30,42,'#285647',{size:14,spacing:2})}
      ${type('SHENANIGANS',25,130,76,'#285647',{width:589})}${type('GOLF',29,257,139,'#285647',{width:323})}
      <path d="M0 383Q77 256 184 326T371 330Q442 309 407 250T438 172Q526 153 530 256T640 296V420H0Z" fill="#71936a" stroke="#285647" stroke-width="4"/>
      <path d="M36 397Q106 297 182 359T361 362Q483 337 444 258T449 205Q491 188 495 261T638 334" fill="none" stroke="#e8dfc1" stroke-width="3" stroke-dasharray="9 9"/>
      <path d="M573 307V218" stroke="#285647" stroke-width="4"/><path d="M573 218 622 232 573 247Z" fill="#d7673e"/><ellipse cx="573" cy="309" rx="18" ry="6" fill="#285647"/><circle cx="99" cy="350" r="12" fill="#faf1d9" stroke="#285647" stroke-width="2"/>
      ${rect(28,278,240,30,'#d7673e')}${note('1–4 PLAYERS + CPU',40,299,'#fff0ce',{size:13,spacing:1})}${paper(u,.28)}`,
  }),
  'corner-pocket':u=>({
    body:`${rect(0,0,640,420,'#183f35')}${rect(18,18,604,384,'none','stroke="#ca8a4d" stroke-width="3"')}
      ${type('CORNER',29,130,108,'#f0dfb7',{width:578})}${type('POCKET',29,237,108,'#f0dfb7',{width:578})}
      ${line('M38 257H602','#ca8a4d',2)}<path d="M51 420 352 278" stroke="#ca8a4d" stroke-width="10"/><path d="m334 287 18-9" stroke="#e1e9d8" stroke-width="10"/>
      <circle cx="400" cy="304" r="24" fill="#f0dfb7"/><circle cx="493" cy="337" r="37" fill="#101c1b" stroke="#8eaa8c" stroke-width="2"/><circle cx="493" cy="333" r="17" fill="#f0dfb7"/>${type('8',493,344,29,'#172723',{family:'sans',weight:700,anchor:'middle'})}
      <circle cx="567" cy="280" r="24" fill="#c3573f"/><circle cx="567" cy="280" r="11" fill="#f0dfb7"/>${note('EIGHT-BALL / TWO PLAYERS',37,386,'#f0dfb7',{size:11,spacing:1.5})}${paper(u,.23)}`,
  }),
  'low-water':u=>({
    body:`${rect(0,0,640,420,'#172c32')}${rect(20,20,600,380,'none','stroke="#657a7a" stroke-width="1"')}
      ${line('M85 0V99H555V420M108 0V77H578V420','#627977',6)}<circle cx="555" cy="112" r="26" fill="#172c32" stroke="#bd694d" stroke-width="6"/>${line('M538 95 572 129M538 129 572 95','#bd694d',4)}
      ${type('LOW',30,218,150,'#d5d9c9',{width:374})}${type('WATER',30,330,119,'#d5d9c9',{width:570})}
      <path d="M0 308Q67 296 135 309T270 308T405 310T540 308T675 309V420H0Z" fill="#42716f" opacity=".65"/>${line('M0 309Q67 297 135 310T270 309T405 311T540 309T675 310','#829e8e',2)}
      ${rect(30,348,295,34,'#bd694d')}${note('FIVE CHAPTERS / SOLO',43,371,'#152c32',{size:13,spacing:1.2})}${note('KEEP THE POWER ON',31,50,'#a8bcb1',{size:12,spacing:2})}${paper(u,.3)}`,
  }),
  skybreak:u=>({
    body:`${rect(0,0,640,420,'#a8cbd4')}${note('10-PLAYER BATTLE ROYALE',30,41,'#182f44',{size:13,spacing:2})}
      ${type('SKYBREAK',23,153,118,'#182f44',{width:594})}${line('M29 170H610','#182f44',2)}
      <ellipse cx="443" cy="298" rx="175" ry="91" fill="none" stroke="#f4e5c6" stroke-width="3" stroke-dasharray="9 9"/>
      <path d="M0 355 72 324 129 337 196 283 258 310 309 280 385 322 447 292 530 323 593 305 640 327V420H0Z" fill="#405d5d"/>
      <path d="M0 367 72 336 129 349 196 295 258 322 309 292 385 334 447 304 530 335 593 317 640 339V420H0Z" fill="#182f44"/>
      <path d="M184 288V249H229V307M241 309V267H281V296" fill="#d9d5b7" stroke="#182f44" stroke-width="3"/>
      ${line('M190 256 222 280M222 256 190 280M248 274 274 291','#8c917b',2)}
      <path d="M415 202Q470 161 525 202L470 190Z" fill="#e76f38" stroke="#182f44" stroke-width="3"/>
      ${line('M417 202 466 242M523 202 474 242M470 190V240','#f4e5c6',2)}
      <circle cx="470" cy="243" r="6" fill="#182f44"/>${line('M470 249V265M470 253 459 246M470 253 481 246M470 265 462 278M470 265 480 277','#182f44',4)}
      ${rect(0,379,640,41,'#182f44')}${note('LOOT / BUILD / OUTLAST',30,406,'#f4e5c6',{size:12,spacing:2})}${paper(u,.17)}`,
  }),
  trailmark:u=>({
    body:`${rect(0,0,640,420,'#e9e4cf')}${rect(19,19,602,382,'none','stroke="#2a4b3e" stroke-width="1.5"')}
      ${note('FOUR PONDS / BOURNE',31,49,'#2a4b3e',{size:13,spacing:2})}${type('TRAILMARK',27,143,98,'#2a4b3e',{width:584})}${line('M30 161H610','#2a4b3e',2)}
      <g fill="none" stroke="#6c8060" stroke-width="1" opacity=".35"><path d="M20 218Q83 154 147 208T277 207 414 184 620 226M20 235Q83 171 147 225T277 224 414 201 620 243M20 252Q83 188 147 242T277 241 414 218 620 260M20 313Q122 266 204 321T389 306 620 340M20 330Q122 283 204 338T389 323 620 357M20 347Q122 300 204 355T389 340 620 374"/></g>
      <g fill="#a9c6ba" stroke="#718f80" stroke-width="1.5"><path d="M79 212Q119 194 131 222T112 271Q84 290 68 265T79 212Z"/><path d="M223 257Q247 248 260 276T237 306Q202 301 208 280T223 257Z"/><path d="M381 203Q415 178 438 205T423 249Q392 260 373 239T381 203Z"/><path d="M495 317Q517 286 546 307T554 351Q531 369 502 354T495 317Z"/></g>
      <path d="M64 353 154 314 174 235 285 218 315 291 377 348 459 279 523 230" fill="none" stroke="#ba7937" stroke-width="5" stroke-linejoin="round" stroke-dasharray="10 7"/>
      <g fill="#e9e4cf" stroke="#2a4b3e" stroke-width="3"><circle cx="64" cy="353" r="7"/><circle cx="174" cy="235" r="7"/><circle cx="315" cy="291" r="7"/><circle cx="459" cy="279" r="7"/></g>
      <path d="m523 218 9 20-9-4-9 4Z" fill="#2a4b3e"/><path d="M576 192V241M567 207 576 192 585 207" fill="none" stroke="#2a4b3e" stroke-width="2"/>${note('N',571,185,'#2a4b3e',{size:10,spacing:0})}
      ${rect(29,374,582,26,'#e9e4cf')}${note('MAP / CHECKPOINTS / FIELD NOTES',31,392,'#2a4b3e',{size:11,spacing:1.3})}${paper(u,.25)}`,
  }),
  loudsource:u=>({
    body:`${rect(0,0,640,420,'#e37b43')}${rect(19,19,602,382,'none','stroke="#36273f" stroke-width="2"')}
      ${note('SONGS / VOTES / TRIVIA',31,49,'#36273f',{size:13,spacing:2})}${type('LOUDSOURCE',27,145,91,'#36273f',{width:584})}${line('M30 166H610','#36273f',2)}
      <g transform="translate(182 282)"><circle r="96" fill="#36273f"/><g fill="none" stroke="#f4e5c6" stroke-opacity=".28" stroke-width="1"><circle r="82"/><circle r="73"/><circle r="64"/><circle r="55"/></g><circle r="36" fill="#f4e5c6"/><path d="M-30 0H30" stroke="#e37b43" stroke-width="2"/><circle r="6" fill="#36273f"/></g>
      <g fill="#f4e5c6" stroke="#36273f" stroke-width="2"><rect x="320" y="199" width="271" height="49"/><rect x="320" y="261" width="271" height="49"/><rect x="320" y="323" width="271" height="49"/></g>
      ${line('M337 217H482M337 229H429M337 279H464M337 291H410M337 341H478M337 353H443','#36273f',3)}
      <g fill="#36273f"><path d="m548 209 12 13h-8v16h-8v-16h-8ZM548 271l12 13h-8v16h-8v-16h-8ZM548 333l12 13h-8v16h-8v-16h-8Z"/></g>
      ${note('YOUR PARTY. YOUR QUEUE.',32,392,'#36273f',{size:11,spacing:1.5})}${paper(u,.22)}`,
  }),
  gravebloom:u=>({
    body:`${rect(0,0,640,420,'#17221e')}${rect(18,18,604,384,'none','stroke="#71816a" stroke-width="1"')}
      ${note('BOSSES / LOOT / CORRUPTION',32,45,'#b4b998',{size:12,spacing:2})}
      ${type('GRAVEBLOOM',29,124,77,'#e9dec2',{family:'serif',width:580,weight:700})}${line('M30 143H610','#71816a',1.5)}
      <path d="M206 350V260Q206 199 320 159 434 199 434 260V350" fill="#0d1513" stroke="#71816a" stroke-width="8"/>
      <path d="M226 350V260Q226 213 320 179 414 213 414 260V350M245 350V264Q245 230 320 200 395 230 395 264V350" fill="none" stroke="#364b3c" stroke-width="3"/>
      ${line('M320 159V179M256 190 268 206M384 190 372 206M206 259H226M414 259H434M206 310H226M414 310H434','#b4b998',2)}
      <path d="M320 297C305 281 279 265 281 244 283 224 309 222 320 241 331 222 357 224 359 244 361 265 335 281 320 297Z" fill="#bd5349" stroke="#e9dec2" stroke-width="2"/>
      ${line('M320 286V325L291 347 277 362M320 314 349 337 370 350M320 325 324 352 313 365M291 347 263 344 248 353M349 337 374 329 389 337','#bd5349',4)}
      ${line('M306 236 296 216 284 210M331 235 337 216 350 208M298 256 315 262 325 251 343 255','#e9dec2',2)}
      <g transform="translate(111 248)" stroke="#b4b998" fill="none" stroke-width="3"><path d="M0-61 8-44 6 25H-6L-8-44ZM-23 29H23M0 30V62M-8 62H8"/><path d="M0-47V20" stroke="#71816a" stroke-width="1"/></g>
      <g transform="translate(516 249)" stroke="#b4b998" fill="none" stroke-width="3"><path d="M-7-57Q44 0-7 57M-7-57 13 0-7 57M-32 0H40M30-9 40 0 30 9"/></g>
      ${line('M46 335H175M465 335H594','#71816a',1)}${note('CLAIM',111,357,'#b4b998',{size:11,spacing:2,anchor:'middle'})}${note('OR CLEANSE',523,357,'#b4b998',{size:11,spacing:1.4,anchor:'middle'})}
      ${rect(19,377,602,25,'#bd5349')}${note('WARRIOR / ARCHER / WIZARD',32,394,'#f3e9cf',{size:10,spacing:1})}${note('1–4 PLAYER CO-OP',608,394,'#f3e9cf',{size:10,spacing:.8,anchor:'end'})}${paper(u,.24)}`,
  }),
  volleyball:u=>({
    body:`${rect(0,0,640,420,'#092f3b')}${note('POCKET',31,47,'#f8dc75',{size:25,spacing:5})}${note('BEACH DOUBLES',607,42,'#8edce1',{size:11,spacing:1.5,anchor:'end'})}
      ${type('VOLLEYBALL',25,151,96,'#fff7d8',{width:590})}${rect(0,177,640,243,'#efce91')}
      <path d="M610 177Q572 241 607 296T602 420H640V177Z" fill="#78bfc0"/>${line('M603 177Q565 241 600 296T595 420','#fff7d8',3,'opacity=".75"')}
      <path d="M63 225H518L563 367H18Z" fill="#e5bd7b" stroke="#fff7d8" stroke-width="4"/>
      ${line('M290 223V369','#906b4933',12)}${line('M288 214V358','#092f3b',5)}${line('M291 214V358','#fff7d8',3,'stroke-dasharray="3 5"')}
      ${line('M282 212H299M282 359H299','#092f3b',4)}${line('M276 214V358M299 214V358','#092f3b',1,'opacity=".35"')}
      <g fill="#155365" stroke="#fff7d8" stroke-width="2.5"><ellipse cx="138" cy="272" rx="20" ry="11"/><ellipse cx="204" cy="332" rx="20" ry="11"/></g>
      <g fill="#168fab" stroke="#092f3b" stroke-width="2"><circle cx="138" cy="265" r="12"/><circle cx="204" cy="325" r="12"/></g>
      <g fill="#862f32" stroke="#fff7d8" stroke-width="2.5"><ellipse cx="400" cy="273" rx="20" ry="11"/><ellipse cx="466" cy="333" rx="20" ry="11"/></g>
      <g fill="#ef7156" stroke="#092f3b" stroke-width="2"><circle cx="400" cy="266" r="12"/><circle cx="466" cy="326" r="12"/></g>
      ${line('M209 303Q306 161 411 222','#092f3b',2,'stroke-dasharray="6 6"')}
      <ellipse cx="430" cy="267" rx="16" ry="6" fill="#906b4944"/><circle cx="430" cy="222" r="20" fill="#fff7d8" stroke="#092f3b" stroke-width="2"/>
      ${line('M413 212Q432 218 439 240M421 204Q422 220 412 230','#ef7156',4)}${line('M432 203Q432 215 449 221','#168fab',4)}
      ${note('SOLO / LOCAL / ONLINE',29,402,'#092f3b',{size:12,spacing:2})}${note('2v2',571,402,'#092f3b',{size:16,spacing:1,anchor:'end'})}${paper(u,.15)}`,
  }),
  chalk:u=>({
    body:`${rect(0,0,640,420,'#262923')}${rect(19,19,602,382,'none','stroke="#786e58" stroke-width="1"')}
      ${note('MOGADISHU / 1993',31,46,'#b6aa8e',{size:13,spacing:2})}${note('SQUAD ACTION',609,46,'#c58c4b',{size:12,spacing:1.2,anchor:'end'})}
      ${type('CHALK',24,198,168,'#e6dcc3',{width:584})}${line('M28 101H614M27 161H613','#262923',3)}${line('M30 215H610','#786e58',1.5)}
      <g fill="#685f4a" stroke="#887b60" stroke-width="1"><path d="M24 236H126V287H94V328H24Z"/><path d="M147 236H246V304H147Z"/><path d="M24 346H147V377H24Z"/><path d="M170 325H245V377H170Z"/><path d="M425 236H505V295H455V319H425Z"/><path d="M528 236H616V334H528Z"/><path d="M455 341H616V377H455Z"/></g>
      <g fill="#34372e"><rect x="39" y="247" width="54" height="22"/><rect x="158" y="247" width="73" height="44"/><rect x="542" y="250" width="60" height="68"/><circle cx="64" cy="304" r="10"/><circle cx="474" cy="261" r="11"/></g>
      ${line('M279 246 279 300 375 300 375 371','#c58c4b',2,'stroke-dasharray="7 7"')}
      <g transform="translate(355 274) rotate(-26)"><path d="M-18-28Q0-44 18-28L16 25 5 35 5 73H-5V35L-16 25Z" fill="#171c19" stroke="#b6aa8e" stroke-width="2"/><path d="M-13-20H13V-8H-13Z" fill="#6f8b85"/>${line('M-63 0H63M0-57V57','#b6aa8e',3)}${line('M-20 65H20','#b6aa8e',3)}</g>
      <g fill="#89a69a" stroke="#19231e" stroke-width="2"><circle cx="281" cy="344" r="7"/><circle cx="301" cy="355" r="7"/><circle cx="281" cy="368" r="7"/><circle cx="322" cy="366" r="7"/></g>
      ${rect(20,382,600,18,'#c58c4b')}${note('LEAD THE SQUAD / FOLLOW THE LEADER',31,395,'#262923',{size:10,spacing:1.1})}${paper(u,.3)}`,
  }),
  lmw:u=>({
    body:`${rect(0,0,640,420,'#0F2346')}${rect(0,0,15,420,'#F37721')}${rect(32,25,580,370,'none','stroke="#63728c" stroke-width="1"')}
      ${note('KEEP THE CONNECTION GOING',50,57,'#ffffff',{size:13,spacing:2})}${type('LMW',42,216,175,'#ffffff',{width:536,family:'sans',weight:800})}
      ${type('CONNECTIONS',48,272,52,'#F37721',{width:540,family:'sans',weight:700})}${line('M50 293H594','#63728c',1)}
      ${line('M109 343H321M321 343H535','#F37721',3)}
      <g fill="#0F2346" stroke="#F37721" stroke-width="2"><rect x="64" y="318" width="90" height="50" rx="3"/><rect x="276" y="318" width="90" height="50" rx="3"/><rect x="490" y="318" width="90" height="50" rx="3"/></g>
      <g fill="#ffffff"><circle cx="88" cy="337" r="6"/><circle cx="300" cy="337" r="6"/><circle cx="514" cy="337" r="6"/></g>
      ${line('M79 354Q88 340 97 354M291 354Q300 340 309 354M505 354Q514 340 523 354','#ffffff',2)}${line('M106 336H139M106 348H131M318 336H351M318 348H343M532 336H565M532 348H557','#8e9db4',2)}
      ${note('MEET / VOLUNTEER / STAY INVOLVED',50,390,'#ffffff',{size:10,spacing:1.6})}`,
  }),
  suncoast:u=>({
    body:`${rect(0,0,640,420,'#214e61')}${rect(0,0,640,204,'#ed8a7a')}<circle cx="504" cy="145" r="97" fill="#f8d898"/>
      ${note('THREE ISLANDS. YOUR WAY THROUGH.',29,42,'#253e4a',{size:12,spacing:1.2})}${type('SUNCOAST',24,151,119,'#f8e4c8',{width:590,stroke:'#253e4a',strokeWidth:2})}
      <path d="M0 241H45V187H69V166H99V219H131V190H177V217H211V163H234V147H252V199H289V178H325V237H363V200H399V175H424V248H0Z" fill="#253e4a"/>
      ${line('M54 196H84M54 207H84M145 200H165M221 175H243M221 188H243M298 190H315M372 214H389','#ed8a7a',3)}
      <path d="M0 289 184 271 265 292 366 267 443 284 640 258V420H0Z" fill="#648f7c"/>
      <path d="M0 353 153 310 297 335 435 307 640 338" fill="none" stroke="#f8e4c8" stroke-width="35"/><path d="M0 353 153 310 297 335 435 307 640 338" fill="none" stroke="#253e4a" stroke-width="26"/>${line('M0 353 153 310 297 335 435 307 640 338','#f8e4c8',2,'stroke-dasharray="18 17"')}
      <g transform="translate(408 312) rotate(-11)"><rect x="-24" y="-11" width="48" height="22" rx="5" fill="#ed8a7a" stroke="#253e4a" stroke-width="2"/><path d="M-9-8H11V8H-9Z" fill="#f8e4c8"/><path d="M-5-8V8" stroke="#253e4a" stroke-width="2"/></g>
      <path d="M548 295Q541 244 551 207M551 209Q521 179 501 202M551 209Q577 178 605 202M551 209Q517 208 504 233M551 209Q580 204 599 229M551 209Q546 179 565 169" fill="none" stroke="#253e4a" stroke-width="7" stroke-linecap="round"/>
      ${rect(0,381,640,39,'#253e4a')}${note('A CITY OF CHOICES',29,406,'#f8e4c8',{size:13,spacing:3})}${paper(u,.15)}`,
  }),
  'first-riff':u=>({
    body:`${rect(0,0,640,420,'#262526')}${rect(20,20,600,380,'none','stroke="#776d60" stroke-width="1.5"')}${hatch(u,21,21,598,378,.08)}
      ${note('FROM REHEARSAL TO THE STAGE',34,51,'#d46c43',{size:12,spacing:2})}${type('FIRST RIFF',27,168,119,'#e9e1cc',{width:583})}${line('M31 190H607','#d46c43',3)}
      <g transform="translate(180 281) rotate(-24)"><path d="M-25-45Q-62-52-64-21-91-10-84 23-78 51-45 54-19 55-12 32 22 22 9-8 9-26-9-29Z" fill="#d46c43" stroke="#e9e1cc" stroke-width="2"/><path d="M-14-20 92-20V-6H-14Z" fill="#b79a71" stroke="#262526" stroke-width="2"/><path d="M90-24 127-30 135-9 94-4Z" fill="#d46c43" stroke="#e9e1cc" stroke-width="2"/>${line('M-51-14H125M-51-9H125','#e9e1cc',1)}<path d="M-47-24V1M-25-24V1" stroke="#262526" stroke-width="6"/>${line('M17-19V-5M39-19V-5M58-19V-5M75-19V-5','#262526',1.5)}<circle cx="-51" cy="26" r="4" fill="#262526"/></g>
      ${rect(369,217,229,147,'#e9e1cc')}${note('SETLIST',385,246,'#262526',{size:18,spacing:3})}${line('M385 261H579','#262526',2)}
      ${line('M407 282H576M407 310H555M407 338H567','#776d60',3)}<g fill="none" stroke="#d46c43" stroke-width="2"><rect x="384" y="274" width="12" height="12"/><rect x="384" y="302" width="12" height="12"/><rect x="384" y="330" width="12" height="12"/></g>
      ${note('SONGS / SETLISTS / GIGS',34,389,'#e9e1cc',{size:12,spacing:2})}${paper(u,.23)}`,
  }),
  'galaxy-granite':u=>({
    body:`${rect(0,0,640,420,'#fbfaf7')}${rect(19,19,602,382,'none','stroke="#b79255" stroke-width="1.5"')}${note('MATERIALS / IDEAS / PROCESS',32,48,'#6e6b66',{size:12,spacing:2})}
      ${type('GALAXY',28,125,81,'#151515',{family:'serif',width:578,weight:700})}${type('GRANITE',28,205,81,'#151515',{family:'serif',width:578,weight:700})}${note('J O U R N A L',32,237,'#8f6e38',{size:15,spacing:2})}
      ${rect(31,257,176,109,'#272727')}${rect(229,257,176,109,'#eee8dc')}${rect(427,257,182,109,'#6e6b66')}
      ${line('M31 285 76 300 89 332 148 341 179 366M75 257 91 277 132 281 161 312 207 321','#a9a49a',1.5)}${line('M31 346 73 338 89 332M161 312 179 290 207 284','#b79255',1)}
      ${line('M229 272 268 293 279 322 312 329 340 366M279 322 325 298 358 309 405 288M358 309 376 346 405 354','#b1aba0',1.5)}${line('M229 352 274 344 312 329','#d1c4ac',2)}
      ${line('M427 269 464 285 480 313 530 320 552 344 609 356M480 313 463 350 427 366M530 320 554 285 609 273','#e7d8bc',1.5)}
      ${line('M31 378H609','#b79255',1)}${note('A CLOSER LOOK AT STONE',32,397,'#151515',{size:11,spacing:2})}${paper(u,.15)}`,
  }),
  'hll-daily':u=>({
    body:`${rect(0,0,640,420,'#e4ddc8')}${rect(21,21,598,378,'none','stroke="#29372d" stroke-width="1.5"')}${note('COMMUNITY FIELD GUIDE',34,50,'#29372d',{size:12,spacing:2})}
      ${type('HELL LET LOOSE',29,133,79,'#29372d',{width:582})}${type('FIELD BRIEF',31,188,54,'#a74e35',{width:580})}${line('M33 206H607','#29372d',2)}
      ${rect(33,225,306,146,'#29372d')}${line('M33 261H339M33 298H339M33 335H339M94 225V371M155 225V371M216 225V371M277 225V371','#68715f',1)}
      ${line('M63 346 124 316 185 316 246 252 309 252','#e4ddc8',3,'stroke-dasharray="8 6"')}<g fill="#a74e35" stroke="#e4ddc8" stroke-width="2"><rect x="116" y="308" width="16" height="16"/><rect x="238" y="244" width="16" height="16"/></g>
      <circle cx="63" cy="346" r="7" fill="#e4ddc8"/><path d="m301 245 15 7-15 7Z" fill="#e4ddc8"/>
      ${note('LEADERSHIP',362,249,'#29372d',{size:15,spacing:1})}${line('M362 263H600M362 276H579','#8d927e',2)}${note('LOGISTICS',362,306,'#29372d',{size:15,spacing:1})}${line('M362 320H600M362 333H558','#8d927e',2)}
      ${rect(362,349,238,22,'#a74e35')}${note('SQUAD / TEAM / FRONT',372,365,'#e4ddc8',{size:10,spacing:1})}${note('BRIEF / COORDINATE / ADAPT',34,393,'#29372d',{size:11,spacing:2})}${paper(u,.29)}`,
  }),
  'magic-quadratic':u=>({
    body:`${rect(0,0,640,420,'#2e3046')}${rect(19,19,602,382,'none','stroke="#858393" stroke-width="1"')}${note('KNOW YOUR OPENING HAND',31,46,'#a5bb94',{size:13,spacing:2})}
      ${type('COMMANDER',25,143,104,'#eee4c8',{width:589})}${type('OPENING PLAN',31,198,46,'#a5bb94',{width:578,family:'sans',weight:700})}${line('M30 217H610','#858393',1.5)}
      <g transform="translate(96 246) rotate(-12 55 62)"><rect width="110" height="128" rx="5" fill="#858393" stroke="#eee4c8" stroke-width="2"/><rect x="10" y="12" width="90" height="67" fill="#42465c"/><path d="m25 63 22-31 16 22 16-15 14 29H25Z" fill="#a5bb94"/>${line('M12 94H95M12 105H80M12 116H90','#eee4c8',2)}</g>
      <g transform="translate(188 240) rotate(7 55 62)"><rect width="110" height="128" rx="5" fill="#eee4c8" stroke="#2e3046" stroke-width="2"/><rect x="10" y="12" width="90" height="67" fill="#a5bb94"/><circle cx="55" cy="45" r="22" fill="none" stroke="#2e3046" stroke-width="2"/><path d="m55 27 7 14 15 4-15 4-7 14-7-14-15-4 15-4Z" fill="#2e3046"/>${line('M12 94H95M12 105H80M12 116H90','#858393',2)}</g>
      ${line('M358 250V365H600','#858393',2)}${rect(377,324,32,40,'#a5bb94')}${rect(428,294,32,70,'#eee4c8')}${rect(479,268,32,96,'#a5bb94')}${rect(530,308,32,56,'#eee4c8')}
      ${note('DECK IN / PLAN OUT',31,394,'#eee4c8',{size:11,spacing:2})}${paper(u,.2)}`,
  }),
  birthday:u=>({
    body:`${rect(0,0,640,420,'#f3e6c8')}${rect(19,19,602,382,'none','stroke="#bb643d" stroke-width="1.5"')}${note('A DATE. A STORY. A NOTE TO SHARE.',32,48,'#403d37',{size:12,spacing:1.4})}
      ${type('BirthDay',29,151,112,'#403d37',{family:'serif',width:577,weight:700})}${type('TODAY',31,208,51,'#bb643d',{width:579,family:'sans',weight:700,spacing:12})}${line('M32 227H608','#bb643d',1.5)}
      <g transform="translate(51 251)"><rect width="218" height="120" rx="4" fill="#fbf7ec" stroke="#403d37" stroke-width="2"/><path d="M0 29H218" stroke="#403d37" stroke-width="2"/><path d="M42-7V11M176-7V11" stroke="#bb643d" stroke-width="6" stroke-linecap="round"/>
      <g fill="#c9bea8"><circle cx="28" cy="52" r="4"/><circle cx="69" cy="52" r="4"/><circle cx="110" cy="52" r="4"/><circle cx="151" cy="52" r="4"/><circle cx="191" cy="52" r="4"/><circle cx="28" cy="78" r="4"/><circle cx="69" cy="78" r="4"/><circle cx="110" cy="78" r="4"/><circle cx="151" cy="78" r="4"/><circle cx="191" cy="78" r="4"/><circle cx="28" cy="104" r="4"/><circle cx="69" cy="104" r="4"/><circle cx="110" cy="104" r="4"/><circle cx="151" cy="104" r="4"/><circle cx="191" cy="104" r="4"/></g><circle cx="110" cy="78" r="14" fill="none" stroke="#bb643d" stroke-width="3"/></g>
      <g transform="translate(332 259) rotate(-4 117 52)"><rect width="236" height="108" fill="#bb643d"/><path d="m0 0 118 72L236 0M0 108l80-60m156 60-80-60" fill="none" stroke="#f3e6c8" stroke-width="2"/><circle cx="118" cy="72" r="12" fill="#f3e6c8"/><path d="m113 71 4 4 7-8" fill="none" stroke="#bb643d" stroke-width="2"/></g>
      ${note('BIRTHDAYS / HISTORY / PERSONAL MESSAGES',32,395,'#403d37',{size:10,spacing:1.2})}${paper(u,.22)}`,
  }),
  'passages-daily':u=>({
    body:`${rect(0,0,640,420,'#082b66')}${rect(20,20,600,380,'none','stroke="#a8e2e5" stroke-width="1"')}${note('ONE SMALL PRACTICE AT A TIME',33,48,'#a8e2e5',{size:12,spacing:2})}
      ${type('PASSAGES',27,141,105,'#fff2a6',{family:'sans',width:582,weight:800})}${type('DAILY',29,251,119,'#00cf9a',{family:'sans',width:367,weight:800})}
      <g transform="translate(488 205) rotate(8)"><path d="M-69-43Q-34-59 0-39 34-59 69-43V50Q34 34 0 53-34 34-69 50Z" fill="#a8e2e5" stroke="#082b66" stroke-width="3"/><path d="M0-39V53" fill="none" stroke="#082b66" stroke-width="2"/>${line('M-56-25Q-34-32-13-24M-56-7Q-34-14-13-6M-56 11Q-34 4-13 12M13-24Q34-32 56-25M13-6Q34-14 56-7M13 12Q34 4 56 11','#082b66',2)}</g>
      ${line('M34 279H606','#a8e2e5',1)}${rect(34,301,169,65,'#fff2a6')}${rect(235,301,169,65,'#00cf9a')}${rect(436,301,169,65,'#ff9d7b')}
      ${type('READ',118,344,27,'#082b66',{family:'sans',anchor:'middle',weight:700})}${type('TRY',319,344,27,'#082b66',{family:'sans',anchor:'middle',weight:700})}${type('REFLECT',520,344,27,'#082b66',{family:'sans',anchor:'middle',weight:700})}
      ${note('SKILLS / CONFIDENCE / CONVERSATION',33,391,'#a8e2e5',{size:10,spacing:1.6})}`,
  }),
  dayboard:u=>({
    body:`${rect(0,0,640,420,'#e9e5d9')}${rect(0,0,640,23,'#db7040')}${rect(29,44,582,353,'none','stroke="#252c29" stroke-width="1.5"')}
      ${type('DAY',42,204,169,'#252c29',{width:414})}${type('BOARD',42,299,102,'#252c29',{width:548})}
      <path d="M484 44H611V209H484Z" fill="#db7040"/><path d="M496 55H599V197H496Z" fill="none" stroke="#e9e5d9" stroke-width="1"/>${note('TODAY',508,86,'#252c29',{size:14,spacing:1.5})}<path d="m510 129 17 17 43-47" fill="none" stroke="#252c29" stroke-width="7"/>
      ${line('M29 322H611M223 322V397M417 322V397','#252c29',1.5)}${note('PLAN',46,352,'#5b665b',{size:12,spacing:2})}${note('DO',240,352,'#5b665b',{size:12,spacing:2})}${note('DONE',434,352,'#5b665b',{size:12,spacing:2})}
      ${rect(46,367,143,10,'#c6ccbb')}${rect(240,367,143,10,'#db7040')}${rect(434,367,143,10,'#758979')}${paper(u,.24)}`,
  }),
};

export const ART_KEYS=Object.freeze(Object.keys(covers));
/** Produce a title-led decorative cover. Unknown keys use the Dayboard design. */
export function renderArtwork(project={}){
  const key=Object.prototype.hasOwnProperty.call(covers,project.art)?project.art:'dayboard';
  const uid=`dfe-cover-${String(project.id||key).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  const palette=ART_PALETTES[key];
  const {defs='',body}=covers[key](uid);
  const common=`<pattern id="${uid}-grain" width="89" height="73" patternUnits="userSpaceOnUse"><g fill="${palette.foreground}"><circle cx="6" cy="11" r=".8"/><circle cx="39" cy="46" r=".7"/><circle cx="76" cy="19" r=".65"/><circle cx="61" cy="63" r=".8"/><circle cx="16" cy="58" r=".6"/><circle cx="50" cy="9" r=".6"/></g><path d="M12 34h5M64 38h3M33 68h4M81 55h2" stroke="${palette.foreground}" stroke-width=".6"/></pattern><pattern id="${uid}-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="${palette.foreground}"/></pattern><pattern id="${uid}-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 2 2-2M0 9 9 0M7 11 11 7" fill="none" stroke="${palette.foreground}" stroke-width="1"/></pattern><pattern id="${uid}-scan" width="4" height="5" patternUnits="userSpaceOnUse"><path d="M0 4H4" fill="none" stroke="${palette.foreground}" stroke-width=".6"/></pattern>`;
  return `<svg class="project-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%"><defs>${common}${defs}</defs>${body}</svg>`;
}

