// Hand-drawn inline SVG icons (24x24 viewBox, stroke-based). No emoji, no image files.
const wrap = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICONS = {
  // factions
  rioter: wrap('<path d="M4 20h16"/><path d="M6 20v-5h5v5"/><path d="M13 20v-8h5v8"/><path d="M8 15V9l-2-2 3-3 3 3-2 2v6"/><path d="M15 12l4-5"/>'),
  peacekeeper: wrap('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M8.5 12h7"/><path d="M12 8.5v7"/>'),
  // archetypes
  commander: wrap('<path d="M5 14a7 7 0 0 1 14 0v2H5v-2z"/><path d="M12 3v4"/><path d="M9 7h6"/><path d="M4 19h16"/><path d="M8 16v3M16 16v3"/>'),
  front_echelon: wrap('<path d="M7 4h10v9c0 3-2 6-5 7-3-1-5-4-5-7V4z"/><path d="M7 9h10"/><path d="M12 4v16"/>'),
  snatch_squad: wrap('<path d="M8 21v-6l-3-4 2-4 3 2 2-3h3l1 3-2 2v10"/><path d="M14 11l4-2 2 3"/>'),
  grenadier: wrap('<path d="M3 15l12-7 2 3-12 7z"/><path d="M12 9l5-3 2 3-2 2"/><path d="M5 18l3 2"/><path d="M15 6l4-3"/>'),
  instigator: wrap('<path d="M11 21V10"/><path d="M8 10h6"/><path d="M11 10c-3-3-2-6 0-7 2 1 3 4 0 7z"/><path d="M14 6c2 0 3 1 4 3M16 3c1 0 2 1 2 2"/>'),
  looter: wrap('<path d="M8 8h8v12H8z"/><path d="M10 8V5h4v3"/><path d="M12 2v3"/><path d="M11 12h2M11 15h2"/>'),
  brawler: wrap('<path d="M6 12V8a2 2 0 0 1 4 0v4"/><path d="M10 11V6a2 2 0 0 1 4 0v5"/><path d="M14 11V7a2 2 0 0 1 4 0v6c0 4-3 7-6 7s-6-2-6-6"/><path d="M4 13l2-1"/>'),
  rioter_npc: wrap('<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>'),
  peacekeeper_npc: wrap('<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/><path d="M8.5 7h7"/>'),
  // weapons
  baton: wrap('<path d="M5 19l10-10"/><path d="M14 8l3-3 2 2-3 3"/><path d="M4 20l2-2"/>'),
  pepper: wrap('<path d="M9 9h6v12H9z"/><path d="M10 9V6h4v3"/><path d="M12 3v3"/><path d="M16 5l4-1M16 8l4 1"/>'),
  prod: wrap('<path d="M4 20L16 8"/><path d="M15 7l2-2 2 2-2 2"/><path d="M19 3l1 1M19 7l2 0"/>'),
  flail: wrap('<path d="M4 20l6-6"/><circle cx="12" cy="12" r="1"/><circle cx="14.5" cy="9.5" r="1"/><circle cx="18" cy="6" r="3"/>'),
  gauntlets: wrap('<path d="M6 11V8a2 2 0 0 1 4 0v3M10 10V6a2 2 0 0 1 4 0v4M14 10V8a2 2 0 0 1 4 0v5c0 4-3 7-6 7s-6-2-6-6"/><path d="M3 3l2 2M21 3l-2 2"/>'),
  plank: wrap('<path d="M3 17L17 3l4 4L7 21z"/><path d="M8 12l1 1M12 8l1 1"/>'),
  knuckles: wrap('<path d="M4 14v-3a2 2 0 0 1 4 0M8 11a2 2 0 0 1 4 0M12 11a2 2 0 0 1 4 0M16 11a2 2 0 0 1 4 0v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4"/>'),
  bat: wrap('<path d="M4 20l3-3"/><path d="M7 17L17 4a2 2 0 0 1 3 3L9 19z"/>'),
  nunchucks: wrap('<path d="M4 20l5-9"/><path d="M15 4l5 9"/><path d="M9 11c2-1 4-1 6-7" stroke-dasharray="1.5 2"/>'),
  sledge: wrap('<path d="M5 21l7-9"/><path d="M11 5h9v6h-9z"/><path d="M11 8h-3"/>'),
  // projectiles
  rock: wrap('<path d="M7 6l6-2 5 4 1 6-4 5-7-1-3-5z"/>'),
  molotov: wrap('<path d="M10 9h4v11h-4z"/><path d="M11 9V5h2v4"/><path d="M12 5c-1-2 0-3 1-4 1 1 1 2 0 4"/>'),
  teargas: wrap('<path d="M9 8h6v12H9z"/><path d="M10 8V6h4v2"/><path d="M12 3v3"/><path d="M4 14c1-1 1-3 0-4M20 14c-1-1-1-3 0-4"/>'),
  flashbang: wrap('<path d="M9 9h6v11H9z"/><path d="M11 9V7h2v2"/><path d="M12 2l1 3-2 1 1 3"/><path d="M4 8l2 1M20 8l-2 1"/>'),
  bullet: wrap('<path d="M9 14l6-6 3 3-6 6z"/><path d="M6 17l3-3M4 20l2-2"/>'),
  // ui
  jump: wrap('<path d="M12 20V6"/><path d="M6 12l6-6 6 6"/>'),
  duck: wrap('<path d="M12 4v14"/><path d="M6 12l6 6 6-6"/>'),
  run: wrap('<path d="M13 4l2 2-3 5 3 2 1 6"/><path d="M9 12l3-1"/><path d="M8 20l3-5"/><circle cx="16" cy="3" r="1"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  cash: wrap('<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>'),
  people: wrap('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2 20v-2a6 6 0 0 1 12 0v2M14 20v-2a4 4 0 0 1 8 0v2"/>'),
  map: wrap('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  target: wrap('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  line: wrap('<path d="M3 12h4l2-5 3 10 2-7 2 2h5"/>'),
  heart: wrap('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  skull: wrap('<path d="M5 11a7 7 0 0 1 14 0v3l-2 2v3H7v-3l-2-2z"/><circle cx="9.5" cy="11" r="1.3"/><circle cx="14.5" cy="11" r="1.3"/><path d="M11 16h2"/>'),
  cuffs: wrap('<circle cx="7" cy="14" r="4"/><circle cx="17" cy="14" r="4"/><path d="M10 11l4 0"/><path d="M5 8l2 2M19 8l-2 2"/>'),
  flag: wrap('<path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/>'),
  grab: wrap('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V6a1.5 1.5 0 0 1 3 0v6M16 12V9a1.5 1.5 0 0 1 3 0v6c0 4-3 6-6 6s-7-3-7-7"/>'),
  climb: wrap('<path d="M8 21V3M16 21V3"/><path d="M8 7h8M8 12h8M8 17h8"/>'),
  loot: wrap('<path d="M4 9h16l-2 11H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>'),
  cog: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  refresh: wrap('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'),
  strategy: wrap('<path d="M4 18l5-6 4 3 7-8"/><path d="M16 7h4v4"/>'),
  shield_small: wrap('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>'),
};

export const ABILITY_ICON = {
  commander: 'strategy', front_echelon: 'shield_small', snatch_squad: 'grab', grenadier: 'grenadier',
  instigator: 'flag', looter: 'climb', brawler: 'brawler',
};

export function icon(name, cls = '') { return `<i class="ico ${cls}">${ICONS[name] || ''}</i>`; }
