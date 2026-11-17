/** People react to recorded events they participated in or can actually know. */
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 160) : '';
const bodyOf = state => state.exploration?.bodyId || state.interior?.location?.parentId || state.locationId;
const samePlace = (state, place) => !!place?.bodyId && place.systemId === state.systemId && place.bodyId === bodyOf(state);
const dead = person => person?.status === 'dead' || person?.dead === true || person?.health === 0;
const wounded = person => Number.isFinite(person?.health) && person.health > 0 && person.health < (person.maxHealth || 100);
const plural = (n, singular, multiple = `${singular}s`) => `${n} ${n === 1 ? singular : multiple}`;

function manifestLine(report) {
  const people = Array.isArray(report.crew) ? report.crew : [];
  const lost = people.filter(dead).length;
  const missing = people.filter(person => person.status === 'unknown').length;
  const recovered = people.filter(person => person.status === 'recovered').length;
  const parts = [];
  if (recovered) parts.push(`${plural(recovered, 'crewmate')} ${recovered === 1 ? 'is' : 'are'} accounted for in recovery`);
  if (lost) parts.push(`${plural(lost, 'confirmed death')} ${lost === 1 ? 'is' : 'are'} in the casualty record`);
  if (missing || report.unknowns?.length) parts.push('some details are still unconfirmed');
  return parts.length ? `${parts.join('; ')}.` : 'The crew report keeps each recorded name and whereabouts together.';
}

function response(report, context, greeting, rumor) {
  return { context, incidentId: report.id, greeting, rumor,
    updateLabel: context === 'homecoming' ? 'About coming home' : 'About the recovery' };
}

/** No simulation, rewards, invented memories, or cross-galaxy news propagation. */
export function voyageReaction(game, entity, { known = false, role = '' } = {}) {
  const state = game.state, data = entity.data || {};
  if (data.automated || data.techLevel === 'preflight' || data.culture === 'reedbound') return null;
  const report = game.recoveryReport?.(data.incidentId);
  if (!report || !report.id) return null;
  const bodyId = bodyOf(state);
  if (data.systemId && data.systemId !== state.systemId || data.homeLocationId && data.homeLocationId !== bodyId) return null;
  const crew = (report.crew || []).find(person => person.id === data.crewId);
  const origin = text(report.source?.name) || 'the last voyage';
  const atRecovery = samePlace(state, report.recoveryDestination);
  const atHome = report.arrival?.arrived === true && samePlace(state, report.home);
  const context = atHome ? 'homecoming' : 'recovery';

  if (crew && !dead(crew) && crew.status !== 'unknown' && (data.recoveredCrew || entity.type === 'crew')) {
    const lost = (report.crew || []).filter(dead);
    const own = (state.crew || []).find(person => person.id === crew.id) || crew;
    const injured = wounded(own) || Number.isFinite(data.health) && data.health < (data.maxHealth || 100);
    const greeting = data.recoveredCrew
      ? injured ? 'Captain. I made it out, but I still need time to recover. Let’s get everyone accounted for before we go anywhere.'
        : 'There you are, captain. I made it out. I’m staying with the recovery party until we have a ship and a place aboard.'
      : lost.length ? `Good to see you back. I keep thinking about ${text(lost[0].name) || 'the people we lost'}. Leave their ${lost.length === 1 ? 'name' : 'names'} in the record.`
        : injured ? 'You’re back. I’m still carrying an injury from that trip. Check on us before the next departure.'
          : 'You made it back, captain. Before the next departure, let’s check the crew and the way out together.';
    return response(report, context, greeting, manifestLine(report) + ' Open Crew to review where everyone is and who can rejoin.');
  }

  if (role === 'medic' && atRecovery && (!report.recoveryDestination?.factionId || !data.factionId || data.factionId === report.recoveryDestination.factionId)) {
    const evacuation = report.evacuation;
    const next = evacuation && !evacuation.arrived
      ? `Your service covers passage to ${text(evacuation.home?.name) || 'your home posting'}. The recovery panel has the departure and pickup details.`
      : 'Your recovery report has the crew’s last confirmed whereabouts. We can treat your remaining injuries here.';
    return response(report, context,
      'You’re awake. The evacuation got you here alive. Take a moment; we’ll go through the people and the next step with you.',
      `${manifestLine(report)} ${next}`);
  }

  const service = report.service;
  const ownRecruiter = data.militaryRecruiter && service?.factionId && (data.militaryFactionId || data.factionId) === service.factionId;
  if (ownRecruiter && atHome) {
    const filed = report.arrival.acknowledged === true;
    const greeting = filed
      ? `Your return from ${origin} is in the service record. We have kept the casualty report with it. How are you holding up?`
      : `You’re back from ${origin}. We need your account and the crew list before we close the recovery report. Take your time.`;
    return response(report, 'homecoming', greeting,
      'Review the return debrief. Completed assignments and earned pay remain on your service record; being rescued does not count as a completed mission.');
  }

  if (role === 'medic' && atHome) {
    return response(report, 'homecoming',
      'You made it home. If you still need treatment, sit down. You don’t have to be ready for another voyage today.',
      'We can treat your remaining injuries. Your recovery report keeps the confirmed crew outcomes and the return debrief.');
  }

  // A familiar face can notice the return. Strangers are not given the crew's
  // names, a private medical record, or knowledge of a distant fight.
  if (known && atHome && !data.socialOnly && ['dockworker', 'courier', 'pilot', 'bartender', 'mechanic', 'engineer', 'warden', 'broker', 'merchant', 'archivist'].includes(role)) {
    const lines = {
      bartender: 'There you are. It’s good to see you back. Find a seat if you need a quiet minute.',
      mechanic: 'Good to see you standing here again. We can talk about the ship when you’re ready.',
      pilot: 'You made the return journey. I’m glad you did. Take a moment before planning the next one.',
      dockworker: 'I recognize you. Good to see you back through the landing. No need to rush straight out again.'
    };
    return response(report, 'homecoming', lines[role] || 'You’re back. It’s good to see a familiar face come through that door again.',
      'If you want to talk about what happened, start with the people. The rest can wait a moment.');
  }
  return null;
}
