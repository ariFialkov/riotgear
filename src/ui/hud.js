// In-round HUD (DOM): money/time, distance, ammo, ability button, joystick, toasts, overlays, result screen.
import { ARCHETYPES, PROJECTILES, M_TO_FT } from '../data/config.js';
import { Minimap } from './minimap.js';

const fmt = (n) => '$' + n.toFixed(2);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class HUD {
  constructor(root, input) {
    this.root = root; this.input = input; this.selectedThrow = null; this.game = null;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-chip" id="hud-arch"></div>
          <div class="hud-money" id="hud-money">$0.00</div>
          <div class="hud-time" id="hud-time">0:00</div>
          <div class="hud-popups" id="hud-popups"></div>
        </div>
        <div class="hud-right">
          <div class="hud-stat"><span>YOU</span><b id="hud-adv">0 ft</b></div>
          <div class="hud-stat"><span id="hud-line-label">MOB LINE</span><b id="hud-line">0 ft</b></div>
          <div class="hud-ammo" id="hud-ammo"></div>
          <div class="hud-strategy hidden" id="hud-strategy"></div>
          <canvas class="hud-minimap" id="hud-minimap" width="132" height="182"></canvas>
        </div>
      </div>
      <div class="hud-hp"><div id="hud-hp-bar"></div></div>
      <div class="hud-building hidden" id="hud-building"><span></span><div><i></i></div></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-feed" id="hud-feed"></div>
      <div class="hud-charge hidden" id="hud-charge"><div><i></i></div><span></span></div>
      <div class="hud-joy hidden" id="hud-joy"><div class="joy-base"></div><div class="joy-knob"></div></div>
      <div class="hud-aim hidden" id="hud-aim"></div>
      <div class="hud-buttons" id="hud-buttons">
        <button class="hud-btn" id="btn-jump">JUMP<small>2× duck</small></button>
        <button class="hud-btn primary" id="btn-ability">Z<small></small></button>
      </div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="overlay-flash" id="ov-flash"></div>
      <div class="overlay-gas" id="ov-gas"></div>
      <div class="overlay-ko hidden" id="ov-ko"><div>YOU'RE DOWN</div><small>your crew is pulling you out…</small></div>
    `;
    this.$ = (id) => root.querySelector('#' + id);
    this.bindButtons();
    this.minimap = new Minimap(this.$('hud-minimap'));
    this.toastT = 0; this.lastGasT = 0; this.feedItems = [];
  }
  bindButtons() {
    const ab = this.$('btn-ability'), jb = this.$('btn-jump');
    const down = (e) => { e.preventDefault(); ab.classList.add('down'); this.input.abilityPress(); };
    const up = (e) => { e.preventDefault(); ab.classList.remove('down'); this.input.abilityRelease(); };
    ab.addEventListener('pointerdown', down); ab.addEventListener('pointerup', up); ab.addEventListener('pointercancel', up); ab.addEventListener('pointerleave', (e) => { if (ab.classList.contains('down')) up(e); });
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.jumpPress(); });
    this.$('hud-ammo').addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-type]'); if (!el) return; this.selectedThrow = el.dataset.type; this.refreshAmmo();
    });
  }
  start(game) {
    this.game = game; this.root.classList.remove('hidden');
    const pl = game.player;
    this.root.classList.toggle('touch', this.input.isTouch);
    this.root.classList.toggle('spectate', !pl);
    if (pl) {
      this.$('hud-arch').textContent = `${pl.arch.name} · ${pl.weapon.name}`;
      this.$('hud-arch').style.setProperty('--c', pl.faction === 'rioter' ? '#ff4d2e' : '#3d8bff');
      this.$('hud-line-label').textContent = pl.faction === 'rioter' ? 'MOB LINE' : 'SQUAD LINE';
      const a = pl.arch.ability; this.$('btn-ability').querySelector('small').textContent = a.tap !== '—' ? a.tap : a.hold;
      this.$('hud-hint').innerHTML = this.input.isTouch
        ? `Joystick to move · tap to strike · swipe to throw · <b>Z</b>: tap = ${a.tap} · hold = ${a.hold}`
        : `WASD move · click/X strike · click-drag or hold X throw · Space jump (2× duck) · <b>Z</b> tap = ${a.tap} · hold = ${a.hold} · Q/E camera`;
      setTimeout(() => this.$('hud-hint').classList.add('fade'), 9000);
    } else { this.$('hud-arch').textContent = 'SPECTATING'; this.$('hud-hint').textContent = ''; }
    this.$('hud-strategy').classList.add('hidden'); this.$('ov-ko').classList.add('hidden');
    this.refreshAmmo(); this.feedItems = []; this.$('hud-feed').innerHTML = ''; this.$('hud-popups').innerHTML = '';
  }
  stop() { this.root.classList.add('hidden'); }
  update(g) {
    const pl = g.player;
    this.$('hud-time').textContent = fmtTime(g.time);
    if (pl) {
      this.$('hud-money').textContent = fmt(g.money);
      this.$('hud-adv').textContent = `${Math.round(g.stats.advance)} ft`;
      this.$('hud-line').textContent = `${Math.round(Math.max(0, g.front.z * pl.dir) * M_TO_FT)} ft`;
      this.$('hud-hp-bar').style.width = `${Math.max(0, pl.hp / pl.maxHp) * 100}%`;
      this.$('hud-hp-bar').style.background = pl.hp / pl.maxHp > 0.4 ? '#58d36c' : '#ff4d2e';
      if (pl.arch.gun) this.refreshAmmo();
      if (g.time - this.lastGasT > 0.3) this.$('ov-gas').style.opacity = 0;
    } else {
      this.$('hud-money').textContent = `LINE ${Math.round(g.meanFront() * M_TO_FT)} ft`;
    }
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - 0.05); this.$('ov-flash').style.opacity = this.flashV; }
  }
  refreshAmmo() {
    const pl = this.game?.player; if (!pl) return;
    const types = pl.faction === 'rioter' ? ['rock', 'molotov'] : ['teargas', 'flashbang'];
    if (!this.selectedThrow || !types.includes(this.selectedThrow)) this.selectedThrow = types.find((t) => pl.inventory[t] > 0) || types[0];
    let html = types.map((t) => `<div data-type="${t}" class="${this.selectedThrow === t ? 'sel' : ''}"><i style="background:${PROJECTILES[t].color}"></i>${PROJECTILES[t].name} <b>${pl.inventory[t] || 0}</b></div>`).join('');
    if (pl.arch.gun) html += `<div><i style="background:#222"></i>Rubber <b>${pl.reloadT > 0 ? '…' : pl.fireAmmo}</b></div>`;
    this.$('hud-ammo').innerHTML = html;
  }
  toast(msg, kind = '') {
    const el = this.$('hud-toast'); el.textContent = msg; el.className = 'hud-toast show ' + kind;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  feed(msg) {
    const el = this.$('hud-feed'); const d = document.createElement('div'); d.textContent = msg; el.appendChild(d);
    while (el.children.length > 4) el.removeChild(el.firstChild);
    setTimeout(() => d.classList.add('fade'), 3500); setTimeout(() => d.remove(), 5000);
  }
  popup(label, amount) {
    const el = this.$('hud-popups'); const d = document.createElement('div'); d.innerHTML = `<b>+${fmt(amount)}</b> ${label}`; el.appendChild(d);
    while (el.children.length > 5) el.removeChild(el.firstChild);
    setTimeout(() => d.remove(), 1800);
  }
  strategy(grp, s) {
    const el = this.$('hud-strategy'); el.classList.remove('hidden');
    el.innerHTML = `<span>${grp.name} · ${grp.corridorName.toUpperCase()} · COMMANDING</span><b>${s.name}</b><small>${s.desc}</small>`;
  }
  charge(v, label = '') {
    const el = this.$('hud-charge');
    if (v <= 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.querySelector('i').style.width = `${v * 100}%`; el.querySelector('span').textContent = label;
  }
  buildingHealth(b) {
    const el = this.$('hud-building'); el.classList.remove('hidden');
    el.querySelector('span').textContent = `BUILDING ${Math.max(0, Math.round((b.hp / b.maxHp) * 100))}%${b.burning > 0 ? ' · ON FIRE' : ''}`;
    el.querySelector('i').style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    clearTimeout(this.bTimer); this.bTimer = setTimeout(() => el.classList.add('hidden'), 2000);
  }
  flash(v) { this.flashV = Math.max(this.flashV || 0, v); this.$('ov-flash').style.opacity = this.flashV; }
  gas(on) { if (this.game) this.lastGasT = this.game.time; this.$('ov-gas').style.opacity = on ? 1 : 0; }
  koOverlay(on) { this.$('ov-ko').classList.toggle('hidden', !on); }
  joystick(on, ox, oy, dx, dy) {
    const el = this.$('hud-joy'); el.classList.toggle('hidden', !on); if (!on) return;
    el.style.left = `${ox}px`; el.style.top = `${oy}px`;
    el.querySelector('.joy-knob').style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  }
  aim(x0, y0, x1, y1) {
    const el = this.$('hud-aim'); if (x0 === null || x0 === undefined) { el.classList.add('hidden'); return; }
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    el.classList.remove('hidden'); el.style.left = `${x0}px`; el.style.top = `${y0}px`; el.style.width = `${l}px`; el.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    el.style.opacity = Math.min(1, l / 260) * 0.8 + 0.2;
  }
  pulseAttack() {}
}

export function renderResult(root, game, balance, onBack) {
  const o = game.outcome, s = game.stats, pl = game.player;
  const reasonText = { ko: 'KNOCKED OUT', arrested: 'ARRESTED', dispersed: 'RIOT DISPERSED · ORDER RESTORED', broken: 'LINES BROKEN · POLICE FELL BACK', whistle: 'ROUND OVER' }[game.reason] || 'ROUND OVER';
  const win = o.payout >= game.stake;
  root.innerHTML = `
    <div class="result-card">
      <div class="result-reason">${reasonText}</div>
      <div class="result-payout ${win ? 'win' : 'loss'}">${fmt(o.payout)}</div>
      <div class="result-mult">${o.multiplier.toFixed(2)}× on a ${fmt(game.stake)} stake · ${pl.arch.name} · ${pl.weapon.name}</div>
      <div class="result-grid">
        <div><span>Time alive</span><b>${fmtTime(game.time)}</b></div>
        <div><span>Your advance</span><b>${Math.round(s.advance)} ft</b></div>
        <div><span>${pl.faction === 'rioter' ? 'Mob' : 'Squad'} push</span><b>${Math.round(s.linePush)} ft</b></div>
        <div><span>Knockouts</span><b>${s.kos}</b></div>
        <div><span>Props wrecked</span><b>${s.props}</b></div>
        <div><span>${pl.faction === 'rioter' ? 'Looted' : 'Mobs quelled'}</span><b>${pl.faction === 'rioter' ? s.loot : s.quelled}</b></div>
        ${s.buildings ? `<div><span>Buildings down</span><b>${s.buildings}</b></div>` : ''}
      </div>
      <div class="result-balance">Balance <b>${fmt(balance)}</b></div>
      <button class="big-btn" id="btn-back">BACK TO LOBBY</button>
    </div>`;
  root.querySelector('#btn-back').onclick = onBack;
}
