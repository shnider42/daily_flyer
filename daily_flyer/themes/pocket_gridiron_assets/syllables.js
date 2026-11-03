import {PRONUNCIATIONS} from './booth-pronunciations.js?v=20';

// Stress digits describe spoken syllables, not spelling length. The compact
// dictionary covers authored dialogue; the fallback also handles fresh rosters.
const overrides={every:'10',everything:'102',everybody:'1020',everyone:'102',our:'1',hour:'1',fire:'1',mahomes:'01',tagovailoa:'20120',pacheco:'010',aikman:'10',booyah:'10',gonna:'10',wanna:'10'};
const initialisms=new Set('PGI NFL QB RB WR TE OL DL LB DB TD PAT MVP AFC NFC NE NYJ NYG KC LA LAR LAC SF TB GB NO LV PHI PIT SEA BUF BAL CIN CLE DAL DEN DET HOU IND JAX MIA MIN ATL ARI CAR CHI TEN WAS'.split(' '));
const small='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const tens='zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
function numberWords(digits){
 const n=Number(digits);
 if(digits.length>3)return [...digits].flatMap(d=>small[Number(d)]);
 if(n<20)return [small[n]];
 if(n<100)return [tens[Math.floor(n/10)],...(n%10?[small[n%10]]:[])];
 return [small[Math.floor(n/100)],'hundred',...(n%100?numberWords(String(n%100)):[])];
}
function letters(word){return [...word.toUpperCase()].map(c=>c==='W'?'100':'1').join('');}
function spokenWord(raw){
 const word=raw.toLowerCase();
 if(/^\d+$/.test(word))return numberWords(word).map(spokenWord).join('');
 if(initialisms.has(raw))return letters(raw);
 if(raw==='II')return '10';if(raw==='III'||raw==='IV')return '1';
 if(word==='jr'||word==='sr')return '10';
 if(overrides[word])return overrides[word];
 if(Object.hasOwn(PRONUNCIATIONS,word))return PRONUNCIATIONS[word];
 // Unknown possessives inherit their name's vowels; sibilants add a syllable.
 if(word.endsWith("'s")){const stem=raw.slice(0,-2);return spokenWord(stem)+(/(?:s|z|sh|ch|j)$/i.test(stem)&&!initialisms.has(stem)?'0':'');}
 let stem=word.replace(/[^a-z]/g,'');if(!stem)return '';
 if(stem.endsWith('ed')&&!/[td]ed$/.test(stem))stem=stem.slice(0,-2);
 else if(stem.endsWith('es')&&!/(?:s|x|z|ch|sh)es$/.test(stem))stem=stem.slice(0,-2);
 if(stem.endsWith('e')&&!/[^aeiou]le$/.test(stem))stem=stem.slice(0,-1);
 const count=Math.max(1,(stem.match(/[aeiouy]+/g)||[]).length);
 return '1'+'0'.repeat(count-1);
}
export function syllableStress(text=''){
 const normalized=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'");
 // Dotted initials are read as letters; hyphens, score dashes and punctuation
 // separate spoken parts but never generate sounds of their own.
 return (normalized.match(/(?:[A-Z]\.){2,}|[A-Za-z]+(?:'[A-Za-z]+)*|\d+/g)||[])
  .map(w=>w.includes('.')?letters(w.replace(/\./g,'')):spokenWord(w)).join('');
}
