import {escapeHtml as esc} from './ui.mjs';
import {systemIdentity} from './system-identity.mjs';
import {isShipBossActor} from './ship-bosses.mjs';

export function systemActivitiesMarkup(system) {
  const identity=systemIdentity(system);if(!identity)return '';
  return `<h4>Reasons to visit</h4><ul>${identity.activities.map(activity=>`<li>${esc(activity.label)} <span class="mini muted">· ${esc(system.bodies?.find(body=>body.id===activity.bodyId)?.name||'Local routes')}</span></li>`).join('')}</ul>`;
}

export function appendAftermathStatus(parent,game,openStories) {
  const status=game.earthAftermathStatus?.();if(!status?.truthKnown)return;
  const card=document.createElement('section');card.className='entry-card';
  card.innerHTML=`<span class="eyebrow">THE EARTH INVESTIGATION</span><h3>${status.completed?'Your voyage continues':'Decide what comes next'}</h3><p>Public account: ${esc(status.account?.label||'Undecided')}<br>Allegiance: ${esc(status.allegiance?.label||'Undecided')}</p>${status.nextThreads?.length?`<p>${status.nextThreads.map(thread=>esc(thread.title)).join(' · ')}</p>`:''}${status.agreements?.length?`<p class="mini">Active agreements: ${status.agreements.map(item=>esc(item.label)).join(' · ')}</p>`:''}`;
  const button=document.createElement('button');button.textContent='Open continuing stories';button.onclick=openStories;card.append(button);parent.append(card);
}

export function appendShipBossContacts(parent,game,onTrack) {
  for(const boss of game.system.enemies.filter(enemy=>isShipBossActor(enemy)&&!enemy.shipBossPart&&enemy.hp>0)){
    const card=document.createElement('section');card.className='entry-card';
    card.innerHTML=`<span class="eyebrow">OPTIONAL HEAVY CONTACT</span><h3>${esc(boss.name)}</h3><p>${esc(boss.bossObjective)}</p><p class="mini muted">A dangerous vessel outside the ordinary approaches. You can leave it alone or withdraw from its patrol area.</p>`;
    const button=document.createElement('button');button.textContent='Track heavy contact';button.onclick=()=>onTrack(boss);card.append(button);parent.append(card);
  }
}
