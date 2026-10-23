// Lobby menu: a centred riot-dossier panel. Faction switch, archetype cards, weapon/stake cards,
// the selected archetype's brief, a district map preview, countdown and join.
import { FACTIONS, ARCHETYPES, WEAPONS, STAKES } from '../data/config.js';
import { ICONS, ABILITY_ICON, icon } from './icons.js';

const fmt = (n) => '$' + n.toFixed(2);

export class Menu {
  constructor(root, state, { onChange, onJoin }) {
    this.root = root; this.state = state; this.onChange = onChange; this.onJoin = onJoin;
    this.render();
  }
  render() {
    const s = this.state, F = FACTIONS[s.faction];
    const weapons = WEAPONS[s.faction], w = weapons[s.weaponTier], arch = ARCHETYPES[s.archetype];
    this.root.innerHTML = `
      <header class="menu-head">
        <div class="brand"><span class="brand-word">RIOT</span><span class="brand-word accent">GEAR</span></div>
        <div class="head-right">
          <button class="icon-btn" id="btn-controls" title="Controls">${icon('keyboard')}<span>CONTROLS</span></button>
          <div class="readout">${icon('cash')}<b>${fmt(s.balance)}</b></div>
        </div>
      </header>
      <div class="clock" style="--c:${F.color}">
        <svg viewBox="0 0 64 64" class="clock-dial">
          <circle cx="32" cy="32" r="29" class="dial-ticks"/>
          <circle cx="32" cy="32" r="24" class="ring-bg"/>
          <circle cx="32" cy="32" r="24" class="ring" id="ring" style="stroke-dasharray:${(s.countdown / 20) * 150.8} 150.8"/>
        </svg>
        <b id="menu-count">${s.countdown}</b>
        <span>NEXT ROUND · #${s.lobbyId}</span>
      </div>
      <section class="strip" style="--c:${F.color};--a:${F.accent}">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="hazard"></div>
        <div class="grp seg" id="seg-faction">
          ${Object.values(FACTIONS).map((f) => `<button data-f="${f.id}" class="${s.faction === f.id ? 'on' : ''}" style="--c:${f.color}" title="${f.name}">${icon(f.id)}<span>${f.name.toUpperCase()}</span></button>`).join('')}
        </div>
        <div class="grp tiles arch" id="cards-arch">
          ${F.archetypes.map((id) => `<button data-a="${id}" class="${s.archetype === id ? 'on' : ''}" title="${ARCHETYPES[id].name}">${icon(id)}<span>${ARCHETYPES[id].name.replace('Front ', '').replace(' Squad', '')}</span></button>`).join('')}
        </div>
        <div class="grp tiles weapons" id="chips-weapon">
          ${weapons.map((wp, i) => `<button data-w="${i}" class="${s.weaponTier === i ? 'on' : ''}" title="${wp.name}">${icon(wp.id)}<em>${fmt(STAKES[i]).replace('.00', '')}</em></button>`).join('')}
        </div>
        <button class="join" id="btn-join">${icon(arch.id, 'join-ico')}<span class="join-main">JOIN</span><span class="join-sub">${w.name.toUpperCase()} · ${fmt(STAKES[s.weaponTier])}</span></button>
      </section>
      ${this.controlsOpen ? this.controlsHTML(arch) : ''}`;
    this.root.querySelector('#seg-faction').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; this.set({ faction: b.dataset.f, archetype: FACTIONS[b.dataset.f].archetypes[0] }); };
    this.root.querySelector('#cards-arch').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.set({ archetype: b.dataset.a }); };
    this.root.querySelector('#chips-weapon').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) this.set({ weaponTier: +b.dataset.w }); };
    this.root.querySelector('#btn-join').onclick = () => this.onJoin();
    this.root.querySelector('#btn-controls').onclick = () => { this.controlsOpen = true; this.render(); };
    const close = this.root.querySelector('#controls-close'); if (close) close.onclick = () => { this.controlsOpen = false; this.render(); };
    const sheet = this.root.querySelector('.controls'); if (sheet) sheet.onclick = (e) => { if (e.target === sheet) { this.controlsOpen = false; this.render(); } };
  }
  /** Pictogram control sheet: key caps / gestures beside icons, one short label each. */
  controlsHTML(arch) {
    const key = (k) => `<kbd>${k}</kbd>`;
    const row = (glyph, ic, label) => `<div class="ctl">${glyph}<i class="arrow"></i>${icon(ic)}<span>${label}</span></div>`;
    const touch = matchMedia('(pointer: coarse)').matches;
    const zKey = touch ? '<kbd class="round">Z</kbd>' : key('Z');
    return `
      <div class="controls${touch ? ' touch-first' : ''}">
        <div class="sheet">
          <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
          <div class="hazard"></div>
          <button class="icon-btn close" id="controls-close">${icon('close')}</button>
          <div class="sheet-cols">
            <div class="col kb">
              <div class="col-head">${icon('keyboard')}${icon('mouse')}</div>
              ${row(key('W') + key('A') + key('S') + key('D'), 'run', 'Move')}
              ${row(key('SHIFT'), 'run', 'Run')}
              ${row(icon('mouse') + key('X'), 'target', 'Strike')}
              ${row(icon('swipe'), 'rock', 'Drag to throw')}
              ${row(key('SPACE'), 'jump', 'Jump')}
              ${row(key('SPACE') + key('SPACE'), 'duck', 'Duck')}
              ${row(key('Q') + key('E'), 'orbit', 'Camera')}
              ${row(icon('pinch'), 'refresh', 'Zoom')}
            </div>
            <div class="col tc">
              <div class="col-head">${icon('touch')}</div>
              ${row(icon('joystick'), 'run', 'Move')}
              ${row(icon('joystick') + '<kbd>MAX</kbd>', 'run', 'Run')}
              ${row(icon('touch'), 'target', 'Tap to strike')}
              ${row(icon('swipe'), 'rock', 'Swipe to throw')}
              ${row('<kbd class="round">' + ICONS.jump + '</kbd>', 'jump', 'Jump')}
              ${row(icon('pinch'), 'refresh', 'Zoom')}
            </div>
            <div class="col arch-col">
              <div class="col-head">${icon(arch.id)}<b>${arch.name.toUpperCase()}</b></div>
              ${row(zKey, ABILITY_ICON[arch.id], arch.ability.tap)}
              ${row(zKey + '<kbd>HOLD</kbd>', ABILITY_ICON[arch.id], arch.ability.hold)}
            </div>
          </div>
        </div>
      </div>`;
  }
  set(patch) { Object.assign(this.state, patch); this.render(); this.onChange(this.state); }
  tick() {
    const c = this.root.querySelector('#menu-count'); if (c) c.textContent = this.state.countdown;
    const r = this.root.querySelector('#ring'); if (r) r.style.strokeDasharray = `${(this.state.countdown / 20) * 150.8} 150.8`;
    const clock = this.root.querySelector('.clock'); if (clock) clock.classList.toggle('urgent', this.state.countdown <= 5);
  }
  show() { this.root.classList.remove('hidden'); this.render(); }
  hide() { this.root.classList.add('hidden'); }
}

/** A plausible Mediterranean district name for this round's city. */
export function districtName(rng) {
  const a = rng.pick(['Barri de', 'Plaça de', 'Carrer de', 'Barrio de', 'Passeig de', 'Ravalet de']);
  const b = rng.pick(['Sant Antoni', 'la Mercè', 'Sant Pere', 'les Corts', 'Gràcia', 'la Ribera', 'Sant Jaume', 'el Born', 'la Barceloneta', 'Santa Caterina', 'Montjuïc', 'Sant Felip', 'la Salut', 'els Àngels', 'Sant Agustí']);
  return `${a} ${b}`;
}
