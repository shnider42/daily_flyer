/** Small pieces of camp, heard in safe places. They never interrupt an emergency. */
const hash = value => { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; };
const hearth = value => value?.systemId === 'hearth' || ['kettle', 'morrow', 'tinbell'].includes(value?.parentId || value?.id);
const bulletin = (id, label, text, roles) => Object.freeze({ id, label, text, roles: Object.freeze(roles) });

export const FRONTIER_BULLETINS = Object.freeze([
  bulletin('recruitment-cinema', 'What happened at recruitment movie night?', 'They screened an ancient film called Starship Troopers. Half the recruits took tactical notes. The sergeant confiscated the notes and put the projectionist in charge of media literacy.', ['warden', 'pilot', 'bartender']),
  bulletin('service-mug', 'Is that recruitment poster serious?', '“Service guarantees a commemorative mug.” They ran out of mugs before they ran out of posters. The quartermaster now issues a drawing of one, marked NOT FOR HOT LIQUIDS.', ['warden', 'dockworker', 'courier']),
  bulletin('bug-ambassador', 'Why did they take down the bug poster?', 'The poster said KNOW YOUR ENEMY beneath a six-legged silhouette. The visiting Keth trade delegate signed it. Then she submitted an invoice for unauthorized use of her likeness.', ['broker', 'bartender', 'governor']),
  bulletin('victory-forecast', 'How reliable is the victory bulletin?', 'The bulletin predicted victory by lunch. Lunch was delayed. Command has announced that both forecasts remain technically accurate.', ['warden', 'courier', 'pilot']),
  bulletin('helmet-warranty', 'What is wrong with the new helmets?', 'Nothing, according to the supplier. The warranty excludes impact, heat, vacuum, and use by military personnel. Apparently they are excellent hats for thinking about a safer career.', ['mechanic', 'engineer', 'salvager']),
  bulletin('immortality-form', 'What is that notice beside the clinic?', 'The recruitment reel promised a chance to live forever in the history books. The clinic added: “Please aim for next Thursday first.” I trust the clinic’s schedule.', ['medic', 'bartender', 'courier']),
  bulletin('classified-weather', 'Why is the weather report classified?', 'The forecast exposed a weakness in the landing operation: rain. Command restricted the report. The rain has declined to sign the nondisclosure form.', ['scientist', 'archivist', 'pilot']),
  bulletin('tactical-retreat', 'Is that really the evacuation drill?', 'The instructor calls it a rapid advance toward previously secured territory. The shuttle pilot calls it boarding. We are all hoping the pilot wins the terminology dispute.', ['warden', 'pilot', 'dockworker'])
]);

export function frontierConversationTopic(game, entity, role) {
  const state = game?.state, data = entity?.data || {};
  if (!state || state.systemId === 'hearth' || state.exploration || state.boarding?.phase === 'active' || state.person?.health <= 0 || data.automated || data.socialOnly || data.culture === 'reedbound' || data.techLevel === 'preflight') return null;
  const bodyId = state.interior?.location?.parentId || state.locationId;
  if (data.systemId && data.systemId !== state.systemId || data.homeLocationId && data.homeLocationId !== bodyId) return null;
  const key = `${state.seed}:${state.systemId}:${entity.id}:noticeboard`, roll = hash(key);
  if (roll % 7 !== 0) return null;
  const options = FRONTIER_BULLETINS.filter(item => item.roles.includes(role));
  if (!options.length) return null;
  const { id, label, text } = options[Math.floor(roll / 7) % options.length];
  return { id: `bulletin-${id}`, label, text };
}

const exchanges = Object.freeze([
  Object.freeze(['The recruiter promised adventure.', 'Did you ask whether that was the name of the supply ship?']),
  Object.freeze(['The recruitment reel needs a more intimidating insect.', 'Ask the one auditing our kitchen. It has found six violations.']),
  Object.freeze(['Apparently we are the finest unit in this sector.', 'They sent the same poster to the other unit. I delivered it.']),
  Object.freeze(['The briefing says the operation is almost over.', 'It said that on the previous briefing. This one has better music.'])
]);

export function frontierAmbientExchanges(surface, window) {
  if (!surface || hearth(surface) || surface.warzone || surface.site?.hostile || surface.site?.expedition || surface.culture === 'reedbound' || !['station', 'planet'].includes(surface.kind)) return [];
  if (!['nacre', 'brassfall', 'sable', 'cinder', 'ravel'].includes(surface.systemId) && !String(surface.id || '').includes('garrison')) return [];
  return hash(`${surface.seed}:${surface.id}:${window}:camp`) % 4 === 0 ? exchanges : [];
}
