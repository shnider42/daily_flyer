/** Biological field creatures. People, machines, factions and hostile intent remain separate facts. */
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const palette = (body, shade, light, accent) => ({ body, shade, light, accent });
const creature = (id, name, bodyPlan, habitats, combatProfile, behavior, colors, details) => ({
  id, name, kind: 'biological', bodyPlan, habitats, combatProfile, behavior,
  color: colors.body, palette: colors, randomSpawn: true, peacefulEligible: false, ...details
});

/** Combat timings live in creature-rules; these rows describe identity and the readable encounter. */
export const CREATURES = freeze({
  stoneback: creature('stoneback', 'Stoneback', 'Low plated quadruped',
    ['limestone', 'glacial', 'service-tunnel'], 'fast-melee', 'shell-slam',
    palette('#a5967e', '#665f55', '#c7baa0', '#d8be84'), {
      disposition: 'Territorial mineral grazer', peacefulEligible: true,
      ecology: 'Scrapes mineral growth from stone. A warm service tunnel can shelter an individual without making it an invader.',
      tell: 'It plants its feet and braces the broad shell before a close slam.',
      counterplay: 'Move around its planted front, stay outside the slam, and use its recovery.',
      shortHint: 'Braced shell: move to its side.'
    }),
  skitter: creature('skitter', 'Cave skitter', 'Small many-legged scavenger',
    ['limestone', 'root-grotto', 'service-tunnel'], 'fast-melee', 'skitter-burst',
    palette('#a7b391', '#566d5c', '#d0d8b5', '#e3c993'), {
      disposition: 'Defensive scavenger', peacefulEligible: true,
      ecology: 'Lives around scraps and broken growth. Nest defense can turn a small scavenger into a close threat.',
      tell: 'Its legs bunch together before a quick two-part bite.',
      counterplay: 'Keep moving through both bites; the first pause does not end its attack.',
      shortHint: 'Quick double bite: keep moving.'
    }),
  bellwether: creature('bellwether', 'The Bellwether', 'Massive pale cavern hunter',
    ['tinbell-hollow'], 'bellwether', 'bellwether',
    palette('#929185', '#535b5c', '#d4cec0', '#dfb487'), {
      disposition: 'Singular documented threat', randomSpawn: false,
      ecology: 'The named creature in Tinbell’s hollow retains its authored encounter. Its presence is not a generic cave population rule.',
      tell: 'Its large body gathers itself before a committed lunge.',
      counterplay: 'Make space, move across the lunge, and use solid cover or the exit.',
      shortHint: 'A committed lunge: leave its line.'
    }),
  reedstalker: creature('reedstalker', 'Reedstalker', 'Long-legged crested quadruped',
    ['root-grotto', 'tidal'], 'pack-stalker', 'flank-pounce',
    palette('#9aac83', '#526b54', '#d2d4aa', '#d9bd75'), {
      disposition: 'Migration-route defender', peacefulEligible: true,
      ecology: 'Follows roots and wetland corridors. Service fences and blocked migration routes can corner otherwise avoidable animals.',
      tell: 'It moves to the side and lowers its crest before pouncing.',
      counterplay: 'Watch the flank, leave the pounce line, and avoid backing into another animal.',
      shortHint: 'Watch its flank, then its crouch.'
    }),
  'mire-spitter': creature('mire-spitter', 'Mire spitter', 'Squat sac-throated amphibian',
    ['root-grotto', 'tidal'], 'spitter', 'aimed-spit',
    palette('#93b899', '#486c63', '#c0d8ad', '#ded391'), {
      disposition: 'Defensive pool feeder', peacefulEligible: true,
      ecology: 'Feeds along still pools and damp shelves. Its throat secretion also keeps competitors away from feeding patches.',
      tell: 'The throat sac swells while its spit direction settles.',
      counterplay: 'Step sideways after it aims, or put a rock between you and the spit.',
      shortHint: 'Swelling throat: step sideways.'
    }),
  shardling: creature('shardling', 'Shardling', 'Angular mineral-crusted crawler',
    ['limestone', 'glacial'], 'spitter', 'shard-fan',
    palette('#a0c8d2', '#526b88', '#d3e6e4', '#f0d4a0'), {
      disposition: 'Defensive crevice feeder',
      ecology: 'Carries mineral growth on a living body. The reflective shell is not proof of artificial construction or an alien faction.',
      tell: 'The shell opens into three bright lines before a spreading volley.',
      counterplay: 'Move beyond the fan or use cover; leaving only its center line is not enough.',
      shortHint: 'Three spreading lines: clear the fan.'
    }),
  sporeback: creature('sporeback', 'Sporeback', 'Broad cap-backed low crawler',
    ['root-grotto'], 'spitter', 'spore-pulse',
    palette('#c2a6bb', '#76617c', '#e0cbd6', '#cbd9a4'), {
      disposition: 'Defensive fungal browser', peacefulEligible: true,
      ecology: 'Moves through fungal beds and carries a living cap. A defensive spore release belongs to its local ecology.',
      tell: 'It stops and lifts its cap before releasing a close, lingering cloud.',
      counterplay: 'Back beyond the cloud and wait for it to disperse before moving in.',
      shortHint: 'Raised cap: leave the lingering cloud.'
    }),
  glassmaw: creature('glassmaw', 'Glassmaw', 'Long low body with an oversized translucent jaw',
    ['limestone', 'tidal', 'service-tunnel'], 'pack-stalker', 'maw-snap',
    palette('#bccdb3', '#627b72', '#e1e9cf', '#e1bca1'), {
      disposition: 'Ambush predator',
      ecology: 'Uses confined passages and reverberating chambers to approach prey. Strange sounds alone do not establish that one is present.',
      tell: 'The jaw opens wide while the body holds a narrow line.',
      counterplay: 'Move across the line of its snap, then use the pause while the jaw closes.',
      shortHint: 'Open jaw: cross its narrow line.'
    }),
  'ember-mite': creature('ember-mite', 'Ember mite', 'Small segmented body with a glowing heat sac',
    ['lava-tube', 'service-tunnel'], 'fast-melee', 'heat-burst',
    palette('#d99c72', '#794d43', '#f0c491', '#ffe0a0'), {
      disposition: 'Heat-seeking nest defender', peacefulEligible: true,
      ecology: 'Gathers near warm vents and power cable. Mishandled terrariums and broken insulation can bring it into industrial sites.',
      tell: 'The body swells and brightens before a final close heat rupture.',
      counterplay: 'Back away from the swollen body; do not stay beside it to finish a shot.',
      shortHint: 'Swelling heat sac: get clear.'
    }),
  rimehorn: creature('rimehorn', 'Rimehorn', 'Heavy horned quadruped',
    ['glacial'], 'fast-melee', 'horn-charge',
    palette('#a8bec5', '#5d7a8b', '#deebe5', '#b5e0e1'), {
      disposition: 'Territorial cold-adapted browser', peacefulEligible: true,
      ecology: 'Feeds around mineral thaw seams. Its large crown clears crusted ice and makes a threatened charge dangerous.',
      tell: 'It lowers its horned crown and scrapes a straight approach.',
      counterplay: 'Dodge across the charge, not straight away from it; attack after it stops.',
      shortHint: 'Lowered horns: dodge sideways.'
    }),
  tidebell: creature('tidebell', 'Tidebell', 'Buoyant umbrella body with trailing cilia',
    ['tidal'], 'spitter', 'tidal-pulse',
    palette('#86bbc3', '#477b94', '#ceece1', '#e1c1e4'), {
      disposition: 'Defensive brine filter feeder', peacefulEligible: true,
      ecology: 'Drifts along humid brine chambers. A contracting bell drives a local defensive pulse; it is not an atmospheric threat across the whole cave.',
      tell: 'The umbrella contracts and its hanging cilia draw a ring.',
      counterplay: 'Leave the pulse ring instead of chasing it as it retreats.',
      shortHint: 'Closing umbrella: leave its ring.'
    }),
  coilworm: creature('coilworm', 'Coilworm', 'Long linked segments coiled around a narrow head',
    ['limestone', 'lava-tube', 'service-tunnel'], 'pack-stalker', 'coil-lunge',
    palette('#b2a183', '#685c50', '#ded0a8', '#cbd69c'), {
      disposition: 'Tunnel ambush predator',
      ecology: 'Shelters in dry channels and cooled flow tubes. Its long body follows the tunnel; it cannot pass through solid walls.',
      tell: 'The segments pull together before the head extends along a fixed line.',
      counterplay: 'Step aside while it coils and use the pause after its lunge.',
      shortHint: 'Tight coil: step off its line.'
    }),
  'kiln-crab': creature('kiln-crab', 'Kiln crab', 'Wide shielded crab with an oversized claw',
    ['lava-tube'], 'fast-melee', 'armored-scuttle',
    palette('#b68165', '#614d49', '#dbb394', '#efbc7d'), {
      disposition: 'Territorial vent scavenger', peacefulEligible: true,
      ecology: 'Browses cooled vent margins beneath layered plates. Its shell and sideways gait are adaptations to narrow, broken rock shelves.',
      tell: 'It turns the heavy shield toward you and raises a sweeping claw.',
      counterplay: 'Circle the shield, avoid the claw sweep, and use the exposed side or rear.',
      shortHint: 'Raised claw: circle its shield.'
    }),
  veilwing: creature('veilwing', 'Veilwing', 'Broad manta-like wings around a slender body',
    ['limestone', 'root-grotto'], 'pack-stalker', 'swoop',
    palette('#aea0bd', '#685c80', '#ded3e2', '#c2d6ae'), {
      disposition: 'Defensive roosting forager', peacefulEligible: true,
      ecology: 'Roosts near skylights and broken canopy. Most sightings need not be a fight; a disturbed roost may drive an intruder away.',
      tell: 'It circles, draws its wings back, then commits to a low swoop.',
      counterplay: 'Cross out of the swoop line and use the pause when it settles.',
      shortHint: 'Folded wings: leave the swoop line.'
    }),
  'root-snare': creature('root-snare', 'Root snare', 'Anchored crown with radiating tendrils',
    ['root-grotto', 'tidal'], 'sentinel', 'root-lash',
    palette('#8caa7d', '#4b6855', '#ced3a1', '#d5b1b8'), {
      disposition: 'Sessile opportunistic feeder',
      ecology: 'Anchors where roots meet wet rock. It reaches into a small feeding area rather than pursuing people through an entire cavern.',
      tell: 'The crown contracts and a tendril draws back toward a marked patch of ground.',
      counterplay: 'Leave the marked patch. The anchored body cannot chase you; stay beyond its reach if you need to shoot.',
      shortHint: 'Drawn tendril: leave the marked patch.'
    })
});

export const CREATURE_IDS = Object.freeze(Object.keys(CREATURES));
export const creatureProfile = id => typeof id === 'string' && Object.hasOwn(CREATURES, id) ? CREATURES[id] : null;

const hash = value => {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
};

/** A separate identity stream: choosing ecology never consumes combat, loot or galaxy randomness. */
export function selectHabitatCreatures(habitat, seed = 'farwake', { count = 2, peaceful = false } = {}) {
  if (typeof habitat !== 'string') return [];
  const limit = Math.max(0, Math.min(CREATURE_IDS.length, Math.floor(Number.isFinite(count) ? count : 2)));
  return Object.values(CREATURES)
    .filter(profile => profile.randomSpawn && profile.habitats.includes(habitat) && (!peaceful || profile.peacefulEligible))
    .map(profile => ({ profile, order: hash(`${String(seed)}:creature-ecology-v1:${habitat}:${profile.id}`) }))
    .sort((a, b) => a.order - b.order || a.profile.id.localeCompare(b.profile.id))
    .slice(0, limit).map(item => item.profile);
}
