// Unified input: WASD/arrows + mouse (click = melee, click-drag swipe = aimed throw, hold X = throw forward,
// Space = jump / double-tap = duck, Z tap/hold = ability, Q/E = orbit camera) and touch (static joystick,
// tap = melee, swipe = throw, on-screen Jump / Ability buttons).
export class Input {
  constructor(canvas, hud) {
    this.canvas = canvas; this.hud = hud;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.events = [];             // discrete: {type:'attack'|'throw'|'jump'|'duck'|'abilityTap'|'abilityHold'|'abilityRelease', ...}
    this.attackHeld = false; this.abilityHeld = false; this.abilityHoldT = 0; this.abilityDown = false;
    this.xDown = 0; this.lastSpace = 0; this.camYaw = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.pointer = null; this.joy = null;
    this.enabled = false;
    this.bind();
  }
  bind() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return; this.keys.add(k);
      if (k === ' ') { const now = performance.now(); if (now - this.lastSpace < 280) this.events.push({ type: 'duck' }); else this.events.push({ type: 'jump' }); this.lastSpace = now; }
      if (k === 'x') { this.xDown = performance.now(); this.attackHeld = true; }
      if (k === 'z') this.abilityPress();
      if (k === 'escape') this.events.push({ type: 'pause' });
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase(); this.keys.delete(k);
      if (!this.enabled) return;
      if (k === 'x') {
        const held = performance.now() - this.xDown; this.attackHeld = false;
        if (held > 260) this.events.push({ type: 'throw', forward: true, power: Math.min(1, held / 1200) }); else this.events.push({ type: 'attack' });
      }
      if (k === 'z') this.abilityRelease();
    });
    addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; if (this.abilityDown) this.abilityRelease(); });

    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      c.setPointerCapture(e.pointerId);
      const joyZone = this.isTouch && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35;
      if (joyZone && !this.joy) { this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; this.hud?.joystick(true, e.clientX, e.clientY, 0, 0); return; }
      if (this.pointer) return;
      this.pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), button: e.button };
      if (e.button === 0 && !this.isTouch) this.attackHeld = true;
    });
    c.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy.x = e.clientX; this.joy.y = e.clientY;
        let dx = (this.joy.x - this.joy.ox) / 55, dy = (this.joy.y - this.joy.oy) / 55; const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        this.move.x = dx; this.move.y = -dy; this.hud?.joystick(true, this.joy.ox, this.joy.oy, dx, dy); return;
      }
      if (this.pointer && e.pointerId === this.pointer.id) {
        this.pointer.x = e.clientX; this.pointer.y = e.clientY;
        if (this.pointer.button === 2 || this.keys.has('shift')) { this.camYaw -= (e.movementX || 0) * 0.005; }
        const d = Math.hypot(this.pointer.x - this.pointer.x0, this.pointer.y - this.pointer.y0);
        if (d > 30 && this.pointer.button === 0) { this.attackHeld = false; this.hud?.aim(this.pointer.x0, this.pointer.y0, this.pointer.x, this.pointer.y); }
      }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.move.x = 0; this.move.y = 0; this.hud?.joystick(false); return; }
      if (this.pointer && e.pointerId === this.pointer.id) {
        const p = this.pointer; this.pointer = null; this.attackHeld = false; this.hud?.aim(null);
        if (!this.enabled) return;
        const dx = p.x - p.x0, dy = p.y - p.y0, d = Math.hypot(dx, dy), held = performance.now() - p.t0;
        if (p.button === 2) return;
        if (d > 30) this.events.push({ type: 'throw', sx: dx / d, sy: dy / d, power: Math.min(1, d / 260) });
        else if (held < 450) this.events.push({ type: 'attack' });
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  abilityPress() { if (this.abilityDown) return; this.abilityDown = true; this.abilityHoldT = 0; this.events.push({ type: 'abilityDown' }); }
  abilityRelease() { if (!this.abilityDown) return; this.abilityDown = false; this.events.push({ type: this.abilityHoldT < 0.3 ? 'abilityTap' : 'abilityRelease', held: this.abilityHoldT }); this.abilityHoldT = 0; }
  jumpPress() { const now = performance.now(); if (now - this.lastSpace < 280) this.events.push({ type: 'duck' }); else this.events.push({ type: 'jump' }); this.lastSpace = now; }
  update(dt) {
    if (!this.joy) {
      const k = this.keys; let x = 0, y = 0;
      if (k.has('a') || k.has('arrowleft')) x -= 1; if (k.has('d') || k.has('arrowright')) x += 1;
      if (k.has('w') || k.has('arrowup')) y += 1; if (k.has('s') || k.has('arrowdown')) y -= 1;
      const l = Math.hypot(x, y) || 1; this.move.x = x / l; this.move.y = y / l;
    }
    if (this.keys.has('q')) this.camYaw += dt * 2.2; if (this.keys.has('e')) this.camYaw -= dt * 2.2;
    if (this.abilityDown) this.abilityHoldT += dt;
  }
  drain() { const e = this.events; this.events = []; return e; }
}
