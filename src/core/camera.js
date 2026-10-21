import * as THREE from 'three';

export class FollowCamera {
  constructor(camera, world) {
    this.cam = camera; this.world = world; this.yaw = 0; this.pitch = 0.42; this.dist = 6.2; this.autoYaw = true;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.shake = 0; this.manualYaw = 0;
  }
  snapTo(target) {
    this.yaw = target.yaw + Math.PI; this.pos.set(target.pos.x - Math.sin(target.yaw) * this.dist, target.y + 3, target.pos.z - Math.cos(target.yaw) * this.dist);
  }
  update(dt, target, input) {
    // yaw: follow the character's facing when moving, with manual offset from Q/E / right-drag
    if (input) { this.manualYaw += (input.camYaw - (this.lastInputYaw || 0)); this.lastInputYaw = input.camYaw; }
    const wantYaw = target.yaw + Math.PI + this.manualYaw;
    let d = wantYaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    const rate = target.moving ? 3.5 : 1.2;
    this.yaw += d * Math.min(1, dt * rate);
    this.manualYaw *= Math.max(0, 1 - dt * (target.moving ? 0.6 : 0.1));
    const h = target.y + 1.5 + (target.ducking ? -0.3 : 0);
    let dist = this.dist + (target.onRoof ? 2 : 0);
    // pull in if the camera would be inside a building
    const bx = target.pos.x + Math.sin(this.yaw) * dist, bz = target.pos.z + Math.cos(this.yaw) * dist;
    for (let t = 1; t >= 0.25; t -= 0.1) {
      const x = target.pos.x + Math.sin(this.yaw) * dist * t, z = target.pos.z + Math.cos(this.yaw) * dist * t;
      const b = this.world.buildingNear(x, z, 0.1);
      if (!b || (target.onRoof && h + dist * t * this.pitch > b.h)) { dist *= t; break; }
      if (t <= 0.3) dist *= 0.3;
    }
    const want = new THREE.Vector3(target.pos.x + Math.sin(this.yaw) * dist, h + dist * this.pitch + 0.6, target.pos.z + Math.cos(this.yaw) * dist);
    this.pos.lerp(want, Math.min(1, dt * 9));
    const lookWant = new THREE.Vector3(target.pos.x - Math.sin(this.yaw) * 2.5, h, target.pos.z - Math.cos(this.yaw) * 2.5);
    this.look.lerp(lookWant, Math.min(1, dt * 12));
    if (this.shake > 0) { this.shake -= dt; this.pos.x += (Math.random() - 0.5) * 0.2 * this.shake; this.pos.y += (Math.random() - 0.5) * 0.2 * this.shake; }
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look);
  }
}

/** Orbiting menu camera that keeps the selected lineup member framed. */
export class CinematicCamera {
  constructor(camera) { this.cam = camera; this.t = 0; this.focus = new THREE.Vector3(); this.cur = new THREE.Vector3(); this.first = true; }
  update(dt, focus, radius = 7, height = 3.2, offRight = 0, offUp = 0) {
    this.t += dt * 0.18;
    if (this.first) this.focus.copy(focus); else this.focus.lerp(focus, Math.min(1, dt * 2));
    const want = new THREE.Vector3(this.focus.x + Math.cos(this.t) * radius, this.focus.y + height, this.focus.z + Math.sin(this.t) * radius);
    if (this.first) { this.cur.copy(want); this.first = false; } else this.cur.lerp(want, Math.min(1, dt * 3));
    this.cam.position.copy(this.cur);
    // shift the look target along the camera's right/up so the subject sits beside/above the menu panel
    const fwd = new THREE.Vector3(this.focus.x - this.cur.x, 0, this.focus.z - this.cur.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.cam.lookAt(this.focus.x + right.x * offRight, this.focus.y + 1.0 + offUp, this.focus.z + right.z * offRight);
  }
}
