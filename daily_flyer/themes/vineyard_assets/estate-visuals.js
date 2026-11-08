/**
 * Original, state-driven illustrations for Vineyard Table's player mat.
 * No game decisions are made here: every token, vine and worker comes from the
 * public player record. Native details expose building explanations on touch
 * and keyboard; optional buttons open the application's existing action sheet.
 */

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const titleCase = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const count = (value, maximum = 12) => Math.max(0, Math.min(maximum, Math.trunc(finite(value))));
const array = value => Array.isArray(value) ? value : [];
const safeColor = value => /^#[\da-f]{3,8}$/i.test(String(value || '')) ? value : '#9dbb90';
const validValues = values => new Set(array(values).filter(value => Number.isInteger(value) && value >= 1 && value <= 9));

const BUILDINGS = [
  { id: 'trellis', name: 'Trellis', cost: 2, description: 'The framework that supports trellis-loving vines. One trellis serves your whole estate.' },
  { id: 'irrigation', name: 'Irrigation', cost: 3, description: 'Water for the vines that require irrigation. One irrigation system serves every field.' },
  { id: 'yoke', name: 'Yoke', cost: 2, description: 'A private worker space: harvest a field or return a planted vine to your hand, once each year in summer or winter.' },
  { id: 'cottage', name: 'Cottage', cost: 4, description: 'Welcome a second visitor every autumn. Choose summer visitors, winter visitors, or one of each.' },
  { id: 'medium_cellar', name: 'Medium cellar', cost: 4, description: 'Open values 4–6 in your cellar and begin making blush wine.' },
  { id: 'large_cellar', name: 'Large cellar', cost: 6, description: 'Open values 7–9 and sparkling wine. Build the medium cellar first.', requires: 'medium_cellar' },
  { id: 'windmill', name: 'Windmill', cost: 5, description: 'The first vine you plant each year earns 1 reputation point.' },
  { id: 'tasting_room', name: 'Tasting room', cost: 6, description: 'With wine in your cellar, your first vineyard tour each year earns 1 reputation point.' },
];

function svg(content, className, viewBox = '0 0 140 96') {
  return `<svg class="${className}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true" focusable="false">${content}</svg>`;
}

function lockIcon() {
  return svg('<path d="M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4z" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M12 15v3" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>', 'cell-lock', '0 0 24 24');
}

function crest(letter, esc) {
  return svg(`<path d="M10 7h44v26c0 17-22 27-22 27S10 50 10 33V7Z" fill="#bca378" stroke="#584b35" stroke-width="2"/><path d="M14 11h36v21c0 13-18 23-18 23S14 45 14 32V11Z" fill="#ded0a9" stroke="#8f7a53"/>
    <path d="M18 20c7-8 19-8 28 0M20 44c7 6 17 6 24 0" stroke="#82885b" stroke-width="2" stroke-linecap="round"/>
    <path d="M19 22c-5 0-5 5 0 5 2-3 2-3 0-5Zm26 0c5 0 5 5 0 5-2-3-2-3 0-5ZM22 45c-5-1-5-5 0-4 2 2 2 2 0 4Zm20 0c5-1 5-5 0-4-2 2-2 2 0 4Z" fill="#7b875a"/>
    <text x="32" y="39" text-anchor="middle" fill="#635239" font-family="Georgia,serif" font-size="24">${esc(letter)}</text>`, 'estate-crest-art', '0 0 64 66');
}

function meeple(grande = false) {
  const body = grande
    ? 'M22 3a7 7 0 0 0-6 11L4 25l5 7 7-6-5 23h10l3-12 3 12h10l-5-23 7 6 5-7-12-11a7 7 0 0 0-10-11Z'
    : 'M22 4a6 6 0 0 0-5 10L6 25l5 6 6-5-4 21h9l2-11 2 11h9l-4-21 6 5 5-6-11-11a6 6 0 0 0-9-10Z';
  return svg(`<ellipse cx="25" cy="50" rx="17" ry="3" fill="#332715" opacity=".2"/><path d="${body}" fill="var(--estate-color,#9dbb90)" stroke="#443c2b" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M19 7c3-3 6-2 7 1M12 24l7-7M18 29l-3 15M30 29l3 15" stroke="#fff9db" stroke-width="1.3" opacity=".46" stroke-linecap="round"/>
    <path d="M21 20c6 1 8 7 5 11M22 41l1-5M17 25c5-2 10 0 14 3" stroke="#4b4b32" opacity=".16" stroke-width="1.1" stroke-linecap="round"/>${grande ? '<text x="25" y="28" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="12" fill="#302c20">G</text>' : ''}`, 'estate-meeple-art', '0 0 50 55');
}

function fallbackIcon(name) {
  const paths = {
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/>',
    trophy: '<path d="M8 3h8v7c0 6-8 6-8 0V3ZM8 5H4v3c0 3 4 4 4 4m8-7h4v3c0 3-4 4-4 4m-4 2v7m-4 0h8"/>',
    wine: '<path d="M7 3h10l1 7c0 8-12 8-12 0l1-7ZM7 9h10m-5 7v5m-4 0h8"/>',
  };
  return svg(`<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.wine}</g>`, 'ui-icon', '0 0 24 24');
}

function barrel(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-8-15Q-13 0-8 15H8Q13 0 8-15Z" fill="#ad7c49" stroke="#674d32" stroke-width="1.5"/><path d="M-8-9H8M-10 8H10" stroke="#4e5145" stroke-width="3"/><path d="M-4-12v24m8-24v24" stroke="#d2a36a" stroke-width="1" opacity=".7"/><ellipse cx="0" cy="-15" rx="8" ry="2.5" fill="#d0a474" stroke="#674d32"/></g>`;
}

function buildingArt(id) {
  const base = '<ellipse cx="70" cy="82" rx="53" ry="7" fill="#6e6548" opacity=".18"/><path d="M10 82c14-6 25-6 36-2 21-8 51-4 82 2" stroke="#93906b" stroke-width="2" stroke-linecap="round"/>';
  let drawing = '';
  switch (id) {
    case 'trellis':
      drawing = '<path d="M27 78V22m43 56V22m43 56V22" stroke="#715336" stroke-width="6"/><path d="M22 30h96M22 49h96" stroke="#9e8359" stroke-width="3"/><path d="M28 73c14-24 10-46 40-39 19 7 29-6 44-10M71 77c-6-14-2-27 12-31" stroke="#536b3f" stroke-width="3"/>' + [33, 50, 65, 83, 100, 110].map((x, i) => `<path d="M${x} ${i % 2 ? 34 : 46}c-10-11-18-3-7 4 4 2 8-1 7-4Zm0 0c8-12 17-8 11-1-3 5-6 5-11 1Z" fill="${i % 2 ? '#8c9d63' : '#647e4c'}"/>`).join('') + '<g fill="#824d57"><circle cx="43" cy="49" r="3"/><circle cx="49" cy="49" r="3"/><circle cx="46" cy="55" r="3"/><circle cx="89" cy="37" r="3"/><circle cx="95" cy="37" r="3"/><circle cx="92" cy="43" r="3"/></g>';
      break;
    case 'irrigation':
      drawing = '<path d="M25 64v17h48V64" fill="#b8ad91" stroke="#786e56" stroke-width="2"/><ellipse cx="49" cy="64" rx="24" ry="8" fill="#786d53" stroke="#bcb296" stroke-width="4"/><ellipse cx="49" cy="66" rx="16" ry="3" fill="#7caaaf"/><path d="M29 59V28m41 31V28" stroke="#715b39" stroke-width="5"/><path d="M20 31 49 12l31 19Z" fill="#a7754b" stroke="#775536" stroke-width="2"/><path d="M49 31v27m-10-20h20" stroke="#796244" stroke-width="2"/><path d="M34 72h29m-34 5h38M39 68v5m17 0v7" stroke="#8c8268"/><path d="M73 73h22v-8h24" stroke="#b1a383" stroke-width="9"/><path d="M73 71h22v-8h24" stroke="#70a4ad" stroke-width="4"/><path d="M119 62v15m-3-7v10m7-10v9" stroke="#89b3b9" stroke-width="2"/>';
      break;
    case 'yoke':
      drawing = '<path d="M22 31q47-15 96 0l-2 11q-43-14-91 0Z" fill="#b38c54" stroke="#705232" stroke-width="2"/><path d="M35 37v21c0 15 24 15 24 0V36m25 1v21c0 15 24 15 24 0V39" stroke="#715330" stroke-width="7"/><path d="M37 37v20c0 11 18 11 18 0V36m31 1v21c0 11 18 11 18 0V39" stroke="#d2af71" stroke-width="2"/><path d="M71 31v32l-16 14m16-14 19 16" stroke="#53594c" stroke-width="3"/><path d="M52 73 36 82h26l8-9m17 1 17 9H80l-7-10" fill="#8a8e78" stroke="#53594c" stroke-width="1.5"/><circle cx="72" cy="31" r="4" fill="#5d654f"/>';
      break;
    case 'cottage':
      drawing = '<path d="M29 80V43h64v37" fill="#dfc498" stroke="#90734c" stroke-width="2"/><path d="M25 43 61 16l38 27Z" fill="#af7352" stroke="#835337" stroke-width="2"/><path d="M77 23V10h10v21" fill="#c6a377" stroke="#8b704d" stroke-width="2"/><path d="M27 40h67M35 34h50M45 27h32" stroke="#d3956a" opacity=".8"/><path d="M54 80V58a9 9 0 0 1 18 0v22" fill="#716b4c" stroke="#8b704d" stroke-width="2"/><path d="M36 50h11v13H36zm44 0h10v13H80Z" fill="#688676" stroke="#8a744f"/><path d="M40 51v11m44-11v11" stroke="#c5af85"/><path d="M103 80V50" stroke="#66533a" stroke-width="4"/><path d="M102 25c-19 15-17 34 0 39 22-2 20-29 0-39Z" fill="#71845a"/><path d="M102 35c-11 13-9 24 0 26" stroke="#92a570" stroke-width="2"/>';
      break;
    case 'medium_cellar':
    case 'large_cellar': {
      const large = id === 'large_cellar';
      drawing = `<path d="M17 80V41q${large ? '53-45 106' : '53-36 106'} 0v39Z" fill="#bbb08d" stroke="#817654" stroke-width="2"/><path d="M20 43q50-35 100 0M22 53h96M20 65h100M39 35v14m23-22v26m24-21v21m22-11v12M34 54v11m22-11v11m23-11v11m23-11v11M44 66v13m47-13v13" stroke="#91876a" stroke-width="1.2"/>${large ? '<path d="M29 79V53a12 12 0 0 1 24 0v26m34 0V53a12 12 0 0 1 24 0v26" fill="#5a5c43" stroke="#8b7a55" stroke-width="3"/>' : ''}<path d="M${large ? 59 : 49} 81V53a${large ? 11 : 21} ${large ? 11 : 21} 0 0 1 ${large ? 22 : 42} 0v28Z" fill="#4d5140" stroke="#907d56" stroke-width="4"/><path d="M${large ? 59 : 49} 80h${large ? 22 : 42}" stroke="#d6c69d" stroke-width="3"/>${large ? barrel(41, 67, .48) + barrel(100, 67, .48) : barrel(61, 68, .58) + barrel(81, 68, .58)}<path d="M20 81h100" stroke="#95886a" stroke-width="3"/>`;
      break;
    }
    case 'windmill':
      drawing = '<path d="M48 82 56 32h30l9 50Z" fill="#d9c49a" stroke="#8f7954" stroke-width="2"/><path d="M52 32 71 14l20 18Z" fill="#a5724f" stroke="#775738" stroke-width="2"/><path d="M64 82V64a7 7 0 0 1 14 0v18" fill="#696b4e"/><path d="M58 49h27M56 59h30M54 71h34" stroke="#b7a17a"/><g transform="translate(71 36) rotate(33)"><path d="M-4-32h8V32h-8ZM-32-4h64v8h-64Z" fill="#ac8451" stroke="#675334" stroke-width="1.5"/><path d="M5-29h10v21H5ZM8 5h21v10H8ZM-15 8h10v21h-10ZM-29-15h21v10h-21Z" fill="#d8cba1" stroke="#82714c" stroke-width="1.5"/><path d="M5-22h10m-10 7h10M15 5v10m7-10v10m-37 0h10m-10 7h10m-17-37v10m7-10v10" stroke="#9a875b"/><circle r="5" fill="#6e5b3e"/></g>';
      break;
    case 'tasting_room':
      drawing = '<path d="M18 80V40h62v40" fill="#d9ba8f" stroke="#8e714f" stroke-width="2"/><path d="M14 40 48 17l37 23Z" fill="#b47d58" stroke="#815638" stroke-width="2"/><path d="M23 44v26m52-26v27M20 47h58" stroke="#b19063"/><path d="M40 80V56a10 10 0 0 1 20 0v24" fill="#636b4b"/><path d="M79 49h45M85 49v33m34-33v33M78 47l7-10h34l7 10Z" fill="#b0ac7d" stroke="#79794e" stroke-width="2"/><path d="M80 49c8-11 15 7 24-3 8-10 13 6 20 0" stroke="#698151" stroke-width="4"/><ellipse cx="102" cy="66" rx="15" ry="5" fill="#bd9869" stroke="#85623e"/><path d="M102 67v15m-19-11v11m38-11v11M96 59v6m12-6v6" stroke="#7a6041" stroke-width="2"/><path d="M93 54h6l-1 6h-4Zm12 0h6l-1 6h-4Z" fill="#9c6a70" stroke="#d8c79f"/>';
      break;
  }
  return svg(base + drawing, 'building-miniature');
}

function vinePlant(x, y, scale, red, white, harvested) {
  const fruit = harvested ? '' : `${red ? '<g fill="#93465a" stroke="#673c48" stroke-width=".6"><circle cx="-5" cy="-5" r="2.3"/><circle cx="-1" cy="-5" r="2.3"/><circle cx="-3" cy="-1" r="2.2"/></g>' : ''}${white ? '<g fill="#d8c479" stroke="#9a9451" stroke-width=".6"><circle cx="3" cy="-7" r="2.2"/><circle cx="7" cy="-7" r="2.2"/><circle cx="5" cy="-3" r="2.1"/></g>' : ''}`;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 4V-12m0 5-7-6m7 5 8-7" stroke="#75613b" stroke-width="1.9" stroke-linecap="round"/><path d="M-1-10c-10-13-16-5-7 0 3 2 5 2 7 0Zm1-2c8-15 16-8 10-1-4 4-7 4-10 1Z" fill="${harvested ? '#8d9160' : '#6e894e'}" stroke="#596d3d" stroke-width=".7"/>${fruit}</g>`;
}

function fieldArt(field) {
  const vines = array(field.vines), sold = Boolean(field.sold);
  let art = '<path d="M0 0h160v112H0Z" fill="#c9c0a0"/><path d="M0 20Q34 4 70 20t90-7V112H0Z" fill="#abb086"/><path d="M0 36Q46 8 99 30t61 4V112H0Z" fill="#8f9b70"/><path d="m6 107 34-69 96 4 19 63Z" fill="#a58d60" stroke="#706943" stroke-width="1.5"/>';
  const rows = Math.max(3, vines.length), spacing = Math.min(13, 62 / Math.max(1, rows - 1));
  for (let row = 0; row < rows; row++) {
    const y = 48 + row * spacing;
    const left = 39 - row * 4.4, right = 135 + row * 2.3;
    art += `<path d="M${left} ${y + 2}Q82 ${y - 7} ${Math.min(150, right)} ${y + 1}" stroke="#786740" stroke-width="3.4" opacity=".68"/><path d="M${left} ${y - 1}Q82 ${y - 10} ${Math.min(150, right)} ${y - 2}" stroke="#c5ab72" stroke-width="2"/>`;
    if (!sold && row < vines.length) {
      const vine = vines[row];
      art += `<path d="M${left + 5} ${y - 10}Q84 ${y - 18} ${Math.min(146, right - 4)} ${y - 11}" stroke="#716541" stroke-width=".9"/>`;
      for (let plant = 0; plant < 5; plant++) {
        const x = left + 8 + plant * (right - left - 17) / 4;
        art += vinePlant(x, y - 1 - Math.sin(plant / 4 * Math.PI) * 4, .56 + row * .055, finite(vine.red) > 0, finite(vine.white) > 0, Boolean(field.harvested));
      }
    }
  }
  art += '<path d="M7 109 38 38M153 110 139 40" stroke="#bbb394" stroke-width="4"/><path d="M8 108 39 38M153 108 138 40" stroke="#6f7256" stroke-width=".7" stroke-dasharray="3 4"/><path d="M16 39V18" stroke="#656343" stroke-width="3"/><path d="M16 8c-11 8-12 22 0 24 12-4 11-18 0-24Z" fill="#697b50"/>';
  if (sold) art += '<path d="M76 78V53m25 25V53" stroke="#705335" stroke-width="3"/><path d="m65 49 45-2 1 21-46 2Z" fill="#d4be91" stroke="#8a6b42" stroke-width="1.5"/><path d="m73 55 29 7m-29 1 29-9" stroke="#9f694d" stroke-width="2.5"/>';
  if (field.harvested && !sold && vines.length) art += '<path d="M13 89h15l-2 14H16Z" fill="#ad8151" stroke="#705637"/><path d="M13 93h15m-14 5h13m-10-9v14m6-14v14" stroke="#d0a36a" stroke-width="1"/>';
  return svg(art, 'field-miniature', '0 0 160 112');
}

function renderField(field, index, esc) {
  const vines = array(field.vines);
  const red = vines.reduce((sum, vine) => sum + finite(vine.red), 0);
  const white = vines.reduce((sum, vine) => sum + finite(vine.white), 0);
  const capacity = finite(field.capacity), fieldNumber = finite(field.id, index) + 1;
  const state = field.sold ? 'sold' : field.harvested && vines.length ? 'harvested' : vines.length ? 'planted' : 'empty';
  const status = { sold: 'Sold land', harvested: 'Harvested', planted: 'Vines planted', empty: 'Open soil' }[state];
  const yieldText = [red ? `${red} red` : '', white ? `${white} white` : ''].filter(Boolean).join(' + ');
  const description = `Field ${fieldNumber}, capacity ${capacity}. ${field.sold ? 'Sold; buy it back before planting.' : vines.length ? `${vines.length} vine${vines.length === 1 ? '' : 's'}; yield ${yieldText}. ${field.harvested ? 'Already harvested this year.' : 'Not yet harvested this year.'}` : 'Empty and available for planting.'}`;
  return `<section class="vineyard-plot" data-state="${state}" aria-label="${esc(description)}">
    <div class="plot-heading"><strong>Field ${fieldNumber}</strong><span class="plot-capacity" title="${red + white} planted value of ${capacity} capacity">${red + white}<i>/</i>${capacity}</span></div>
    <div class="plot-scene">${fieldArt(field)}</div>
    <div class="plot-status">${status}</div>
    <div class="plot-yield">${field.sold ? `<span class="yield-land">${capacity} lira to reclaim</span>` : vines.length ? `${red ? `<span class="yield-red"><i aria-hidden="true"></i>${red} red</span>` : ''}${white ? `<span class="yield-white"><i aria-hidden="true"></i>${white} white</span>` : ''}` : '<span class="yield-land">Room to grow</span>'}</div>
    ${vines.length ? `<ul class="plot-vine-list" aria-label="Planted vines">${vines.map(vine => `<li title="${esc(`${vine.name}: ${vine.red || 0} red, ${vine.white || 0} white`)}">${esc(vine.name)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function track(type, inputValues, { wine, cap, esc, words }) {
  const values = validValues(inputValues), minimum = wine && type === 'blush' ? 4 : wine && type === 'sparkling' ? 7 : 1;
  const name = `${words(type)} ${wine ? 'wine' : 'grapes'}`;
  const summary = values.size ? `Stored values: ${[...values].sort((a, b) => a - b).join(', ')}.` : 'No tokens stored.';
  const minNote = minimum > 1 ? ` · ${minimum}+` : '';
  return `<div class="value-track" data-type="${type}" data-resource="${wine ? 'wine' : 'grape'}" role="group" aria-label="${esc(`${name}. ${summary}`)}">
    <div class="track-heading"><span class="track-name"><i class="track-swatch is-${type}" aria-hidden="true"></i>${esc(words(type))}${minNote}</span><span class="track-inventory">${values.size} ${values.size === 1 ? 'token' : 'tokens'}</span></div>
    <ol class="track-cells" aria-label="${esc(name)} value track">${Array.from({ length: 9 }, (_, i) => {
      const value = i + 1, occupied = values.has(value), inapplicable = value < minimum, locked = wine && value > cap && !inapplicable;
      const status = occupied ? `Stored ${wine ? 'wine' : 'grape'}.` : inapplicable ? `${words(type)} starts at value ${minimum}.` : locked ? `Requires the ${value > 6 ? 'large' : 'medium'} cellar.` : 'Empty space.';
      const label = `${name}, value ${value}. ${status}`;
      return `<li class="track-cell${occupied ? ' is-occupied' : ''}${locked ? ' is-locked' : ''}${inapplicable ? ' is-inapplicable' : ''}${wine && [4, 7].includes(value) ? ' is-boundary' : ''}" data-value="${value}" aria-label="${esc(label)}" title="${esc(label)}"${occupied || locked && [4, 7].includes(value) ? ' tabindex="0"' : ''}>
        <span class="track-number" aria-hidden="true">${inapplicable ? '·' : value}</span>
        ${occupied ? `<span class="glass-bead is-${type}" aria-hidden="true"><span class="bead-value">${value}</span></span>` : locked ? lockIcon() : ''}
        ${occupied || locked && [4, 7].includes(value) ? `<span class="cell-tip" aria-hidden="true">${esc(occupied ? `${words(type)} ${value}` : `${value > 6 ? 'Large' : 'Medium'} cellar needed`)}</span>` : ''}
      </li>`;
    }).join('')}</ol>
  </div>`;
}

function renderWorkers(player, esc) {
  const workers = player.workers || {};
  const available = count(workers.available, 7), pending = count(workers.pending, 5), total = Math.max(1, count(workers.total, 6));
  const temporary = count(workers.temporary, 1);
  const activeRegular = Math.max(available, total - 1 - pending + temporary);
  const grandeReady = Boolean(workers.grandeAvailable), ready = available + Number(grandeReady);
  const spent = Math.max(0, activeRegular - available) + Number(!grandeReady);
  const label = `${available} regular and ${grandeReady ? 1 : 0} grande ready. ${spent} used.${pending ? ` ${pending} joining next year.` : ''}${temporary ? ' Includes one temporary regular worker for this year.' : ''}`;
  return `<section class="mat-workers" aria-label="${esc(label)}">
    <div class="mat-section-title"><h3>Worker reserve</h3><small>${ready} ready <span aria-hidden="true">/</span> ${activeRegular + 1} active</small></div>
    <div class="worker-tray">${Array.from({ length: activeRegular }, (_, i) => `<span class="estate-meeple${i >= available ? ' is-spent' : ''}" role="img" aria-label="Regular worker ${i + 1}: ${i < available ? 'ready' : 'used this year'}" title="${i < available ? 'Ready regular worker' : 'Regular worker already placed'}">${meeple()}</span>`).join('')}
      <span class="estate-meeple is-grande${grandeReady ? '' : ' is-spent'}" role="img" aria-label="Grande worker: ${grandeReady ? 'ready; may use an occupied action' : 'used this year'}" title="${grandeReady ? 'Your grande can use a full action' : 'Grande already placed'}">${meeple(true)}</span>
      ${Array.from({ length: pending }, () => `<span class="estate-meeple is-training" role="img" aria-label="Worker training: available next year" title="Joins next year">${meeple()}<span class="training-mark" aria-hidden="true">+1</span></span>`).join('')}
    </div>
    <p class="mat-worker-caption">${available} regular · ${grandeReady ? 'grande ready' : 'grande placed'}${spent ? ` · ${spent} used` : ''}${temporary ? ' · 1 seasonal helper' : ''}${pending ? ` · ${pending} in training` : ''}</p>
  </section>`;
}

function renderBuildings(player, mine, esc) {
  const owned = new Set(array(player.structures));
  return `<section class="mat-section mat-structures"><div class="mat-section-title"><h3>The estate buildings</h3><small>${owned.size} of 8 built</small></div>
    <div class="mat-buildings">${BUILDINGS.map(building => {
      const built = owned.has(building.id), prerequisiteMissing = building.requires && !owned.has(building.requires);
      return `<details class="building-tile ${built ? 'is-built' : 'is-unbuilt'}" data-structure="${building.id}">
        <summary aria-label="${esc(`${building.name}. ${built ? 'Built' : `${building.cost} lira to build`}. Expand for details.`)}">
          <span class="building-art">${buildingArt(building.id)}</span>
          <span class="building-name">${building.name}</span>
          <span class="building-state">${built ? '<span class="built-seal" aria-hidden="true">✓</span> Built' : `<span class="building-cost">${building.cost}<small> lira</small></span>`}</span>
        </summary>
        <div class="building-information"><p class="building-description">${esc(building.description)}</p>${!built && prerequisiteMissing ? '<small class="building-prerequisite">Medium cellar required first.</small>' : ''}
          ${mine && !built ? `<button type="button" class="building-action" data-act="action-group" data-group="build">Explore building choices</button>` : ''}
        </div>
      </details>`;
    }).join('')}</div>
  </section>`;
}

/** Return the player mat only; the caller owns its surrounding panel and card CTA. */
export function renderVisualEstate(player, { mine = false, esc = escapeHTML, icon = fallbackIcon, words = titleCase } = {}) {
  if (!player || typeof player !== 'object') return '';
  const cap = [3, 6, 9].includes(Number(player.cellar)) ? Number(player.cellar) : 3;
  const fields = array(player.fields), color = safeColor(player.color), grapes = player.grapes || {}, wines = player.wines || {};
  const name = String(player.name || 'Vineyard estate'), initial = [...name.trim()][0]?.toUpperCase() || 'V';
  const note = cap === 3 ? 'Small cellar · values 1–3' : cap === 6 ? 'Medium cellar · values 1–6' : 'Large cellar · values 1–9';
  return `<article class="estate-mat" data-owner="${esc(player.id || '')}" data-mine="${mine}" style="--estate-color:${esc(color)}" aria-label="${esc(`${name}'s vineyard mat`)}">
    <header class="mat-header"><div class="mat-title"><span class="eyebrow">${mine ? 'YOUR VINEYARD' : 'AROUND THE TABLE'}</span><h2>${esc(name)}</h2></div><div class="estate-crest">${crest(initial, esc)}</div></header>
    <div class="mat-counters" aria-label="Estate resources">
      <div class="mat-counter is-coins"><span class="counter-piece">${icon('coin')}<strong>${finite(player.coins)}</strong></span><small>Lira</small></div>
      <div class="mat-counter is-vp"><span class="counter-piece">${icon('trophy')}<strong>${finite(player.score)}</strong></span><small>Reputation</small></div>
      <div class="mat-counter is-income"><span class="counter-piece">${icon('wine')}<strong>+${finite(player.income)}</strong></span><small>Each year</small></div>
    </div>
    ${renderWorkers(player, esc)}
    <section class="mat-section mat-fields"><div class="mat-section-title"><h3>Vineyard plots</h3><small>Vines stay planted</small></div><div class="mat-plots">${fields.map((field, i) => renderField(field, i, esc)).join('')}</div></section>
    <section class="mat-section mat-crush-pad"><div class="mat-section-title"><h3>The crush pad</h3><small>Harvested grapes</small></div>${['red', 'white'].map(type => track(type, grapes[type], { wine: false, cap: 9, esc, words })).join('')}</section>
    <section class="mat-section mat-cellar"><div class="mat-section-title"><h3>Wine cellar</h3><small>${esc(note)}</small></div>
      <div class="cellar-gates" aria-label="Cellar storage levels">${[{ cap: 3, name: 'Small', values: '1–3' }, { cap: 6, name: 'Medium', values: '4–6' }, { cap: 9, name: 'Large', values: '7–9' }].map(level => `<span class="cellar-gate ${cap >= level.cap ? 'is-open' : 'is-locked'}" aria-label="${level.name} cellar: ${cap >= level.cap ? 'open' : 'not built'}; values ${level.values}"><strong>${level.name}</strong><small>${level.values} ${cap >= level.cap ? '<span aria-hidden="true">✓</span>' : lockIcon()}</small></span>`).join('')}</div>
      ${['red', 'white', 'blush', 'sparkling'].map(type => track(type, wines[type], { wine: true, cap, esc, words })).join('')}
      <p class="mat-rack-note">Each bead is one grape or wine. At year-end, eligible beads move one space higher. Full spaces and cellar walls stop aging.</p>
    </section>
    ${renderBuildings(player, mine, esc)}
  </article>`;
}
