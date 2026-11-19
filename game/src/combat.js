// NEON BAY combat: punch up close, pistol on click, and the damage the
// player takes when traffic or a crash hits them.
import * as THREE from 'three';
import { clamp, dist2 } from './utils.js';

export class Combat {
  constructor(scene, camera, ctx) {
    // ctx: {player, traffic, wanted, sounds, onPlayerDamaged}
    this.scene = scene;
    this.camera = camera;
    this.ctx = ctx;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 70;
    this.tracer = null;
    this.tracerLife = 0;
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(this.tracerGeo, tracerMat);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
  }

  punch() {
    if (this.punchCooldown > 0) return;
    const { player, traffic, wanted, sounds } = this.ctx;
    if (player.currentCar) return;
    this.punchCooldown = 0.45;
    sounds.punch();
    const range = 2.4;
    const ped = traffic.checkPedHit(
      { x: player.pos.x + Math.sin(player.heading) * 1.2, z: player.pos.z + Math.cos(player.heading) * 1.2 },
      range,
    );
    if (ped) {
      traffic.knockPed(ped, true);
      wanted.addCrime(15);
      traffic.scare(player.pos.x, player.pos.z);
    }
  }

  shoot() {
    if (this.shootCooldown > 0) return;
    const { player, traffic, wanted, sounds } = this.ctx;
    if (player.currentCar) return; // no drive-by shooting in this build
    this.shootCooldown = 0.28;
    sounds.gunshot();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    // Targets: peds (as spheres), police + traffic cars (as boxes).
    const targets = [];
    for (const ped of traffic.peds) {
      if (ped.state === 'down') continue;
      targets.push({ kind: 'ped', obj: ped, pos: new THREE.Vector3(ped.pos.x, 1.2, ped.pos.z), radius: 0.9 });
    }
    const allCars = [...traffic.cars, ...this.ctx.policeCars()];
    for (const car of allCars) {
      targets.push({ kind: 'car', obj: car, pos: new THREE.Vector3(car.pos.x, 0.9, car.pos.z), radius: 2.4 });
    }
    // Nearest target roughly along the ray.
    let best = null, bestDist = Infinity;
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    for (const t of targets) {
      const to = new THREE.Vector3().subVectors(t.pos, origin);
      const along = to.dot(dir);
      if (along < 1 || along > 70) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, along);
      const perp = closest.distanceTo(t.pos);
      if (perp < t.radius && along < bestDist) { best = t; bestDist = along; }
    }
    const end = best
      ? new THREE.Vector3(best.pos.x, best.pos.y, best.pos.z)
      : new THREE.Vector3().copy(origin).addScaledVector(dir, 60);
    this.showTracer(new THREE.Vector3(player.pos.x, 1.4, player.pos.z), end);
    if (best) {
      if (best.kind === 'ped') {
        traffic.knockPed(best.obj, true);
        wanted.addCrime(20);
        traffic.scare(player.pos.x, player.pos.z);
      } else {
        best.obj.damage(34);
        wanted.addCrime(20);
        traffic.scare(best.obj.pos.x, best.obj.pos.z);
        if (best.obj.kind === 'police' && best.obj.wrecked) {
          wanted.addCrime(10);
        }
      }
    } else {
      // A miss still makes noise: nearby peds scatter.
      traffic.scare(player.pos.x + Math.sin(player.heading) * 8, player.pos.z + Math.cos(player.heading) * 8);
    }
  }

  showTracer(from, to) {
    const attr = this.tracerGeo.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerLife = 0.07;
  }

  // Called by the game when a car hits the player on foot.
  hitPlayerByCar(car, strength) {
    const { player, sounds } = this.ctx;
    if (player.currentCar) return;
    const dmg = clamp(strength * 0.9, 6, 30);
    player.health = Math.max(0, player.health - dmg);
    sounds.crash();
    // Knock the player sideways away from the car.
    const dx = player.pos.x - car.pos.x, dz = player.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    player.pos.x += (dx / d) * 1.6;
    player.pos.z += (dz / d) * 1.6;
    if (this.ctx.onPlayerDamaged) this.ctx.onPlayerDamaged(dmg);
  }

  update(dt, frame) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) this.tracer.visible = false;
    }
    if (frame.pressed.has('KeyF')) this.punch();
    if (frame.clicked && !this.ctx.player.currentCar) this.shoot();
  }
}
