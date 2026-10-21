// All textures are generated procedurally on <canvas> so the game ships with zero image assets.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shade(hex, amt) {
  const c = new THREE.Color(hex); c.r = clamp(c.r + amt, 0, 1); c.g = clamp(c.g + amt, 0, 1); c.b = clamp(c.b + amt, 0, 1);
  return '#' + c.getHexString();
}
function noise(ctx, w, h, rng, amount = 0.08, count = 2500) {
  for (let i = 0; i < count; i++) {
    const a = rng.float(0, amount);
    ctx.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(rng.float(0, w), rng.float(0, h), rng.float(1, 4), rng.float(1, 4));
  }
}

/** Tileable cobblestone: rows of rounded stones with grout. */
export function cobblestone(seed = 1) {
  const S = 512; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#4a4742'; ctx.fillRect(0, 0, S, S);
  const rows = 14, cols = 14; const sw = S / cols, sh = S / rows;
  for (let r = -1; r <= rows; r++) {
    for (let q = -1; q <= cols; q++) {
      const ox = (r % 2) * sw * 0.5;
      const x = q * sw + ox + rng.float(-2, 2), y = r * sh + rng.float(-2, 2);
      const g = rng.float(-0.06, 0.06);
      ctx.fillStyle = shade('#6c675f', g);
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, sw - 4 + rng.float(-2, 2), sh - 4 + rng.float(-2, 2), 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 4, y + 3, sw - 10, 3);
    }
  }
  noise(ctx, S, S, rng, 0.1, 4000);
  return tex(c, 1);
}

/** Large stone slabs for the plaza. */
export function slabs(seed = 2) {
  const S = 512; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#8c8578'; ctx.fillRect(0, 0, S, S);
  const n = 4; const s = S / n;
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    ctx.fillStyle = shade('#a39b8b', rng.float(-0.07, 0.05));
    ctx.fillRect(q * s + 3, r * s + 3, s - 6, s - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(q * s + 3, r * s + s - 12, s - 6, 9);
  }
  noise(ctx, S, S, rng, 0.07, 5000);
  return tex(c, 1);
}

export function grass(seed = 3) {
  const S = 256; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#4f7a3a'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = shade('#55803d', rng.float(-0.12, 0.12));
    ctx.fillRect(rng.float(0, S), rng.float(0, S), 2, rng.float(2, 6));
  }
  return tex(c, 1);
}

export function roofTiles(seed = 4) {
  const S = 256; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#8a4a2f'; ctx.fillRect(0, 0, S, S);
  const rows = 10, cols = 8; const w = S / cols, h = S / rows;
  for (let r = 0; r <= rows; r++) for (let q = -1; q <= cols; q++) {
    const ox = (r % 2) * w * 0.5;
    ctx.fillStyle = shade('#b0633f', rng.float(-0.1, 0.08));
    ctx.beginPath(); ctx.roundRect(q * w + ox, r * h, w - 2, h + 4, [0, 0, w / 2, w / 2]); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(q * w + ox, r * h + h - 3, w - 2, 3);
  }
  return tex(c, 1);
}

export function concrete(seed = 5) {
  const S = 128; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#7d7a74'; ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, rng, 0.08, 1500);
  return tex(c, 1);
}

export const FACADE_STYLES = [
  { id: 'stone',    wall: '#c9b99a', trim: '#8f8370', shutter: null,      balcony: true,  arches: true,  awning: null },
  { id: 'ochre',    wall: '#d9a65a', trim: '#f0e6d2', shutter: '#3f5f3a', balcony: true,  arches: false, awning: '#8a2f2f' },
  { id: 'rose',     wall: '#d8958c', trim: '#f3e9e3', shutter: '#4a3b35', balcony: true,  arches: false, awning: '#2f4f6f' },
  { id: 'cream',    wall: '#efe4c8', trim: '#c9b99a', shutter: '#5c6e46', balcony: false, arches: true,  awning: '#3a6b4a' },
  { id: 'brick',    wall: '#a4553c', trim: '#d8cfc0', shutter: null,      balcony: true,  arches: true,  awning: null },
  { id: 'sage',     wall: '#9fb093', trim: '#f0f0e6', shutter: '#3b3b3b', balcony: true,  arches: false, awning: '#8a6a2f' },
  { id: 'marble',   wall: '#e9e6df', trim: '#bdb7ab', shutter: null,      balcony: true,  arches: true,  awning: null },
  { id: 'terracot', wall: '#c27a4e', trim: '#f2e8d8', shutter: '#2f3f5f', balcony: true,  arches: false, awning: '#6f2f2f' },
];

/**
 * Facade atlas: 1024x1024 split into 4x4 tiles of 256. Row r, col c => tile index r*4+c.
 * For style i: upper-floor bay tile at index i (0..7), ground-floor bay tile at index 8+i.
 * Returns { texture, uv(index) => [u0,v0,u1,v1] }.
 */
export function facadeAtlas(seed = 6) {
  const S = 1024, T = 256; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);

  function drawWall(x, y, style, stoneRows) {
    ctx.fillStyle = style.wall; ctx.fillRect(x, y, T, T);
    if (style.id === 'brick') {
      for (let r = 0; r < 24; r++) for (let q = -1; q < 12; q++) {
        const ox = (r % 2) * 11;
        ctx.fillStyle = shade('#a4553c', rng.float(-0.1, 0.08));
        ctx.fillRect(x + q * 22 + ox + 1, y + r * 11 + 1, 20, 9);
      }
    } else if (style.id === 'stone' || style.id === 'marble') {
      for (let r = 0; r < stoneRows; r++) for (let q = -1; q < 5; q++) {
        const ox = (r % 2) * 32;
        ctx.fillStyle = shade(style.wall, rng.float(-0.05, 0.04));
        ctx.fillRect(x + q * 64 + ox + 1, y + r * (T / stoneRows) + 1, 62, T / stoneRows - 2);
      }
    } else {
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = shade(style.wall, rng.float(-0.07, 0.05));
        ctx.fillRect(x + rng.float(0, T), y + rng.float(0, T), rng.float(2, 9), rng.float(2, 9));
      }
    }
    // subtle grime at bottom
    const g = ctx.createLinearGradient(0, y + T - 40, 0, y + T);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g; ctx.fillRect(x, y + T - 40, T, 40);
  }

  function drawWindow(x, y, w, h, style, arched) {
    // frame
    ctx.fillStyle = style.trim; ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    if (arched) { ctx.beginPath(); ctx.arc(x + w / 2, y - 6, w / 2 + 6, Math.PI, 0); ctx.fill(); }
    // glass
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#2b3542'); g.addColorStop(0.5, '#4a5f78'); g.addColorStop(1, '#1d2531');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (arched) { ctx.beginPath(); ctx.arc(x + w / 2, y, w / 2, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 4, y + 4, w * 0.35, h - 8);
    // mullions
    ctx.fillStyle = style.trim; ctx.fillRect(x + w / 2 - 2, y, 4, h); ctx.fillRect(x, y + h / 2 - 2, w, 4);
    // shutters
    if (style.shutter) {
      ctx.fillStyle = style.shutter;
      ctx.fillRect(x - 6 - 22, y - 6, 22, h + 12); ctx.fillRect(x + w + 6, y - 6, 22, h + 12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < h / 10; i++) { ctx.fillRect(x - 26, y - 2 + i * 10, 18, 2); ctx.fillRect(x + w + 8, y - 2 + i * 10, 18, 2); }
    }
  }

  function drawBalcony(x, y, w, style) {
    ctx.fillStyle = shade(style.trim, -0.15); ctx.fillRect(x - 14, y, w + 28, 8);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const bx = x - 14 + (w + 28) * (i / 10); ctx.moveTo(bx, y); ctx.lineTo(bx, y - 48); }
    ctx.moveTo(x - 14, y - 48); ctx.lineTo(x + w + 14, y - 48);
    ctx.moveTo(x - 14, y - 24); ctx.lineTo(x + w + 14, y - 24);
    ctx.stroke();
  }

  FACADE_STYLES.forEach((style, i) => {
    // upper floor bay tile
    const ux = (i % 4) * T, uy = Math.floor(i / 4) * T;
    drawWall(ux, uy, style, 8);
    const ww = 84, wh = 120, wx = ux + (T - ww) / 2, wy = uy + 56;
    drawWindow(wx, wy, ww, wh, style, style.arches && i % 2 === 0);
    if (style.balcony) drawBalcony(wx, wy + wh + 6, ww, style);
    // floor band / cornice line at the top
    ctx.fillStyle = shade(style.trim, 0.05); ctx.fillRect(ux, uy, T, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(ux, uy + 10, T, 4);

    // ground floor bay tile
    const gi = 8 + i; const gx = (gi % 4) * T, gy = Math.floor(gi / 4) * T;
    drawWall(gx, gy, style, 6);
    const variant = i % 3;
    if (variant === 0) {
      // arched doorway
      ctx.fillStyle = shade(style.trim, -0.1); ctx.fillRect(gx + 60, gy + 70, 136, 186);
      ctx.beginPath(); ctx.arc(gx + 128, gy + 70, 68, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#3a2a22'; ctx.fillRect(gx + 72, gy + 82, 112, 174);
      ctx.beginPath(); ctx.arc(gx + 128, gy + 82, 56, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(gx + 76, gy + 90, 40, 160);
    } else if (variant === 1) {
      // shop front with awning
      ctx.fillStyle = '#1e2730'; ctx.fillRect(gx + 24, gy + 96, 208, 160);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(gx + 30, gy + 100, 80, 150);
      ctx.fillStyle = style.trim; ctx.fillRect(gx + 18, gy + 90, 220, 8); ctx.fillRect(gx + 126, gy + 96, 6, 160);
      if (style.awning) {
        ctx.fillStyle = style.awning; ctx.fillRect(gx + 8, gy + 56, 240, 34);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let s = 0; s < 240; s += 24) ctx.fillRect(gx + 8 + s, gy + 56, 12, 34);
      }
      // sign
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(gx + 40, gy + 30, 176, 22);
      ctx.fillStyle = '#e8d8a8'; ctx.fillRect(gx + 52, gy + 38, 50, 6); ctx.fillRect(gx + 112, gy + 38, 30, 6); ctx.fillRect(gx + 150, gy + 38, 52, 6);
    } else {
      // tall ground floor window + door
      ctx.fillStyle = style.trim; ctx.fillRect(gx + 24, gy + 60, 120, 196);
      ctx.fillStyle = '#26303c'; ctx.fillRect(gx + 32, gy + 68, 104, 188);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(gx + 36, gy + 72, 36, 180);
      ctx.fillStyle = shade(style.trim, -0.1); ctx.fillRect(gx + 160, gy + 70, 80, 186);
      ctx.fillStyle = '#4a3326'; ctx.fillRect(gx + 168, gy + 78, 64, 178);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(gx + 220, gy + 168, 6, 6);
    }
    // plinth
    ctx.fillStyle = shade(style.wall, -0.2); ctx.fillRect(gx, gy + T - 14, T, 14);
  });

  // tile 14: flat roof concrete, tile 15: terracotta roof tiles (so a whole building is one material)
  {
    const x = (14 % 4) * T, y = Math.floor(14 / 4) * T;
    ctx.fillStyle = '#8d8a83'; ctx.fillRect(x, y, T, T);
    for (let i = 0; i < 700; i++) { ctx.fillStyle = shade('#8d8a83', rng.float(-0.08, 0.06)); ctx.fillRect(x + rng.float(0, T), y + rng.float(0, T), rng.float(2, 7), rng.float(2, 7)); }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y, T, 6); ctx.fillRect(x, y + T - 6, T, 6); ctx.fillRect(x, y, 6, T); ctx.fillRect(x + T - 6, y, 6, T);
  }
  {
    const x = (15 % 4) * T, y = Math.floor(15 / 4) * T;
    ctx.fillStyle = '#8a4a2f'; ctx.fillRect(x, y, T, T);
    const rows = 10, cols = 8; const w = T / cols, h = T / rows;
    for (let r = 0; r <= rows; r++) for (let q = -1; q <= cols; q++) {
      const ox = (r % 2) * w * 0.5;
      ctx.fillStyle = shade('#b0633f', rng.float(-0.1, 0.08));
      ctx.beginPath(); ctx.roundRect(x + q * w + ox, y + r * h, w - 2, h + 4, [0, 0, w / 2, w / 2]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + q * w + ox, y + r * h + h - 3, w - 2, 3);
    }
  }
  const t = tex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const uv = (index) => {
    const cx = index % 4, cy = Math.floor(index / 4);
    const pad = 2 / S;
    // canvas y is top-down; three UV v is bottom-up
    return [cx / 4 + pad, 1 - (cy + 1) / 4 + pad, (cx + 1) / 4 - pad, 1 - cy / 4 - pad];
  };
  return { texture: t, uv };
}

/** Tattoo-ish pattern used on brawler arms. */
export function tattoo(seed = 7) {
  const S = 128; const [c, ctx] = canvas(S, S); const rng = new RNG(seed);
  ctx.fillStyle = '#d9a784'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#2a3a3a'; ctx.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    const x = rng.float(0, S), y = rng.float(0, S);
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(rng.float(0, S), rng.float(0, S), rng.float(0, S), rng.float(0, S));
    ctx.stroke();
  }
  ctx.fillStyle = '#2a3a3a';
  for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(rng.float(0, S), rng.float(0, S), rng.float(3, 9), 0, 7); ctx.fill(); }
  const t = tex(c, 1); return t;
}

/** Soft radial particle sprite. */
export function particleSprite() {
  const S = 64; const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Painted "line" stripe across the avenue. */
export function lineStripe() {
  const S = 128; const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,230,80,0.85)';
  for (let i = 0; i < S; i += 32) ctx.fillRect(i, 48, 20, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1); return t;
}
