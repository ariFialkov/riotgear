// Lobby menu: a centred riot-dossier panel. Faction switch, archetype cards, weapon/stake cards,
// the selected archetype's brief, a district map preview, countdown and join.
import { FACTIONS, ARCHETYPES, WEAPONS, STAKES } from '../data/config.js';
import { ICONS, ABILITY_ICON, icon } from './icons.js';
import { Minimap } from './minimap.js';

const fmt = (n) => '$' + n.toFixed(2);
const pad = (n) => String(n).padStart(2, '0');

export class Menu {
  constructor(root, state, { onChange, onJoin }) {
    this.root = root; this.state = state; this.onChange = onChange; this.onJoin = onJoin;
    this.render();
  }
  render() {
    const s = this.state, F = FACTIONS[s.faction];
    const arch = ARCHETYPES[s.archetype], weapons = WEAPONS[s.faction], w = weapons[s.weaponTier];
    const st = arch.stats;
    const bar = (v) => `<i style="width:${Math.round(Math.min(1, (v - 0.6) / 0.9) * 100)}%"></i>`;
    this.root.innerHTML = `
      <div class="menu-wrap">
        <header class="menu-head">
          <div class="brand"><span class="brand-word">RIOT</span><span class="brand-word accent">GEAR</span><span class="brand-sub">SIMULATED CROWD ACTION · STAKE &amp; SURVIVE</span></div>
          <div class="head-right">
            <div class="readout"><span>LOBBY</span><b>#${s.lobbyId}</b></div>
            <div class="readout"><span>BALANCE</span><b>${fmt(s.balance)}</b></div>
          </div>
        </header>
        <section class="panel" style="--c:${F.color};--a:${F.accent}">
          <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
          <div class="hazard"></div>
          <div class="panel-grid">
            <div class="col-a">
              <div class="seg" id="seg-faction">
                ${Object.values(FACTIONS).map((f) => `<button data-f="${f.id}" class="${s.faction === f.id ? 'on' : ''}" style="--c:${f.color}">${icon(f.id)}<span>${f.name.toUpperCase()}</span></button>`).join('')}
              </div>
              <div class="row-label"><span>01</span> ARCHETYPE</div>
              <div class="cards arch" id="cards-arch">
                ${F.archetypes.map((id) => { const a = ARCHETYPES[id]; return `<button data-a="${id}" class="${s.archetype === id ? 'on' : ''}">${icon(id, 'big')}<b>${a.name}</b></button>`; }).join('')}
              </div>
              <div class="brief">
                <div class="brief-head">${icon(s.archetype)}<div><b>${arch.name.toUpperCase()}</b><span>${F.name.slice(0, -1)} · ${arch.build} build</span></div></div>
                <p>${arch.blurb}</p>
                <div class="abil">
                  <div>${icon(ABILITY_ICON[s.archetype])}<span><em>Z TAP</em>${arch.ability.tap}</span></div>
                  <div>${icon(ABILITY_ICON[s.archetype])}<span><em>Z HOLD</em>${arch.ability.hold}</span></div>
                </div>
                <div class="stats">
                  <div><span>SPEED</span><div class="bar">${bar(st.speed)}</div></div>
                  <div><span>POWER</span><div class="bar">${bar(st.dmg)}</div></div>
                  <div><span>TOUGHNESS</span><div class="bar">${bar(st.hp)}</div></div>
                </div>
              </div>
            </div>
            <div class="col-b">
              <div class="row-label"><span>02</span> WEAPON · STAKE</div>
              <div class="cards weapons" id="chips-weapon">
                ${weapons.map((wp, i) => `<button data-w="${i}" class="${s.weaponTier === i ? 'on' : ''}">${icon(wp.id, 'big')}<span class="wname"><b>${wp.name}</b><small>${wp.desc}</small></span><em>${fmt(STAKES[i])}</em><i class="tier">${'<u></u>'.repeat(i + 1)}</i></button>`).join('')}
              </div>
            </div>
            <aside class="col-c">
              <div class="district">
                <div class="district-head">${icon('map')}<div><b>${s.district}</b><span>${s.cityStats}</span></div></div>
                <canvas id="menu-map" width="156" height="214"></canvas>
                <div class="legend"><i style="--k:#ff4d2e"></i>mobs at the edges <i style="--k:#3d8bff"></i>squads in the plaza</div>
              </div>
              <div class="countdown">
                <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="ring-bg"/><circle cx="20" cy="20" r="17" class="ring" id="ring" style="stroke-dasharray:${(s.countdown / 20) * 106.8} 106.8"/></svg>
                <div><span>NEXT ROUND</span><b id="menu-count">0:${pad(s.countdown)}</b><small>${s.lobbyCount} queued</small></div>
              </div>
              <button class="join" id="btn-join"><span class="join-main">JOIN ROUND</span><span class="join-sub">STAKE ${fmt(STAKES[s.weaponTier])} · ${w.name.toUpperCase()}</span></button>
            </aside>
          </div>
        </section>
        <footer class="menu-foot">
          <div>${icon('run')}WASD · SHIFT RUN &nbsp; ${icon('target')}CLICK STRIKE · DRAG THROW &nbsp; ${icon('jump')}SPACE JUMP · 2× DUCK &nbsp; ${icon('cog')}Z ABILITY &nbsp; ${icon('refresh')}WHEEL / PINCH ZOOM</div>
          <button class="ghost tiny" id="btn-install">INSTALL APP</button>
        </footer>
      </div>`;
    this.root.querySelector('#seg-faction').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; this.set({ faction: b.dataset.f, archetype: FACTIONS[b.dataset.f].archetypes[0] }); };
    this.root.querySelector('#cards-arch').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.set({ archetype: b.dataset.a }); };
    this.root.querySelector('#chips-weapon').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) this.set({ weaponTier: +b.dataset.w }); };
    this.root.querySelector('#btn-join').onclick = () => this.onJoin();
    const inst = this.root.querySelector('#btn-install');
    if (window.__installPrompt) { inst.onclick = () => window.__installPrompt.prompt(); } else inst.style.display = 'none';
    this.drawMap();
  }
  drawMap() {
    const c = this.root.querySelector('#menu-map'); if (!c || !this.state.world) return;
    const mm = new Minimap(c); mm.setWorld(this.state.world, false);
    const ctx = c.getContext('2d'); ctx.drawImage(mm.bg, 0, 0);
    const W = this.state.world, C = W.center;
    ctx.strokeStyle = 'rgba(255,230,80,.6)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= W.SECTORS; i++) { const a = W.sectorAngle(i % W.SECTORS); const [x, y] = mm.toPx(C.x + Math.cos(a) * W.R0, C.z + Math.sin(a) * W.R0); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    for (const sp of (this.state.spawns || [])) { const [x, y] = mm.toPx(sp.x, sp.z); ctx.fillStyle = 'rgba(255,77,46,.9)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill(); }
    const [px, py] = mm.toPx(C.x, C.z); ctx.fillStyle = 'rgba(61,139,255,.95)'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 6.28); ctx.fill();
  }
  set(patch) { Object.assign(this.state, patch); this.render(); this.onChange(this.state); }
  tick() {
    const c = this.root.querySelector('#menu-count'); if (c) c.textContent = '0:' + pad(this.state.countdown);
    const r = this.root.querySelector('#ring'); if (r) r.style.strokeDasharray = `${(this.state.countdown / 20) * 106.8} 106.8`;
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
