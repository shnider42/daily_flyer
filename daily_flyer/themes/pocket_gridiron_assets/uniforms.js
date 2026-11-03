// Uniform identity follows the team index, never possession or player role.
const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
export function uniformFor(team,index){
 const primary=team.color||'#173c54',accent=team.accent||primary;
 const dark=luminance(primary)<.24?primary:luminance(accent)<.24?accent:'#24313e';
 const jersey=index===1?'#f5f3e9':dark;
 return {jersey,helmet:accent,stripe:dark,pants:index===1?dark:'#e7e9ce',number:index===1?dark:'#fff5da'};
}
