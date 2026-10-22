// Static game data: factions, archetypes, weapons (stake tiers), projectiles, strategies, economy.

export const FACTIONS = {
  rioter: {
    id: 'rioter', name: 'Rioters', color: '#ff4d2e', accent: '#ffb02e',
    tagline: 'Break the line. Loot everything. Go as far as you can.',
    archetypes: ['instigator', 'looter', 'brawler'],
    npcArchetype: 'rioter_npc',
    dir: +1,
  },
  peacekeeper: {
    id: 'peacekeeper', name: 'Peacekeepers', color: '#3d8bff', accent: '#9ad0ff',
    tagline: 'Advance the line. Quell the riot. Restore order.',
    archetypes: ['commander', 'front_echelon', 'snatch_squad', 'grenadier'],
    npcArchetype: 'peacekeeper_npc',
    dir: -1,
  },
};

// Stats are multipliers of a base character (hp 100, speed 5 m/s, dmg 1.0).
export const ARCHETYPES = {
  commander: {
    id: 'commander', faction: 'peacekeeper', name: 'Commander',
    blurb: 'Strong leader. Full riot gear with a crested helmet. Takes command of squads and sets their strategy.',
    stats: { hp: 1.15, speed: 1.0, dmg: 1.1, mass: 1.1 },
    build: 'standard', helmet: 'crest',
    ability: { tap: 'Toggle squad strategy', hold: 'Take command of squad' },
    projectiles: { teargas: 1, flashbang: 2 },
  },
  front_echelon: {
    id: 'front_echelon', faction: 'peacekeeper', name: 'Front Echelon',
    blurb: 'Big brawler in full riot gear with a riot shield. Holds and bashes the line.',
    stats: { hp: 1.5, speed: 0.85, dmg: 1.2, mass: 1.5 },
    build: 'heavy', helmet: 'standard', shield: true,
    ability: { tap: 'Shield bash', hold: 'Shield block' },
    projectiles: { teargas: 0, flashbang: 1 },
  },
  snatch_squad: {
    id: 'snatch_squad', faction: 'peacekeeper', name: 'Snatch Squad',
    blurb: 'Agile fighter in full riot gear. Darts into the crowd, grabs a rioter, drags them out.',
    stats: { hp: 0.95, speed: 1.25, dmg: 1.0, mass: 0.9 },
    build: 'agile', helmet: 'standard',
    ability: { tap: '—', hold: 'Grab & restrain rioter' },
    projectiles: { teargas: 0, flashbang: 2 },
  },
  grenadier: {
    id: 'grenadier', faction: 'peacekeeper', name: 'Grenadier',
    blurb: 'Stocky, full riot gear, rubber bullet launcher. Lays down fire from behind the shields.',
    stats: { hp: 1.2, speed: 0.9, dmg: 0.9, mass: 1.2 },
    build: 'stocky', helmet: 'standard', gun: true,
    ability: { tap: 'Fire rubber bullet', hold: 'Automatic fire' },
    projectiles: { teargas: 3, flashbang: 1 },
  },
  instigator: {
    id: 'instigator', faction: 'rioter', name: 'Instigator',
    blurb: 'Classic build, bandana, black-clad, coloured smoke stick in hand. Rallies the mob and calls the play.',
    stats: { hp: 1.05, speed: 1.05, dmg: 1.0, mass: 1.0 },
    build: 'standard', smokestick: true,
    ability: { tap: 'Toggle mob strategy', hold: 'Take command of mob' },
    projectiles: { rock: 4, molotov: 1 },
  },
  looter: {
    id: 'looter', faction: 'rioter', name: 'Looter',
    blurb: 'Slim and agile, bandana, spray paint on the belt. Climbs anything and pockets anything small.',
    stats: { hp: 0.9, speed: 1.3, dmg: 0.85, mass: 0.85 },
    build: 'agile', spraycan: true,
    ability: { tap: 'Loot small prop', hold: 'Climb (move fwd/back)' },
    projectiles: { rock: 3, molotov: 0 },
  },
  brawler: {
    id: 'brawler', faction: 'rioter', name: 'Brawler',
    blurb: 'Huge tattooed arms, tank top, bandana. Picks up barriers and benches and throws them.',
    stats: { hp: 1.45, speed: 0.9, dmg: 1.35, mass: 1.5 },
    build: 'heavy', tanktop: true,
    ability: { tap: '—', hold: 'Pick up prop (release to throw)' },
    projectiles: { rock: 2, molotov: 1 },
  },
  // NPC-only archetypes
  rioter_npc: {
    id: 'rioter_npc', faction: 'rioter', name: 'Rioter',
    stats: { hp: 1.0, speed: 1.0, dmg: 0.9, mass: 1.0 }, build: 'standard', npc: true,
    projectiles: { rock: 3, molotov: 0 },
  },
  peacekeeper_npc: {
    id: 'peacekeeper_npc', faction: 'peacekeeper', name: 'Support Officer',
    stats: { hp: 1.2, speed: 0.95, dmg: 1.0, mass: 1.1 }, build: 'standard', helmet: 'standard', npc: true,
    projectiles: { teargas: 1, flashbang: 0 },
  },
};

// Five melee weapons per faction, ordered by stake tier. `mech` drives unique mechanics in combat.js.
export const WEAPONS = {
  peacekeeper: [
    { id: 'baton', name: 'Baton', tier: 0, dmg: 14, range: 1.7, arc: 1.2, cooldown: 0.42, knock: 1.0,
      mech: 'swing', desc: 'Fast, reliable, standard issue.' },
    { id: 'pepper', name: 'Pepper Spray', tier: 1, dmg: 6, range: 2.6, arc: 0.7, cooldown: 0.25, knock: 0.1,
      mech: 'spray', desc: 'Short cone. Blinds and slows everyone it touches. Hold to keep spraying.' },
    { id: 'prod', name: 'Cattle Prod', tier: 2, dmg: 20, range: 2.0, arc: 0.5, cooldown: 0.6, knock: 0.4,
      mech: 'stun', desc: 'Stab. Locks the target up in a jolt for a moment.' },
    { id: 'flail', name: 'Riot Flail', tier: 3, dmg: 24, range: 2.8, arc: 2.6, cooldown: 0.8, knock: 1.8,
      mech: 'sweep', desc: 'Weighted chain. Wide sweep hits everyone in the arc and scatters them.' },
    { id: 'gauntlets', name: 'Shock Gauntlets', tier: 4, dmg: 30, range: 1.6, arc: 1.4, cooldown: 0.5, knock: 1.4,
      mech: 'pulse', desc: 'Every third strike discharges a shock pulse that knocks down everyone nearby.' },
  ],
  rioter: [
    { id: 'plank', name: '2×4', tier: 0, dmg: 13, range: 1.9, arc: 1.3, cooldown: 0.5, knock: 1.1,
      mech: 'swing', desc: 'A plank. Honest work.' },
    { id: 'knuckles', name: 'Brass Knuckles', tier: 1, dmg: 11, range: 1.3, arc: 0.9, cooldown: 0.22, knock: 0.6,
      mech: 'combo', desc: 'Very fast. Every hit on the same target hits harder.' },
    { id: 'bat', name: 'Baseball Bat', tier: 2, dmg: 22, range: 2.0, arc: 1.5, cooldown: 0.55, knock: 1.6,
      mech: 'swing', propBonus: 1.6, desc: 'Big swing, big knockback. Wrecks props.' },
    { id: 'nunchucks', name: 'Nunchucks', tier: 3, dmg: 16, range: 1.8, arc: 1.8, cooldown: 0.2, knock: 0.9,
      mech: 'flurry', desc: 'Whirling flurry. Hits fast and keeps hitting while you hold.' },
    { id: 'sledge', name: 'Sledgehammer', tier: 4, dmg: 40, range: 2.1, arc: 1.6, cooldown: 0.95, knock: 2.4,
      mech: 'slam', propBonus: 3.0, desc: 'Slow and brutal. Ground slam knocks everyone down. Demolishes buildings.' },
  ],
};

export const STAKES = [1, 2, 5, 10, 25]; // credits per tier index

export const PROJECTILES = {
  rock: { name: 'Rock', faction: 'rioter', dmg: 12, radius: 0, speed: 16, mass: 0.6, color: '#8a8a80' },
  molotov: { name: 'Molotov', faction: 'rioter', dmg: 10, radius: 3.0, speed: 13, mass: 0.9, color: '#ffb02e', fire: 7 },
  teargas: { name: 'Tear Gas', faction: 'peacekeeper', dmg: 2, radius: 5.0, speed: 15, mass: 0.7, color: '#d9d9c8', gas: 11 },
  flashbang: { name: 'Flashbang', faction: 'peacekeeper', dmg: 4, radius: 5.0, speed: 17, mass: 0.6, color: '#ffffff', flash: 1.5 },
};

export const STRATEGIES = {
  peacekeeper: [
    { id: 'slow_advance', name: 'Slow Advance', desc: 'Creep the line forward with support from behind the shields.',
      push: 0.55, spread: 1.0, depth: 1.0, aggression: 0.5, fire: 0.5, snatch: 0.2 },
    { id: 'collapse_wall', name: 'Collapse Into Wall', desc: 'Fall back slightly into a tight shield wall.',
      push: -0.2, spread: 0.6, depth: 0.5, aggression: 0.3, fire: 0.3, snatch: 0.0, wall: true },
    { id: 'breakout', name: 'Breakout & Assault', desc: 'Break formation, chase down and arrest scattered rioters.',
      push: 1.0, spread: 1.8, depth: 1.6, aggression: 1.0, fire: 0.3, snatch: 0.8, scatter: true },
    { id: 'pulse', name: 'Pulse With Snatch Squad', desc: 'Push the line in and out so snatch squads can pick rioters off.',
      push: 0.4, spread: 1.0, depth: 1.1, aggression: 0.7, fire: 0.4, snatch: 1.0, pulse: true },
    { id: 'fallback', name: 'Fall Back & Regroup', desc: 'Retreat to the regroup point and link up with other squads.',
      push: -1.0, spread: 0.7, depth: 0.6, aggression: 0.2, fire: 0.2, snatch: 0.0, regroup: true },
    { id: 'anchor_lob', name: 'Anchor & Lob', desc: 'Hold the line with shields; grenadiers keep up constant fire.',
      push: 0.05, spread: 0.9, depth: 1.2, aggression: 0.4, fire: 1.0, snatch: 0.1 },
  ],
  rioter: [
    { id: 'shelling', name: 'Sustained Shelling', desc: 'Keep throwing everything while the mob creeps forward.',
      push: 0.5, spread: 1.0, depth: 1.2, aggression: 0.5, fire: 1.0, climb: 0.1 },
    { id: 'blitz', name: 'Blitzkrieg', desc: 'Sharp column incursions into the line. Break it at all cost.',
      push: 1.0, spread: 0.5, depth: 0.8, aggression: 1.0, fire: 0.6, climb: 0.0, column: true },
    { id: 'highground', name: 'High Ground', desc: 'Looters climb to rooftops and monuments and rain projectiles down.',
      push: 0.45, spread: 1.3, depth: 1.0, aggression: 0.5, fire: 0.8, climb: 1.0 },
    { id: 'countersnatch', name: 'Counter Snatch Squad', desc: 'Mob the snatch squad when it tries to get back behind the line.',
      push: 0.35, spread: 1.1, depth: 0.9, aggression: 0.9, fire: 0.3, climb: 0.0, counter: true },
    { id: 'retreat', name: 'Retreat & Regroup', desc: 'Pull back and regroup with the other mobs.',
      push: -1.0, spread: 0.8, depth: 0.6, aggression: 0.2, fire: 0.2, climb: 0.0, regroup: true },
    { id: 'scorched', name: 'Scorched Earth', desc: 'Destroy every prop, knock out every peacekeeper. Chaotic.',
      push: 0.4, spread: 1.6, depth: 1.5, aggression: 0.9, fire: 0.5, climb: 0.2, scorched: true, wreck: true },
  ],
};

// Money awarded per event, expressed as multiples of the stake. All rewards scale with stake so the
// RTP distribution is stake-independent.
export const ECONOMY = {
  perSecondAlive: 0.005,
  perFtAdvance: 0.006,        // player's own distance past the original line
  perFtLinePush: 0.004,       // mob/squad line pushed past the original line (new ground only)
  knockout: 0.18,
  quellMob: 0.6,              // peacekeepers only
  loot: 0.08,                 // looter small-prop loot
  prop: { fragile: 0.02, small: 0.05, medium: 0.12, large: 0.3, building: 1.2 },
  collectible: 0.0,
};

export const M_TO_FT = 3.28084;

export const QUALITY = {
  desktop: { bots: { rioter: 42, peacekeeper: 34 }, shadows: true, pixelRatio: 1.5, drawDistance: 260 },
  mobile:  { bots: { rioter: 28, peacekeeper: 24 }, shadows: false, pixelRatio: 1.0, drawDistance: 200 },
};
