/** Public leads and a compact field objective. Solutions stay at the actual site. */
import { expeditionStorySites } from './expedition-stories.mjs';
import { storyStatus } from './expedition-story-rules.mjs';

export function expeditionDestinations(system, seed = 'farwake') {
  if (!system || system.id === 'hearth') return [];
  return (system.bodies || []).flatMap(body => {
    const sites = expeditionStorySites({ ...body, systemId: system.id, faction: body.faction || system.faction }, seed);
    return sites.length ? [{ bodyId: body.id, bodyName: body.name, sites: sites.map(site => ({ id: site.id, name: site.name, summary: site.summary, objective: site.objective, outdoors: !!site.outdoors })) }] : [];
  });
}

export function appendExpeditionDestinations(parent, system, seed) {
  const places = expeditionDestinations(system, seed);
  if (!places.length) return null;
  const doc = parent.ownerDocument, details = doc.createElement('details'), summary = doc.createElement('summary');
  details.className = 'entry-card'; summary.textContent = 'On the surface'; details.append(summary);
  for (const place of places) {
    const title = doc.createElement('h4'); title.textContent = place.bodyName; details.append(title);
    for (const site of place.sites) {
      const row = doc.createElement('p'), name = doc.createElement('strong'), description = doc.createElement('span');
      row.className = 'mini'; name.textContent = `${site.name} · ${site.outdoors ? 'Open terrain' : 'Interior'}`;
      description.textContent = site.summary; row.append(name, doc.createElement('br'), description); details.append(row);
    }
  }
  const help = doc.createElement('p'); help.className = 'mini muted'; help.textContent = 'Land here, then use the local chart to mark a trail or entrance. The site briefing explains the work before you go in.'; details.append(help);
  parent.append(details); return details;
}

export function appendStoryProgress(parent, site, encounter, { onMark } = {}) {
  if (!site?.expedition || !encounter) return null;
  const status = storyStatus(encounter, site), doc = parent.ownerDocument, card = doc.createElement('section');
  card.className = 'entry-card';
  const heading = doc.createElement('strong'); heading.textContent = status.completed ? 'Local outcome' : 'Your next step'; card.append(heading);
  const objective = doc.createElement('p'); objective.textContent = status.completed ? status.aftermath || 'Your decision is recorded here.' : status.objective || site.objective; card.append(objective);
  if (status.pendingSummary && !status.completed) { const detail = doc.createElement('p'); detail.className = 'mini muted'; detail.textContent = status.pendingSummary; card.append(detail); }
  if (status.nextTargetId && !status.completed && onMark) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Mark next step'; button.onclick = () => onMark(status.nextTargetId); card.append(button);
  }
  parent.append(card); return card;
}
