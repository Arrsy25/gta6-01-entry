// Jax Marlowe on foot: a low-poly third-person character with walk/run
// animation, jumping, and camera-relative movement.
import * as THREE from 'three';
import { clamp, circleVsBox } from './utils.js';

const SKIN = 0xd9a066;
const JACKET = 0x1f8a70;
const PANTS = 0x2c3242;
const HAIR = 0x1a1210;

export function buildPlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN });
  const jacket = new THREE.MeshLambertMaterial({ color: JACKET });
  const pants = new THREE.MeshLambertMaterial({ color: PANTS });
  const hair = new THREE.MeshLambertMaterial({ color: HAIR });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), hair);
  hairTop.position.y = 1.9;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.38, 0);
  legL.geometry.translate(0, -0.36, 0);
  legL.position.y = 0.76;
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket);
  armL.geometry.translate(0, -0.31, 0);
  armL.position.set(-0.42, 1.44, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  return { group, legL, legR, armL, armR, torso };
}

export class Player {
  constructor(scene, spawn) {
    this.mesh = buildPlayerMesh();
    scene.add(this.mesh.group);
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.heading = spawn.heading ?? 0;
    this.vy = 0;
    this.onGround = true;
    this.health = 100;
    this.walkPhase = 0;
    this.moving = false;
    this.speed = 0;
    this.currentCar = null; // Car instance when driving, else null
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // dt seconds, input axes, cameraYaw (radians, world), colliders, pressed keys.
  update(dt, input, cameraYaw, colliders, pressed) {
    if (this.currentCar) return; // driving is the car's update
    const ix = input.moveX();
    const iy = input.moveY();
    const run = input.run();
    const speed = run ? 8.5 : 4.6;
    // Movement is camera-relative: W walks away from the camera.
    const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
    let mx = -sin * iy + cos * ix;
    let mz = -cos * iy - sin * ix;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      const step = speed * dt;
      const next = { x: this.pos.x + mx * step, z: this.pos.z + mz * step };
      // Move axis by axis so the player slides along walls.
      const tryX = { x: next.x, z: this.pos.z };
      let hit = false;
      for (const b of colliders) if (circleVsBox(tryX, 0.5, b)) { hit = true; break; }
      if (!hit) this.pos.x = tryX.x;
      const tryZ = { x: this.pos.x, z: next.z };
      hit = false;
      for (const b of colliders) if (circleVsBox(tryZ, 0.5, b)) { hit = true; break; }
      if (!hit) this.pos.z = tryZ.z;
      this.speed = speed;
      this.walkPhase += dt * (run ? 13 : 9);
    } else {
      this.speed = 0;
    }
    // Jump + gravity (pressed is the frame's edge-triggered key set).
    if (pressed && pressed.has('Space') && this.onGround) {
      this.vy = 6.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Mesh pose.
    const m = this.mesh;
    m.group.position.copy(this.pos);
    m.group.rotation.y = this.heading;
    const swing = this.moving ? Math.sin(this.walkPhase) * (run ? 0.75 : 0.55) : 0;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.armL.rotation.x = -swing * 0.8;
    m.armR.rotation.x = swing * 0.8;
    m.torso.position.y = 1.12 + (this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0);
  }

  teleport(x, z, heading) {
    this.pos.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.mesh.group.position.copy(this.pos);
    this.mesh.group.rotation.y = this.heading;
  }
}
