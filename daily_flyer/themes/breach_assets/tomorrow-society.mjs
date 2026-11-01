// Tomorrow's people share the same authoritative combat and interaction state.
// Favors are authored one-shot controls; the clerk's disposition is fixed per run.
export const TOMORROW_FACTIONS = Object.freeze({ wardens: 'Civic Wardens', unfiled: 'The Unfiled', clerks: 'Municipal Clerks', infestation: 'The Unfinished' });
export const TOMORROW_NPCS = Object.freeze({
  mara: { id: 'npc-mara', name: 'Mara Venn', role: 'archivist', faction: 'unfiled', help: 'help-mara' },
  rook: { id: 'npc-rook', name: 'Bailiff Rook', role: 'warden', faction: 'wardens', help: 'help-rook' },
  twice: { id: 'npc-twice', name: 'Clerk Twice', role: 'broker', faction: 'clerks', help: 'help-twice' },
});
const copy = value => JSON.parse(JSON.stringify(value));
const stateOf = value => value?.state || value;
const used = (value, id) => stateOf(value)?.interactables?.some(item => item.id === id && item.used === true) === true;
const actor = (value, id) => stateOf(value)?.enemies?.find(enemy => enemy.id === TOMORROW_NPCS[id]?.id);
const living = enemy => !!enemy && enemy.alive !== false && enemy.health > 0;
const bothRegisters = value => used(value, 'relay-west') && used(value, 'relay-east');
const societyOf = value => stateOf(value)?.tomorrowSociety;
const result = (text, label, canUse) => ({ text, label, canUse: !!canUse });
const message = (game, text) => game._events.push({ type: 'message', text });
const members = game => Object.values(game.state.players || { solo: game.state.player });

export function authorTomorrowSociety({ item, foe, notice }) {
  const person = (id, type, x, z, health, extra = {}) => foe(id, 'sentry', x, z, health, { npcRole: type, introducedRevision:2, ...extra });
  person('npc-mara', 'archivist', 8, 23, 160, { npcId: 'mara', displayName: 'Mara Venn', faction: 'unfiled', stationary: true });
  person('npc-rook', 'warden', 68, 52, 180, { npcId: 'rook', displayName: 'Bailiff Rook', faction: 'wardens', stationary: true });
  person('npc-twice', 'broker', 52, 45, 150, { npcId: 'twice', displayName: 'Clerk Twice', faction: 'clerks', stationary: true });
  for (const [id, x, z] of [['warden-north',24,51],['warden-south',22,51]]) person(id,'warden',x,z,115,{ faction:'wardens',displayName:'Civic Warden',encounterId:'wardrobe-feud' });
  for (const [id, x, z] of [['unfiled-north',17,52],['unfiled-south',15,51]]) person(id,'unfiled',x,z,115,{ faction:'unfiled',displayName:'Unfiled Defender',encounterId:'wardrobe-feud' });
  for (const [id, x, z] of [['rook-escort-a',65,47],['rook-escort-b',66,45]]) person(id,'warden',x,z,0,{ faction:'wardens',displayName:'Rook’s Escort',societySupport:'rook',alive:false,dormant:true,maxHealth:115 });
  const action = (id, x, z, label, npcId, npcAction, extra = {}) => item(id,'tomorrow-npc',x,z,label,{tomorrowAction:'npc',npcId,npcAction,introducedRevision:2,requires:'power',repeatable:true,...extra});
  action('help-mara',8,23,'Return Mara’s catalogue card','mara','help');
  action('mara-catalogue',9,51,'Recover the missing catalogue card','mara','proof');
  action('help-rook',68,52,'Repair Rook’s field radio','rook','help');
  action('help-twice',52,45,'Accept Clerk Twice’s supply bargain','twice','help');
  action('twice-registry',23,6,'Inspect the duplicate staff register','twice','inspect');
  action('expose-twice',54,45,'Challenge the clerk’s credentials','twice','expose');
  notice('wardrobe-factions',25.98,53,'WARDENS / UNFILED','TWO FACTIONS / KEEP YOUR FIRE CLEAR / ROOK CAN CALL A CEASEFIRE',{dx:-1,dz:0});
  notice('mara-living-memory',4.02,23,'SOME MEMORIES ARE STILL ALIVE','MARA’S CATALOGUE CARD IS IN THE SOUTHERN WARDROBE',{dx:1,dz:0});
  notice('twice-bargain',56.98,46,'CLERK TWICE / NO REFUNDS','A NAME CAN BE FILED TWICE / CHECK THE MUSEUM REGISTER',{dx:-1,dz:0});
}

export function initialTomorrowSociety(seed = 1) {
  // Separate from the combat RNG: taking a different route cannot reroll a person.
  const mixed = Math.imul(((Number(seed) >>> 0) || 1) ^ 0x71a9c3, 2654435761) >>> 0;
  return { version:1, clerkDisposition: mixed % 2 ? 'double' : 'faithful', clerkOutcome:'undecided', warningRemaining:0 };
}

export function initializeTomorrowSociety(game) {
  if (!game.level.tomorrow) return;
  game.state.tomorrowSociety = initialTomorrowSociety(game._runSeed);
}

export function tomorrowNpcHostile(value, enemy) {
  if (!enemy?.npcRole) return null;
  return living(enemy) && (enemy.provoked === true || enemy.npcId === 'twice' && societyOf(value)?.clerkOutcome === 'betrayed');
}

export function tomorrowFactionsOpposed(value, a, b) {
  if (!a?.npcRole && !b?.npcRole) return null;
  if (a.dormant || b.dormant || !living(a) || !living(b)) return false;
  const af = a.faction || 'infestation', bf = b.faction || 'infestation';
  if (af === bf) return false;
  if (af === 'infestation' || bf === 'infestation') return true;
  if (af === 'clerks' || bf === 'clerks') return societyOf(value)?.clerkOutcome === 'betrayed';
  if (['wardens','unfiled'].includes(af) && ['wardens','unfiled'].includes(bf)) return !used(value,'help-rook');
  return false;
}

export function tomorrowLivingMemory(value) {
  const mara = actor(value,'mara');
  return used(value,'help-mara') && living(mara) && !tomorrowNpcHostile(value,mara);
}

export function tomorrowSocietyOutcome(value) {
  const s = societyOf(value), mara = actor(value,'mara'), rook = actor(value,'rook');
  return {
    livingMemory: tomorrowLivingMemory(value),
    mara: !living(mara) ? 'lost' : used(value,'help-mara') ? (tomorrowNpcHostile(value,mara) ? 'alienated' : 'rescued') : 'waiting',
    rook: !living(rook) ? 'lost' : used(value,'help-rook') ? 'ceasefire' : 'waiting',
    clerk: s?.clerkOutcome || 'undecided',
    helped: ['help-mara','help-rook','help-twice'].filter(id=>used(value,id)).length,
  };
}

export function tomorrowSocietyEndingText(value, ending) {
  const outcome = tomorrowSocietyOutcome(value), parts = [];
  if (outcome.livingMemory) parts.push(ending === 'rewrite' ? 'Mara speaks the missing name herself. A living memory walks through the doorway.' : 'Mara reaches the ordinary street carrying the names you returned.');
  else if (used(value,'help-mara')) parts.push('Mara’s catalogue survives. Its keeper does not return with you.');
  if (outcome.rook === 'ceasefire') parts.push('Rook’s signal holds: Wardens and Unfiled lower their weapons long enough to leave together.');
  if (outcome.clerk === 'betrayed') parts.push('The clerk’s promise was a second invoice. Your team leaves knowing whose name was false.');
  else if (outcome.clerk === 'exposed') parts.push('Twice’s duplicate credentials stay behind, stamped VOID.');
  else if (outcome.clerk === 'loyal') parts.push('For once, Clerk Twice keeps a promise exactly once.');
  return parts.join(' ');
}

export function tomorrowNpcInteractionInfo(game, object) {
  const s = game.state, npc = actor(game,object.npcId), name = TOMORROW_NPCS[object.npcId]?.name || 'Operator';
  if (!s.power) return result('Wake the central exchange before the people can answer.','POWER',false);
  if (object.npcAction === 'proof') return result(object.used ? 'Mara’s catalogue card is in the shared records.' : 'Take the catalogue card to Mara Venn in the museum. No payment.','CATALOGUE',!object.used);
  if (object.npcAction === 'inspect') {
    if (!object.used) return result('Inspect the staff register. The result identifies whether Twice’s bargain can be trusted.','INSPECT',true);
    return result(s.tomorrowSociety.clerkDisposition === 'double' ? 'Two contracts. One face. Challenge Twice at the exchange before the second register answers.' : 'The registry seal is genuine. Twice has kept this appointment.','EVIDENCE',false);
  }
  if (!living(npc)) return result(`${name} is gone. The original ending routes remain open.`,'LOST',false);
  if (object.npcAction === 'expose') {
    if (s.tomorrowSociety.clerkOutcome === 'betrayed') return result('Twice already broke the agreement. Keep clear of the clerk’s aim.','BETRAYED',false);
    if (!used(game,'twice-registry')) return result('Find the staff register in the museum before challenging these credentials.','EVIDENCE',false);
    return result(object.used ? 'The credentials have been settled.' : 'Present the museum evidence. False credentials cancel the betrayal; a genuine seal clears the clerk.','CHALLENGE',!object.used);
  }
  if (tomorrowNpcHostile(game,npc)) return result(`${name} no longer trusts your team.`,'HOSTILE',false);
  if (object.used) return result(object.npcId === 'mara' ? 'Mara can replace one memory anchor at Rewrite while alive and loyal.' : object.npcId === 'rook' ? 'Ceasefire ordered. Rook’s escorts fight the infestation.' : 'The bargain is recorded. The museum register can still reveal the clerk’s intent.','HELPED',false);
  if (object.npcId === 'mara') return used(game,'mara-catalogue')
    ? result('Return the catalogue card. Mara becomes a living memory for Rewrite; each operator receives 12 cells.','HELP MARA',true)
    : result('Recover Mara’s catalogue card in the southern Wardrobe. She can replace one missing memory at Rewrite.','CATALOGUE',false);
  const cost = object.npcId === 'rook' ? 12 : 20;
  const offer = object.npcId === 'rook' ? '12 pistol rounds: repair the radio, end the Warden–Unfiled feud, deploy two armed escorts.' : '20 pistol rounds: each operator gains 20 shells and up to 20 armor. The museum registry can expose a bad bargain.';
  return result(offer, s.player.ammo.pistol >= cost ? object.npcId === 'rook' ? 'HELP ROOK' : 'ACCEPT DEAL' : 'NEED AMMO',s.player.ammo.pistol>=cost);
}

export function useTomorrowNpcInteraction(game, object) {
  const info = tomorrowNpcInteractionInfo(game,object);
  if (!info.canUse) { message(game,info.text); return false; }
  const s = game.state;
  s.tutorial.interacted = true;
  object.used = true;
  if (object.npcAction === 'proof') message(game,'Catalogue recovered. Mara Venn is waiting by the museum’s southern refuge.');
  else if (object.npcAction === 'inspect') message(game,tomorrowNpcInteractionInfo(game,object).text);
  else if (object.npcAction === 'expose') {
    s.tomorrowSociety.clerkOutcome = s.tomorrowSociety.clerkDisposition === 'double' ? 'exposed' : 'loyal';
    s.tomorrowSociety.warningRemaining = 0;
    message(game,s.tomorrowSociety.clerkOutcome === 'exposed' ? 'The duplicate contract tears in half. Twice backs down; the betrayal is stopped.' : 'The seal matches. Twice was telling the truth.');
  } else if (object.npcId === 'mara') {
    for (const player of members(game)) player.ammo.cells = (player.ammo.cells || 0) + 12;
    message(game,'Mara remembers her own name. She can stand in for one memory anchor at Rewrite while alive and loyal. Team cells +12.');
  } else if (object.npcId === 'rook') {
    s.player.ammo.pistol -= 12;
    for (const enemy of s.enemies.filter(enemy=>enemy.societySupport==='rook')) { enemy.alive=true;enemy.health=enemy.maxHealth;enemy.dormant=false;enemy.active=true;enemy.attackCooldown=1.2; }
    for (const enemy of s.enemies.filter(enemy=>['wardens','unfiled'].includes(enemy.faction))) { enemy.telegraph=null;enemy.attackCooldown=Math.max(enemy.attackCooldown,.8); }
    message(game,'Rook broadcasts a ceasefire. Wardens and Unfiled stop fighting each other. Two escorts enter Sunday against the infestation.');
  } else if (object.npcId === 'twice') {
    s.player.ammo.pistol -= 20;
    for (const player of members(game)) { player.ammo.shells += 20;player.armor=Math.min(100,player.armor+20); }
    message(game,'Twice delivers the supplies. “When both registers answer, I will settle the rest.” The museum holds the staff register.');
  }
  game._events.push({type:'tomorrow-npc',npcId:object.npcId,action:object.npcAction,id:object.id,x:object.x,z:object.z});
  game._syncPermanentProgress?.();
  return true;
}

export function updateTomorrowSociety(game, dt) {
  const s = game.state, society=s.tomorrowSociety;
  if (!game.level.tomorrow || !society || s.status !== 'playing') return;
  const twice=actor(game,'twice');
  if (living(twice) && used(game,'help-twice') && bothRegisters(game) && society.clerkOutcome === 'undecided') {
    if (society.clerkDisposition === 'faithful') { society.clerkOutcome='loyal';message(game,'Twice’s final receipt is honest. The clerk keeps the bargain.'); }
    else { society.clerkOutcome='warning';society.warningRemaining=1.5;message(game,'TWICE REVOKES THE AGREEMENT. The clerk is drawing a weapon—move out of the firing line.'); }
    game._syncPermanentProgress?.();
  } else if (society.clerkOutcome === 'warning') {
    society.warningRemaining=Math.max(0,society.warningRemaining-dt);
    if (society.warningRemaining === 0) {
      society.clerkOutcome='betrayed';
      if (living(twice)) { twice.provoked=true;twice.telegraph=null;twice.attackCooldown=Math.max(1,twice.attackCooldown); }
      game._events.push({type:'tomorrow-betrayal',id:'npc-twice',x:twice?.x,z:twice?.z});
      message(game,'Clerk Twice has betrayed the team. Your pass and memories are safe; the original ending routes remain available.');
      game._syncPermanentProgress?.();
    }
  }
}

export function syncTomorrowSociety(game, saved) {
  if (!game.level.tomorrow || !game.state.tomorrowSociety) return;
  saved.tomorrowSociety=copy(game.state.tomorrowSociety);
  for (const current of game.state.enemies.filter(enemy=>enemy.npcRole)) {
    const old=saved.enemies.find(enemy=>enemy.id===current.id);if(!old)continue;
    if(current.killedByPlayer===true&&old.killedByPlayer!==true)saved.kills++;
    Object.assign(old,copy(current));
  }
}

export function validTomorrowSocietySnapshot(snapshot, level) {
  if (!level.tomorrow) return true;
  const s=stateOf(snapshot), society=s.tomorrowSociety;
  if (!society || society.version!==1 || !['double','faithful'].includes(society.clerkDisposition)
    || !['undecided','loyal','warning','betrayed','exposed'].includes(society.clerkOutcome)
    || !Number.isFinite(society.warningRemaining) || society.warningRemaining<0 || society.warningRemaining>1.5) return false;
  if (society.clerkOutcome!=='warning' && society.warningRemaining!==0) return false;
  if (used(s,'help-mara') && !used(s,'mara-catalogue')) return false;
  if (used(s,'expose-twice') && !used(s,'twice-registry')) return false;
  if (['warning','betrayed'].includes(society.clerkOutcome) && (!used(s,'help-twice') || !bothRegisters(s) || used(s,'expose-twice') || society.clerkDisposition!=='double')) return false;
  if (society.clerkOutcome==='exposed' && (!used(s,'expose-twice') || society.clerkDisposition!=='double')) return false;
  if (society.clerkOutcome==='loyal' && (society.clerkDisposition!=='faithful' || !used(s,'expose-twice') && !(used(s,'help-twice') && bothRegisters(s)))) return false;
  if (used(s,'expose-twice') && !['loyal','exposed'].includes(society.clerkOutcome)) return false;
  if (society.clerkOutcome==='betrayed' && living(actor(s,'twice')) && !actor(s,'twice').provoked) return false;
  for (const base of level.enemies.filter(enemy=>enemy.societySupport==='rook')) {
    const enemy=s.enemies.find(enemy=>enemy.id===base.id);if(!enemy)return false;
    if (!used(s,'help-rook') && (enemy.alive || enemy.health!==0 || !enemy.dormant)) return false;
    if (used(s,'help-rook') && enemy.dormant) return false;
  }
  return true;
}
