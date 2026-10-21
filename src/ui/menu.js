// Lobby menu: faction switch, archetype selector, weapon/stake selector, join/spectate, countdown.
import { FACTIONS, ARCHETYPES, WEAPONS, STAKES } from '../data/config.js';

const fmt = (n) => '$' + n.toFixed(2);

export class Menu {
  constructor(root, state, { onChange, onJoin, onSpectate }) {
    this.root = root; this.state = state; this.onChange = onChange; this.onJoin = onJoin; this.onSpectate = onSpectate;
    this.render();
  }
  render() {
    const s = this.state, F = FACTIONS[s.faction];
    const arch = ARCHETYPES[s.archetype], weapons = WEAPONS[s.faction], w = weapons[s.weaponTier];
    this.root.innerHTML = `
      <div class="menu-top">
        <div class="logo">RIOT<span>GEAR</span></div>
        <div class="balance">BALANCE <b id="menu-balance">${fmt(s.balance)}</b></div>
      </div>
      <div class="menu-panel ${s.live ? 'live' : ''}" style="--c:${F.color};--a:${F.accent}">
        <div class="seg" id="seg-faction">
          ${Object.values(FACTIONS).map((f) => `<button data-f="${f.id}" class="${s.faction === f.id ? 'on' : ''}" style="--c:${f.color}">${f.name.toUpperCase()}</button>`).join('')}
        </div>
        <div class="tagline">${F.tagline}</div>
        <div class="row-label">ARCHETYPE</div>
        <div class="cards" id="cards-arch">
          ${F.archetypes.map((id) => { const a = ARCHETYPES[id]; return `<button data-a="${id}" class="${s.archetype === id ? 'on' : ''}"><b>${a.name}</b><small>${a.ability.hold !== '—' ? a.ability.hold : a.ability.tap}</small></button>`; }).join('')}
        </div>
        <div class="arch-blurb">${arch.blurb}<div class="abil"><span>Z tap</span> ${arch.ability.tap} &nbsp; <span>Z hold</span> ${arch.ability.hold}</div></div>
        <div class="row-label">WEAPON · STAKE</div>
        <div class="chips" id="chips-weapon">
          ${weapons.map((wp, i) => `<button data-w="${i}" class="${s.weaponTier === i ? 'on' : ''}"><b>${wp.name}</b><small>${fmt(STAKES[i])}</small></button>`).join('')}
        </div>
        <div class="weapon-desc">${w.desc}</div>
        <div class="join-row">
          <button class="big-btn join ${s.queued ? 'queued' : ''}" id="btn-join">${s.live ? (s.queued ? '✓ QUEUED FOR NEXT ROUND' : `JOIN NEXT ROUND · STAKE ${fmt(STAKES[s.weaponTier])}`) : `JOIN ROUND · STAKE ${fmt(STAKES[s.weaponTier])}`}</button>
          <button class="ghost-btn" id="btn-spectate">${s.live ? 'WATCH' : 'SPECTATE'}</button>
        </div>
        <div class="countdown" id="menu-countdown">${s.live ? `<span class="live-badge">LIVE</span>Round in progress · ${s.lobbyCount} playing` : `Next round starts in <b id="menu-count">${s.countdown}</b>s · ${s.lobbyCount} players queued`}</div>
      </div>
      <div class="menu-foot">
        <div class="controls-hint">WASD / joystick move · click / tap strike · drag / swipe throw · Space jump · Z ability</div>
        <button class="ghost-btn tiny" id="btn-install" class="hidden">INSTALL APP</button>
      </div>`;
    this.root.querySelector('#seg-faction').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; this.set({ faction: b.dataset.f, archetype: FACTIONS[b.dataset.f].archetypes[0] }); };
    this.root.querySelector('#cards-arch').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.set({ archetype: b.dataset.a }); };
    this.root.querySelector('#chips-weapon').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) this.set({ weaponTier: +b.dataset.w }); };
    this.root.querySelector('#btn-join').onclick = () => this.onJoin();
    this.root.querySelector('#btn-spectate').onclick = () => this.onSpectate();
    const inst = this.root.querySelector('#btn-install');
    if (window.__installPrompt) { inst.classList.remove('hidden'); inst.onclick = () => window.__installPrompt.prompt(); } else inst.style.display = 'none';
  }
  set(patch) { Object.assign(this.state, patch); this.render(); this.onChange(this.state); }
  tick() { const c = this.root.querySelector('#menu-count'); if (c) c.textContent = this.state.countdown; const b = this.root.querySelector('#menu-balance'); if (b) b.textContent = fmt(this.state.balance); }
  show() { this.root.classList.remove('hidden'); this.render(); }
  hide() { this.root.classList.add('hidden'); }
}
