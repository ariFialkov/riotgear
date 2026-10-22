import * as THREE from 'three';

export class FollowCamera {
  constructor(camera, world) {
    this.cam = camera; this.world = world; this.yaw = 0; this.pitch = 0.38; this.baseDist = 4.9; this.zoom = 1; this.autoYaw = true;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.shake = 0; this.manualYaw = 0;
  }
  get dist() { return this.baseDist * this.zoom; }
  snapTo(target) {
    this.yaw = target.yaw + Math.PI; this.pos.set(target.pos.x - Math.sin(target.yaw) * this.dist, target.y + 3, target.pos.z - Math.cos(target.yaw) * this.dist);
  }
  update(dt, target, input) {
    // Rigid follow: the camera only turns to follow the character when they travel forward
    // (stick/W mostly pushed forward), never on strafes, turns-in-place or combat facing snaps.
    // Manual orbit (Q/E, right-drag) is added on top and holds until the player moves forward.
    if (input) { this.manualYaw += (input.camYaw - (this.lastInputYaw || 0)); this.lastInputYaw = input.camYaw; this.zoom = Math.max(0.55, Math.min(2.2, this.zoom * input.takeZoom())); }
    const fwd = this.inputFwd ?? 0, side = this.inputSide ?? 0;
    const travelling = target.moving && fwd > 0.35 && Math.abs(side) < 0.9;
    if (travelling) {
      const wantYaw = target.yaw + Math.PI + this.manualYaw;
      let d = wantYaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.12) this.yaw += d * Math.min(1, dt * 2.2);
      this.manualYaw *= Math.max(0, 1 - dt * 0.8);
    } else {
      // allow manual orbit to apply immediately even when standing still
      const dm = input ? (input.camYaw - (this.appliedInputYaw || 0)) : 0;
      if (input) this.appliedInputYaw = input.camYaw;
      this.yaw += dm; this.manualYaw -= dm;
    }
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
    this.pos.lerp(want, Math.min(1, dt * 7));
    const lookWant = new THREE.Vector3(target.pos.x - Math.sin(this.yaw) * 2.5, h, target.pos.z - Math.cos(this.yaw) * 2.5);
    this.look.lerp(lookWant, Math.min(1, dt * 14));
    if (this.shake > 0) { this.shake -= dt; this.pos.x += (Math.random() - 0.5) * 0.2 * this.shake; this.pos.y += (Math.random() - 0.5) * 0.2 * this.shake; }
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look);
  }
}

/** Orbiting menu camera that keeps the selected lineup member framed. */
export class CinematicCamera {
  constructor(camera) { this.cam = camera; this.t = 0; this.focus = new THREE.Vector3(); this.cur = new THREE.Vector3(); this.first = true; }
  update(dt, focus, radius = 7, height = 3.2, offRight = 0, offUp = 0, faceAngle = 0) {
    this.t += dt * 0.35;
    if (this.first) this.focus.copy(focus); else this.focus.lerp(focus, Math.min(1, dt * 2));
    // slow sweep across the front arc of the lineup (they face `faceAngle`), never behind them
    const a = faceAngle + Math.sin(this.t) * 0.85;
    const want = new THREE.Vector3(this.focus.x + Math.sin(a) * radius, this.focus.y + height, this.focus.z + Math.cos(a) * radius);
    if (this.first) { this.cur.copy(want); this.first = false; } else this.cur.lerp(want, Math.min(1, dt * 3));
    this.cam.position.copy(this.cur);
    // shift the look target along the camera's right/up so the subject sits beside/above the menu panel
    const fwd = new THREE.Vector3(this.focus.x - this.cur.x, 0, this.focus.z - this.cur.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.cam.lookAt(this.focus.x + right.x * offRight, this.focus.y + 1.0 + offUp, this.focus.z + right.z * offRight);
  }
}
