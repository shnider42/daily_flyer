// Authored connectivity for fictional field operations. Geometry is independent
// of combat RNG; a seed changes street dressing, never a required crossing.
const point = (x, y) => ({ x, y });
const points = values => values.map(([x, y]) => point(x, y));
const rect = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, ...extra });
const road = (x, y, w, h) => ({ x, y, w, h });
const route = (spawn, path, anchor) => ({ spawn: points(spawn), route: points(path), ...(anchor ? { anchor: point(...anchor) } : {}) });
const clone = value => JSON.parse(JSON.stringify(value));

const PROFILES = {
  10: {
    id: 'breakwater', topology: 'waterfront',
    insertion: points([[220, 1740], [280, 1780], [160, 1780], [220, 1820]]),
    anchors: {
      approach: point(220, 1540), battery: point(1020, 1280), observe: point(1880, 1340),
      lookAt: point(1880, 960), beacon: point(1900, 480), residents: point(1660, 460),
      loading: point(1880, 380), extraction: point(1880, 380),
    },
    buildings: [
      rect('quay-west-store', 380, 1160, 320, 260), rect('quay-battery-store', 840, 1160, 360, 260),
      rect('quay-east-store', 1360, 1160, 360, 260), rect('quay-workshop', 420, 640, 400, 320),
      rect('quay-freight', 1060, 640, 400, 320), rect('quay-cold-store', 1540, 640, 240, 320),
      rect('quay-office', 480, 400, 220, 180), rect('quay-shelter', 1540, 380, 240, 180),
    ],
    roads: [road(140, 200, 160, 1650), road(140, 1460, 1880, 160), road(1800, 200, 220, 1650), road(140, 200, 1880, 160), road(300, 1000, 1500, 120)],
    terrain: [rect('harbor-north', 0, 0, 2400, 180, { kind: 'water' }), rect('harbor-east', 2020, 180, 380, 1180, { kind: 'water' }), rect('quay-apron', 1780, 180, 240, 1200, { kind: 'yard' })],
    navigationSolids: [rect('water-north', 0, 0, 2400, 180), rect('water-east', 2020, 180, 380, 1180)],
    structuralSolids: [],
    civilianSpawns: points([[540, 720], [540, 860], [1180, 740], [1180, 880], [1580, 1040], [420, 1580], [920, 1580], [1440, 1580]]),
    resident: point(720, 1040),
    fieldRoutes: {
      raven: route([[220, 500], [220, 560], [220, 620]], [[220, 500], [220, 280], [1000, 280], [1000, 540]]),
      hammer: route([[1880, 1180], [1940, 1180]], [[1880, 1180], [1880, 1040], [1480, 1040], [1480, 580]]),
      hostile: route([[1120, 280], [1220, 280], [1320, 280]], [[1120, 280], [1480, 280], [1480, 580], [980, 580]]),
      houseGuard: route([[620, 720], [620, 860], [740, 860]], [[620, 720], [900, 580], [980, 1040]], [620, 760]),
      reserve: route([[60, 1720], [60, 1640], [60, 1560]], [[220, 1720], [220, 1540], [760, 1540]]),
    },
    fieldTraffic: {
      friendly: { posts: points([[300, 1120], [300, 1060], [300, 1000]]), route: points([[300, 1060], [900, 1040], [1480, 1040], [1880, 1040]]) },
      hostile: { posts: points([[1260, 720], [1260, 880], [1380, 880]]), route: points([[1260, 580], [1480, 580], [1480, 1040], [980, 1040]]), buildingAnchor: point(1260, 780) },
    },
    scenery: points([[350, 1040], [900, 1080], [1260, 1080], [1740, 1060], [340, 460], [940, 440], [1440, 1680], [760, 1680], [1820, 1720], [2000, 1440]]),
    armor: [{ key: 'breakwater-guard', name: 'Quay guard', kind: 'tank', team: 'ally', x: 1540, y: 1540, angle: 0, active: false,
      route: points([[1880, 1540], [1880, 1040], [1880, 700]]), cannonAmmo: 9, mgAmmo: 100 }],
  },
  11: {
    id: 'split-channel', topology: 'three-crossings',
    insertion: points([[220, 1700], [280, 1750], [160, 1750], [220, 1810]]),
    anchors: {
      approach: point(920, 1600), observe: point(920, 1320), lookAt: point(1420, 1320),
      plans: point(540, 1400), delivery: point(1980, 1490), casualty: point(1980, 1140),
      eastBank: point(1400, 1000), crossing: point(980, 1000), extraction: point(220, 780),
    },
    buildings: [
      rect('channel-west-shed', 360, 1300, 400, 240), rect('channel-west-houses', 300, 780, 300, 280),
      rect('channel-bank-house', 700, 760, 240, 280), rect('channel-north-house', 420, 180, 380, 280),
      rect('channel-bank-store', 1460, 1000, 260, 300), rect('channel-casualty-house', 1820, 1000, 320, 300),
      rect('channel-aid-house', 1740, 1400, 400, 220), rect('channel-north-store', 1460, 180, 320, 150),
    ],
    roads: [road(140, 100, 160, 1750), road(860, 80, 160, 1750), road(1320, 80, 160, 1750), road(1900, 340, 160, 600),
      road(200, 340, 1860, 200), road(220, 960, 1500, 80), road(200, 1550, 1540, 100), road(1280, 1320, 920, 80)],
    terrain: [rect('drainage-channel', 1060, 0, 220, 1900, { kind: 'channel' }),
      rect('causeway', 1040, 340, 260, 200, { kind: 'bridge' }), rect('footbridge', 1040, 960, 260, 80, { kind: 'bridge' }), rect('culvert', 1040, 1550, 260, 100, { kind: 'bridge' })],
    navigationSolids: [rect('channel-upper', 1060, 0, 220, 340), rect('channel-middle', 1060, 540, 220, 420),
      rect('channel-lower', 1060, 1040, 220, 510), rect('channel-bottom', 1060, 1650, 220, 250)],
    structuralSolids: [],
    civilianSpawns: points([[460, 860], [460, 1000], [820, 840], [820, 980], [1580, 1080], [1580, 1220], [1880, 1680], [2200, 1380]]),
    resident: point(820, 1180),
    fieldRoutes: {
      raven: route([[220, 580], [220, 640], [220, 700]], [[220, 580], [940, 580], [940, 1000], [1400, 1000]]),
      hammer: route([[2200, 1500], [2200, 1580]], [[2200, 1500], [2200, 1360], [1400, 1360], [1400, 1000]]),
      hostile: route([[1960, 640], [2040, 640], [2040, 720]], [[1960, 640], [1400, 640], [1400, 1000], [1760, 1360]]),
      houseGuard: route([[1580, 1080], [1580, 1220], [1680, 1220]], [[1580, 940], [1400, 940], [1400, 1360]], [1580, 1120]),
      reserve: route([[60, 1740], [60, 1660], [60, 1580]], [[220, 1700], [220, 1180], [940, 1180]]),
    },
    fieldTraffic: {
      friendly: { posts: points([[220, 1100], [220, 1020], [220, 940]]), route: points([[220, 1180], [940, 1180], [940, 1000], [1400, 1000]]) },
      hostile: { posts: points([[1580, 240], [1660, 240], [1740, 240]]), route: points([[1820, 440], [1400, 440], [940, 440], [940, 700]]), buildingAnchor: point(1600, 240) },
    },
    scenery: points([[340, 1180], [820, 1180], [800, 1680], [320, 600], [940, 220], [1340, 720], [1740, 880], [2200, 860], [1600, 1720]]),
    armor: [{ key: 'channel-sentinel', name: 'Causeway armor', kind: 'tank', team: 'enemy', x: 1540, y: 440, angle: 0, active: true,
      route: points([[1980, 440], [1980, 800], [1540, 800], [1540, 440]]), loop: true, cannonAmmo: 7, mgAmmo: 80 }],
  },
  12: {
    id: 'gatehouse', topology: 'walled-quarter',
    insertion: points([[200, 840], [140, 900], [140, 780], [80, 840]]),
    anchors: {
      entry: point(500, 840), papers: point(700, 540), observe: point(980, 640), lookAt: point(980, 1040),
      casualty: point(1220, 900), liaison: point(1200, 220), eastGate: point(1800, 1260), extraction: point(2180, 1260),
    },
    buildings: [
      rect('gate-record-house', 560, 420, 240, 260), rect('gate-north-house', 920, 420, 360, 200),
      rect('gate-north-east', 1440, 420, 320, 300), rect('gate-west-house', 620, 840, 280, 300),
      rect('gate-casualty-house', 1100, 760, 260, 320), rect('gate-east-house', 1480, 940, 300, 220),
      rect('gate-south-house', 1020, 1260, 360, 180), rect('gate-south-east', 1540, 1280, 260, 160),
      rect('gate-south-west', 480, 1200, 240, 200),
    ],
    roads: [road(180, 180, 200, 1480), road(180, 160, 1980, 120), road(2000, 180, 160, 1500), road(180, 1580, 1980, 140),
      road(380, 760, 560, 120), road(920, 620, 160, 620), road(1380, 1160, 820, 120)],
    terrain: [], navigationSolids: [],
    structuralSolids: [
      rect('quarter-wall-nw', 420, 300, 700, 20), rect('quarter-wall-ne', 1280, 300, 700, 20),
      rect('quarter-wall-sw', 420, 1520, 340, 20), rect('quarter-wall-se', 920, 1520, 1060, 20),
      rect('quarter-wall-wn', 420, 300, 20, 460), rect('quarter-wall-ws', 420, 920, 20, 620),
      rect('quarter-wall-en', 1960, 300, 20, 880), rect('quarter-wall-es', 1960, 1340, 20, 200),
    ],
    civilianSpawns: points([[1040, 480], [1160, 560], [1560, 500], [1560, 640], [1160, 1320], [1240, 1380], [800, 1200], [1840, 800]]),
    resident: point(980, 1180),
    fieldRoutes: {
      raven: route([[280, 1600], [280, 1540], [280, 1480]], [[280, 1460], [840, 1640], [840, 1480], [980, 1180]]),
      hammer: route([[2140, 1500], [2200, 1500]], [[2140, 1500], [2140, 1260], [1840, 1260], [1840, 840]]),
      hostile: route([[1800, 800], [1880, 800], [1880, 880]], [[1840, 800], [1400, 800], [1400, 1200], [1840, 1200]]),
      houseGuard: route([[1560, 500], [1560, 640], [1680, 640]], [[1560, 360], [1360, 360], [1360, 700]], [1600, 560]),
      reserve: route([[140, 1000], [140, 1080], [140, 1160]], [[200, 840], [500, 840], [980, 720]]),
    },
    fieldTraffic: {
      friendly: { posts: points([[1200, 1640], [1280, 1640], [1360, 1640]]), route: points([[1200, 1640], [840, 1640], [840, 1480], [980, 1180], [1400, 1200]]) },
      hostile: { posts: points([[740, 920], [740, 1060], [820, 1060]]), route: points([[740, 1180], [980, 1180], [980, 720], [1400, 720]]), buildingAnchor: point(760, 980) },
    },
    scenery: points([[500, 1000], [980, 350], [1380, 500], [1820, 500], [1420, 1500], [1820, 1500], [340, 1740], [2200, 1740]]),
    armor: [{ key: 'gatehouse-cover', name: 'Gate cover', kind: 'tank', team: 'ally', x: 1600, y: 220, angle: 0, active: false,
      route: points([[2080, 220], [2080, 1060]]), cannonAmmo: 8, mgAmmo: 90 }],
  },
  13: {
    id: 'freight-line', topology: 'parallel-freight-lanes',
    insertion: points([[2160, 1720], [2220, 1770], [2100, 1770], [2160, 1830]]),
    anchors: {
      carrier: point(1160, 1720), observe: point(1140, 1400), lookAt: point(1140, 980),
      part: point(1880, 1560), repair: point(1060, 1820), loading: point(2160, 160), extraction: point(2220, 160),
    },
    buildings: [
      rect('freight-west-warehouse', 420, 360, 220, 1000), rect('freight-north-warehouse', 820, 200, 260, 1000),
      rect('freight-middle-warehouse', 1240, 520, 260, 1050), rect('freight-east-warehouse', 1660, 220, 260, 1020),
      rect('freight-repair-shed', 1760, 1460, 260, 220), rect('freight-crew-shed', 640, 1440, 300, 200),
    ],
    roads: [road(140, 80, 160, 1740), road(200, 80, 2040, 120), road(2060, 120, 160, 1720), road(200, 1680, 2040, 160),
      road(1080, 120, 160, 1500), road(640, 1240, 600, 160), road(1500, 1280, 740, 140)],
    terrain: [rect('freight-apron', 180, 1660, 2060, 220, { kind: 'yard' }),
      rect('rail-west', 700, 120, 36, 1260, { kind: 'rail' }), rect('rail-east', 1560, 120, 36, 1480, { kind: 'rail' })],
    navigationSolids: [], structuralSolids: [],
    civilianSpawns: points([[540, 440], [540, 1180], [940, 280], [940, 1080], [1380, 600], [1380, 1460], [1780, 300], [1780, 1120]]),
    resident: point(2020, 1380),
    fieldRoutes: {
      raven: route([[220, 1420], [220, 1360], [220, 1300]], [[220, 1420], [220, 160], [740, 160], [740, 1300]]),
      hammer: route([[2140, 340], [2200, 340]], [[2140, 340], [2140, 1320], [1580, 1320], [1580, 440]]),
      hostile: route([[740, 740], [740, 820], [740, 900]], [[740, 740], [740, 1300], [1140, 1300], [1140, 440]]),
      houseGuard: route([[1380, 600], [1380, 720], [1300, 720]], [[1380, 440], [1580, 440], [1580, 1320]], [1380, 740]),
      reserve: route([[2080, 1870], [2240, 1870], [2320, 1870]], [[2160, 1720], [1640, 1720], [1140, 1720]]),
    },
    fieldTraffic: {
      friendly: { posts: points([[220, 820], [220, 880], [220, 940]]), route: points([[220, 820], [220, 160], [1140, 160], [1140, 440]]) },
      hostile: { posts: points([[940, 300], [940, 460], [860, 460]]), route: points([[940, 1260], [740, 1300], [740, 320], [1140, 160]]), buildingAnchor: point(940, 420) },
    },
    scenery: points([[340, 1440], [760, 1400], [1160, 1640], [1620, 1560], [2040, 1380], [700, 240], [1580, 260], [340, 700]]),
    armor: [
      { key: 'freight-recovery', name: 'Recovery carrier', kind: 'apc', team: 'ally', x: 1060, y: 1720, angle: Math.PI, active: false, disabled: true, convoy: true,
        route: points([[1060, 1720], [220, 1720], [220, 160], [2160, 160]]), cannonAmmo: 0, mgAmmo: 100 },
      { key: 'freight-patrol', name: 'Freight patrol', kind: 'tank', team: 'enemy', x: 1140, y: 740, angle: Math.PI / 2, active: true,
        route: points([[1140, 1160], [1140, 440], [1140, 740]]), loop: true, cannonAmmo: 6, mgAmmo: 80 },
    ],
  },
};

/** Fresh metadata. Consumers may advance private routes without changing the registry. */
export function missionLayoutDefinition(missionIndex) {
  return PROFILES[missionIndex] ? clone(PROFILES[missionIndex]) : null;
}

export function missionAnchor(missionIndex, name) {
  const anchor = PROFILES[missionIndex]?.anchors[name];
  return anchor ? { ...anchor } : null;
}

/** Return a complete authored world before prepareBuildingInteriors; null selects
 * the existing grid generator. All four profiles retain the shared world bounds.
 * missionLayout and fieldTraffic are the route contracts for civilian/field AI.
 * navigationSolids prohibit walking/driving but remain transparent to gunfire. */
export function buildMissionLayout({ seed = 1, missionIndex } = {}) {
  const profile = missionLayoutDefinition(missionIndex);
  if (!profile) return null;
  let value = ((seed >>> 0) ^ Math.imul(missionIndex + 1, 0x9e3779b1)) >>> 0;
  const random = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
  const industrial = profile.id === 'freight-line' || profile.id === 'breakwater';
  const buildings = profile.buildings.map((building, index) => ({ ...building, tone: random(), districtId: `${profile.id}:district:${index}`,
    districtKind: industrial ? 'workshop' : 'residential', style: industrial ? 'workshop' : index % 2 ? 'masonry' : 'plaster', variation: random() }));
  const world = {
    width: 2400, height: 1900, buildings, roads: profile.roads, props: [],
    terrain: [...profile.terrain, ...profile.structuralSolids.map(wall => ({ ...wall, kind: 'wall' }))],
    structuralSolids: profile.structuralSolids.map(wall => ({ ...wall, kind: 'perimeter', material: 'stone' })),
    navigationSolids: profile.navigationSolids.map(solid => ({ ...solid, kind: 'impassable-ground' })),
    layoutVersion: 3, layoutSeed: seed >>> 0, layoutMission: missionIndex,
    districts: buildings.map((building, index) => ({ id: building.districtId, x: building.x - 35, y: building.y - 35,
      w: building.w + 70, h: building.h + 70, kind: profile.id === 'freight-line' || profile.id === 'breakwater' ? 'workshop' : 'residential',
      tone: building.tone, variant: 'authored', surface: index % 2 ? 'patched' : 'dust' })),
    missionLayout: { id: profile.id, topology: profile.topology, anchors: profile.anchors, insertion: profile.insertion,
      civilianSpawns: profile.civilianSpawns, resident: profile.resident, fieldRoutes: profile.fieldRoutes },
    fieldTraffic: profile.fieldTraffic, scenerySites: profile.scenery,
    // Vehicles need room to turn as well as room for their tracks.
    reservedRoutes: profile.armor.flatMap(vehicle => {
      let previous = point(vehicle.x, vehicle.y);
      return vehicle.route.map(next => {
        const bounds = rect(`${vehicle.key}:lane`, Math.min(previous.x, next.x) - 74, Math.min(previous.y, next.y) - 74,
          Math.abs(previous.x - next.x) + 148, Math.abs(previous.y - next.y) + 148);
        previous = next; return bounds;
      });
    }),
  };
  return world;
}
