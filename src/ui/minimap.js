// Minimap: streets/buildings from the collision grid, every mob and squad (player, bots, NPCs),
// and the contested perimeter around the core (one radius per sector). North is up.
export class Minimap {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.bg = null; this.acc = 0; this.world = null;
  }
  setWorld(world, flip) {
    this.world = world; this.flip = flip;
    const W = world.gw, D = world.gd;
    this.scale = Math.min(this.c.width / W, this.c.height / D);
    const off = document.createElement('canvas'); off.width = this.c.width; off.height = this.c.height;
    const o = off.getContext('2d');
    o.fillStyle = '#12151c'; o.fillRect(0, 0, off.width, off.height);
    const img = o.createImageData(off.width, off.height);
    for (let py = 0; py < off.height; py++) for (let px = 0; px < off.width; px++) {
      const x = world.minX + px / this.scale, zz = world.minZ + py / this.scale;
      const z = flip ? world.maxZ - (zz - world.minZ) : zz;
      if (!world.inBounds(x, z)) continue;
      const blocked = world.grid[world.gi(x, z)] !== 0;
      const inPlaza = x > world.plaza.x0 && x < world.plaza.x1 && z > world.plaza.z0 && z < world.plaza.z1;
      const i = (py * off.width + px) * 4;
      const [r, g, b] = blocked ? [34, 38, 48] : inPlaza ? [120, 112, 96] : [88, 92, 104];
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    o.putImageData(img, 0, 0);
    this.bg = off;
  }
  toPx(x, z) {
    const W = this.world; const zz = this.flip ? W.maxZ - (z - W.minZ) : z;
    return [(x - W.minX) * this.scale, (zz - W.minZ) * this.scale];
  }
  update(game, dt) {
    this.acc += dt; if (this.acc < 0.12) return; this.acc = 0;
    if (!this.world || this.world !== game.world) this.setWorld(game.world, false);
    const ctx = this.ctx, W = this.world;
    ctx.drawImage(this.bg, 0, 0);
    const C = W.center;
    // original perimeter (dashed) and the live contested perimeter (solid), one radius per sector
    const poly = (radii, style, dash) => {
      ctx.strokeStyle = style; ctx.setLineDash(dash); ctx.lineWidth = dash.length ? 1 : 2; ctx.beginPath();
      const n = radii.length;
      for (let i = 0; i <= n; i++) {
        const k = i % n, a = W.sectorAngle(k); const [x, y] = this.toPx(C.x + Math.cos(a) * radii[k], C.z + Math.sin(a) * radii[k]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    poly(game.fronts.map(() => W.R0), 'rgba(255,230,80,.45)', [3, 3]);
    poly(game.fronts.map((f) => f.r), '#ffffff', []);
    // group goals
    for (const g of game.groups) { if (g.quelled) continue; const [x, y] = this.toPx(g.goal.x, g.goal.z); ctx.fillStyle = g.faction === 'rioter' ? 'rgba(255,77,46,.35)' : 'rgba(61,139,255,.35)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill(); }
    // characters
    for (const c of game.characters) {
      if (c.removed || c.arrested) continue;
      const [x, y] = this.toPx(c.pos.x, c.pos.z);
      const col = c.faction === 'rioter' ? '255,77,46' : '61,139,255';
      const alpha = c.isNpc ? 0.55 : 1;
      ctx.fillStyle = `rgba(${col},${c.alive ? alpha : 0.25})`;
      ctx.beginPath(); ctx.arc(x, y, c.isBot ? 2 : 1.5, 0, 6.28); ctx.fill();
    }
    // group labels at centroids
    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const g of game.groups) {
      const m = g.conscious(); if (!m.length || g.quelled) continue;
      const cx = m.reduce((a, c) => a + c.pos.x, 0) / m.length, cz = m.reduce((a, c) => a + c.pos.z, 0) / m.length;
      const [x, y] = this.toPx(cx, cz);
      const label = g.faction === 'rioter' ? g.name.slice(-1) : g.name.slice(-1);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = g.faction === 'rioter' ? '#ffb4a3' : '#bcd8ff'; ctx.fillText(label, x, y - 6);
    }
    // player
    const pl = game.player;
    if (pl) {
      const [x, y] = this.toPx(pl.pos.x, pl.pos.z);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.28); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.28); ctx.fill();
      const a = game.followCam ? game.followCam.yaw + Math.PI : pl.yaw, s = this.flip ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * 8, y + Math.cos(a) * 8 * s); ctx.stroke();
    }
  }
}
