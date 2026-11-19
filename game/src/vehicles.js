// Cars for NEON BAY: low-poly box-built cars with arcade driving physics,
// enter/exit, damage and wreck states. Police cars carry a light bar.
import * as THREE from 'three';
import { clamp, angleLerp, circleVsBox } from './utils.js';

export function buildCarMesh(color, kind = 'civilian') {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glass);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
    h.position.set(x, 0.62, 2.21);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const x of [-0.62, 0.62]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tailMat);
    t.position.set(x, 0.62, -2.21);
    group.add(t);
  }
  let lightBar = null;
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.32;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.48, -0.25);
    group.add(bar);
    lightBar = { red: red.material, blue: blue.material };
  }
  return { group, wheels, lightBar };
}

const MAX_SPEED = 38; // m/s, about 137 km/h
const MAX_REVERSE = 10;

export class Car {
  constructor(scene, opts) {
    const { x, z, heading = 0, color = 0xc0392b, kind = 'civilian' } = opts;
    const built = buildCarMesh(color, kind);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.kind = kind;
    this.driver = null; // 'player' | 'npc' | null (parked)
    this.health = 100;
    this.wrecked = false;
    this.blink = 0;
    this.onCrash = null; // (strength) => void, set by the game
    this.scene = scene;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  remove() {
    this.scene.remove(this.mesh);
  }

  // Arcade driving: input {throttle -1..1, steer -1..1, handbrake bool}.
  drive(dt, input, colliders, cars) {
    if (this.wrecked) {
      this.speed = 0;
      this.syncMesh();
      return;
    }
    const accel = 15;
    if (input.throttle > 0) this.speed += accel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= 22 * dt; // brake
      else this.speed += 8 * input.throttle * dt; // reverse (throttle is negative)
    }
    // Rolling drag + handbrake.
    this.speed -= this.speed * (input.handbrake ? 2.2 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -MAX_REVERSE, MAX_SPEED);
    // Steering: less at high speed, reversed when reversing.
    const steerTarget = input.steer * (this.speed >= 0 ? 1 : -1);
    this.steer = angleLerp(this.steer, steerTarget * 0.55, clamp(dt * 7, 0, 1));
    if (Math.abs(this.speed) > 0.1) {
      this.heading += (this.steer * this.speed * dt) / 2.6;
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const step = this.speed * dt;
    const next = { x: this.pos.x + fx * step, z: this.pos.z + fz * step };
    // Buildings: stop with a thud.
    let hitBuilding = false;
    const tryX = { x: next.x, z: this.pos.z };
    for (const b of colliders) {
      if (circleVsBox(tryX, 1.6, b)) { hitBuilding = true; break; }
    }
    if (!hitBuilding) this.pos.x = tryX.x;
    const tryZ = { x: this.pos.x, z: next.z };
    for (const b of colliders) {
      if (circleVsBox(tryZ, 1.6, b)) { hitBuilding = true; break; }
    }
    if (!hitBuilding) this.pos.z = tryZ.z;
    if (hitBuilding && Math.abs(this.speed) > 4) {
      this.damage(Math.abs(this.speed) * 1.4);
      if (this.onCrash) this.onCrash(Math.abs(this.speed));
      this.speed *= -0.25;
    } else if (hitBuilding) {
      this.speed *= 0.4;
    }
    // Car-car bumps: push apart and trade a little speed.
    for (const other of cars) {
      if (other === this || other.wrecked) continue;
      const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = dx / d, nz = dz / d;
        this.pos.x -= nx * push;
        this.pos.z -= nz * push;
        other.pos.x += nx * push;
        other.pos.z += nz * push;
        const closing = Math.abs(this.speed - other.speed);
        if (closing > 5) {
          this.damage(closing * 0.8);
          other.damage(closing * 0.8);
          if (this.onCrash) this.onCrash(closing);
          this.speed *= 0.6;
          other.speed *= 0.6;
        }
      }
    }
    this.syncMesh();
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.wrecked = true;
      this.speed = 0;
      this.mesh.rotation.z = 0.06;
      this.mesh.position.y = 0.15;
    }
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, this.mesh.position.y || 0, this.pos.z);
    if (!this.wrecked) this.mesh.position.y = 0;
    this.mesh.rotation.y = this.heading;
    // Wheel spin and front steering.
    const spin = this.speed * 0.016;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = this.steer * 0.9;
    });
    // Body lean.
    this.mesh.rotation.x = clamp(-this.speed * 0.0012, -0.05, 0.05);
    // Police light bar blink.
    if (this.lightBar) {
      this.blink += 0.12;
      const on = Math.sin(this.blink * 6) > 0;
      this.lightBar.red.color.setHex(on ? 0xff2222 : 0x550000);
      this.lightBar.blue.color.setHex(on ? 0x2244ff : 0x000055);
    }
  }
}
