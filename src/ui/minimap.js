// Minimap: streets/buildings from the collision grid, every mob and squad (player, bots, NPCs),
// and the dynamic front line across all corridors. Oriented so the player's side is at the bottom.
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
    if (!this.world || this.world !== game.world) this.setWorld(game.world, (game.player?.dir ?? 1) < 0);
    const ctx = this.ctx, W = this.world;
    ctx.drawImage(this.bg, 0, 0);
    // original line
    const [, ly] = this.toPx(0, 0); ctx.strokeStyle = 'rgba(255,230,80,.5)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(this.c.width, ly); ctx.stroke(); ctx.setLineDash([]);
    // front line: one segment per corridor, joined
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath();
    const pts = [];
    game.fronts.forEach((f, i) => {
      const cx = W.corridorX(i, f.z), h = W.corridorHalf(i, f.z);
      const [x0, y] = this.toPx(cx - h, f.z), [x1] = this.toPx(cx + h, f.z);
      pts.push([x0, y, x1]);
    });
    pts.forEach(([x0, y, x1], i) => { if (i === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0, y); ctx.lineTo(x1, y); });
    ctx.stroke();
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
      const a = pl.yaw, s = this.flip ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * 8, y - Math.cos(a) * 8 * s); ctx.stroke();
    }
  }
}
