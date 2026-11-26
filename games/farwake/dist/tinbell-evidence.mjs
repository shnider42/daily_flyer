/** Optional physical evidence. This records an observation without identifying its cause. */
export const TINBELL_RESIDUE_RECORD=Object.freeze({
 id:'bellwether-residue',name:'Layered deposit inside the beacon insulation',x:31,y:12,loreId:'tinbell-layered-sample',evidenceId:'bellwether-residue',
 text:'A broken piece of beacon housing lies beneath the old insulation. Inside the sealed layers, a thin deposit repeats three bands: silver, black, amber. It is part of the material, not a pattern on the receiver’s display. You seal a small sample and record the band spacing. The field scanner cannot identify it. There is no evidence here that it caused the animal’s behavior.'
});
export const TINBELL_RESIDUE_LORE=Object.freeze({id:'tinbell-layered-sample',title:'Tinbell: a sealed sample',text:TINBELL_RESIDUE_RECORD.text,physicalSourceOnly:true});

export function withTinbellResidue(site){
 if(site?.bodyId!=='tinbell'||site.id!=='hollow'||site.records?.some(record=>record.id===TINBELL_RESIDUE_RECORD.id))return site;
 return {...site,records:[...(site.records||[]),{...TINBELL_RESIDUE_RECORD}]};
}
