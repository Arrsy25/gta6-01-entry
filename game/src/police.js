// NEON BAY wanted system: heat builds with crimes, stars set how many police
// cars hunt the player, and the heat cools off when the player lies low.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { clamp, rand, pick, angleDiff, dist2 } from './utils.js';
import { ROAD_COORDS } from './city.js';

function starsForHeat(heat) {
  if (heat >= 85) return 5;
  if (heat >= 65) return 4;
  if (heat >= 45) return 3;
  if (heat >= 25) return 2;
  if (heat >= 10) return 1;
  return 0;
}

export class WantedManager {
  constructor(scene, colliders, sounds) {
    this.scene = scene;
    this.colliders = colliders;
    this.sounds = sounds;
    this.heat = 0;
    this.stars = 0;
    this.police = [];
    this.bustedTimer = 0;
    this.lastCrimeAt = -100;
    this.time = 0;
    this.onBusted = null; // () => void
    this.onStarsChanged = null; // (stars) => void
  }

  addCrime(amount, x, z) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrimeAt = this.time;
    this.syncStars();
  }

  setHeat(value) {
    this.heat = clamp(value, 0, 100);
    this.lastCrimeAt = this.time;
    this.syncStars();
  }

  syncStars() {
    const next = starsForHeat(this.heat);
    if (next !== this.stars) {
      this.stars = next;
      if (this.onStarsChanged) this.onStarsChanged(next);
      if (next > 0) this.sounds.sirenStart();
      else this.sounds.sirenStop();
    }
  }

  desiredPolice() {
    return this.stars === 0 ? 0 : this.stars === 1 ? 1 : this.stars === 2 ? 2 : 3;
  }

  spawnPoliceNear(playerPos) {
    // Spawn on a road 55-85m away, roughly behind the player's view.
    const road = pick(ROAD_COORDS);
    const along = pick(ROAD_COORDS) + rand(-40, 40);
    const horizontal = Math.random() < 0.5;
    let x = horizontal ? along : road + pick([-3.4, 3.4]);
    let z = horizontal ? road + pick([-3.4, 3.4]) : along;
    if (dist2(x, z, playerPos.x, playerPos.z) < 40) {
      x = playerPos.x + pick([-1, 1]) * 70;
      z = playerPos.z + pick([-1, 1]) * 70;
    }
    const car = new Car(this.scene, { x, z, heading: 0, color: 0xf4f6f8, kind: 'police' });
    car.driver = 'npc';
    car.cruise = 13 + this.stars * 1.5;
    car.despawnTimer = 0;
    this.police.push(car);
    return car;
  }

  update(dt, player, allCars) {
    this.time += dt;
    // Keep the right number of police cars.
    while (this.police.length < this.desiredPolice()) this.spawnPoliceNear(player.pos);
    // Heat cools off when the player lies low and no cop is near.
    const nearestCop = this.police.reduce((m, c) => Math.min(m, dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z)), Infinity);
    if (this.stars > 0 && this.time - this.lastCrimeAt > 15 && nearestCop > 45) {
      this.heat = Math.max(0, this.heat - 5 * dt);
      this.syncStars();
    }
    // Busted: a cop sits on the player on foot while wanted.
    if (this.stars > 0 && !player.currentCar && nearestCop < 3.2) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 2.5 && this.onBusted) this.onBusted();
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    // Police pursuit: steer at the player, ram on foot or in a car.
    for (const cop of this.police) {
      if (cop.wrecked) {
        cop.despawnTimer += dt;
        continue;
      }
      const dx = player.pos.x - cop.pos.x, dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const steer = clamp(angleDiff(cop.heading, desired) * 1.8, -1, 1);
      // On top of the player: stop and arrest instead of ramming past them,
      // so the busted timer can run. In a car, keep nosing in to ram.
      const throttle = dist < 5 ? (player.currentCar ? 0.35 : -0.6) : 1;
      cop.drive(dt, { throttle, steer, handbrake: false }, this.colliders, allCars);
    }
    // Remove wrecked police cars after a while, and extras when stars fall.
    this.police = this.police.filter((cop) => {
      if (cop.wrecked && cop.despawnTimer > 12) {
        cop.remove();
        return false;
      }
      return true;
    });
    while (this.police.length > this.desiredPolice()) {
      const cop = this.police.pop();
      cop.remove();
    }
  }

  clearAll() {
    for (const cop of this.police) cop.remove();
    this.police = [];
    this.heat = 0;
    this.stars = 0;
    this.bustedTimer = 0;
    this.sounds.sirenStop();
  }
}
