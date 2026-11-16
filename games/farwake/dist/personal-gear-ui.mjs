/** A small personal shelf inside the existing outfitter and captain menus. */
import { PERSONAL_WEAPONS } from './combat.mjs';
import { escapeHtml as esc, fmt } from './ui.mjs';

export function createPersonalGearUI({ getGame, dialog, invoke, acceptResult = answer => answer?.ok, onChange = () => {}, markMechanic = () => {} }) {
  let pending = false;
  function render() {
    const previous = dialog.body.querySelector('[data-personal-gear]');
    const game = getGame(), identity = game.state.multiplayer?.captainId || game.state.seed, revision = dialog.revision;
    const section = document.createElement('section'); section.dataset.personalGear = '';
    section.innerHTML = `<p><strong>${fmt(game.state.credits)} credits available</strong></p><p class="section-note">Your personal weapons stay with your captain aboard any ship. Faction rifles are issued when you enlist. Requisition specialist weapons at your service desk or field armory after 2 and 5 military assignments. Civilian purchases use your credits. Every weapon recharges between shots.</p>`;
    const feedback = document.createElement('p'); feedback.className = 'mini'; feedback.setAttribute('role', 'status');
    for (const weapon of PERSONAL_WEAPONS.filter(weapon=>!weapon.factionId||weapon.factionId===game.state.professions?.careers?.military?.factionId&&game.state.professions?.careers?.military?.enlisted||game.state.person.ownedWeapons.includes(weapon.id))) {
      const info = game.personalWeaponInfo(weapon.id), card = document.createElement('article');
      card.className = 'entry-card' + (info.equipped ? ' done' : ''); card.dataset.personalWeapon = weapon.id;
      const requirements = weapon.factionId ? `${weapon.factionId==='freewake'?'Freewake Union':'Meridian Combine'} issue · ${weapon.serviceAssignments?`${game.state.professions?.careers?.military?.completed||0} completed · requires ${weapon.serviceAssignments} military assignments`:'Issued on enlistment'}` : weapon.requiredJobs ? `${info.progress.completed}/${weapon.requiredJobs} completed jobs or service assignments · ${info.progress.systems}/${weapon.requiredSystems} explored star systems` : 'Included with your airlock kit.';
      card.innerHTML = `<div class="entry-top"><h3 class="entry-title">${esc(weapon.name)}</h3><span class="pill">${info.equipped ? 'Equipped' : info.owned ? 'Owned' : 'Personal weapon'}</span></div>
        <p>${esc(weapon.description)}</p><p class="mini">${weapon.damage} damage · ${weapon.cooldown.toFixed(2)} s between shots · ${weapon.range} range${weapon.armorPiercing ? ` · Pierces ${weapon.armorPiercing} armor` : ''}</p>
        <p class="mini">${esc(requirements)}</p><div class="entry-foot"><span class="cost">${info.owned ? 'Owned' : weapon.factionId ? 'Service issue · Free' : `${fmt(weapon.cost)} CR`}</span><button type="button" data-personal-action="${info.owned ? 'equip' : 'buy'}" ${pending || !info.ok ? 'disabled' : ''}>${info.equipped ? 'Equipped' : info.owned ? 'Equip' : weapon.factionId ? 'Requisition & equip' : 'Buy & equip'}</button></div>
        ${!info.ok && !info.equipped ? `<p class="mini muted">${esc(info.reason)}</p>` : ''}`;
      card.querySelector('button').onclick = async () => {
        if (pending) return;
        pending = true; feedback.textContent = info.owned ? 'Equipping your weapon…' : 'Purchasing your weapon…';
        for (const button of section.querySelectorAll('button')) button.disabled = true;
        try {
          const answer = await invoke(info.owned ? 'equipPersonalWeapon' : 'buyPersonalWeapon', { id: weapon.id });
          if (getGame() !== game || (getGame().state.multiplayer?.captainId || getGame().state.seed) !== identity) return;
          const accepted = acceptResult(answer); onChange();
          if (dialog.revision !== revision || section.parentNode !== dialog.body) return;
          if (accepted) { pending = false; render(); }
          else feedback.textContent = answer?.reason || answer?.message || 'The outfitter could not complete that request.';
        } catch { if (section.parentNode === dialog.body) feedback.textContent = 'The outfitter could not be reached. Try again.'; }
        finally {
          pending = false;
          for (const button of dialog.body.querySelectorAll('[data-personal-gear] [data-personal-action]')) {
            const id = button.closest('[data-personal-weapon]').dataset.personalWeapon; button.disabled = !getGame().personalWeaponInfo(id).ok;
          }
        }
      };
      section.append(card);
    }
    section.append(feedback); if (previous?.parentNode === dialog.body) previous.replaceWith(section); else dialog.body.append(section);
    return section;
  }
  function open() {
    const game = getGame();
    dialog.open('Personal gear', 'personal-gear', { eyebrow: 'CAPTAIN’S EQUIPMENT' });
    render();
    const choices = [];
    if (game.atInhabitedPort) choices.push({ label: 'Find the outfitter', detail: 'Buy and equip personal weapons at the port workshop.', action: () => { dialog.close(); markMechanic(); } });
    else dialog.body.insertAdjacentHTML('beforeend', '<p class="section-note">Change your carried weapon at an outfitter, your faction’s service desk, or a friendly field armory.</p>');
    choices.push({ label: 'Back to the world', action: () => dialog.close() });
    dialog.choices(choices);
  }
  return { render, open };
}
