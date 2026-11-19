// NEON BAY traffic: NPC cars looping the road grid and pedestrians on the
// sidewalks, with fleeing, knock-downs and cash drops.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { clamp, rand, randInt, pick, angleDiff, dist2, circleVsBox } from './utils.js';
import { ROAD_COORDS, CITY_HALF } from './city.js';

const PED_SHIRTS = [0xe74c3c, 0x3498db, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00b894];
const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x1abc9c, 0x8e44ad, 0xe67e22, 0x7f8c8d];

function buildPedMesh(shirt) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const top = new THREE.MeshLambertMaterial({ color: shirt });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), top);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), pants);
  legL.geometry.translate(0, -0.33, 0);
  legL.position.set(-0.14, 0.72, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  return { group, legL, legR };
}

class Ped {
  constructor(scene, x, z) {
    const built = buildPedMesh(pick(PED_SHIRTS));
    this.mesh = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = rand(Math.PI * 2);
    this.speed = rand(1.1, 1.8);
    this.state = 'walk'; // walk | flee | down
    this.timer = rand(2, 6);
    this.downTimer = 0;
    this.phase = rand(Math.PI * 2);
    this.axis = Math.random() < 0.5 ? 'x' : 'z';
    this.road = pick(ROAD_COORDS);
    this.side = pick([-8, 8]);
    this.dir = pick([-1, 1]);
    this.scene = scene;
  }

  remove() { this.scene.remove(this.mesh); }

  respawn() {
    this.axis = Math.random() < 0.5 ? 'x' : 'z';
    this.road = pick(ROAD_COORDS);
    this.side = pick([-8, 8]);
    this.dir = pick([-1, 1]);
    const along = rand(-130, 130);
    this.pos.set(this.axis === 'x' ? along : this.road + this.side, 0, this.axis === 'x' ? this.road + this.side : along);
    this.heading = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    this.state = 'walk';
    this.mesh.rotation.x = 0;
    this.mesh.position.y = 0;
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 4;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  update(dt, danger, colliders) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.respawn();
      return;
    }
    // Flee from a recent scare (gunshot, fast car, punch).
    if (danger && dist2(this.pos.x, this.pos.z, danger.x, danger.z) < 14) {
      this.state = 'flee';
      this.timer = 2.5;
    }
    if (this.state === 'flee') {
      this.timer -= dt;
      const away = Math.atan2(this.pos.x - (danger ? danger.x : 0), this.pos.z - (danger ? danger.z : 0));
      this.heading = away;
      this.pos.x += Math.sin(away) * 3.6 * dt;
      this.pos.z += Math.cos(away) * 3.6 * dt;
      if (this.timer <= 0) this.state = 'walk';
    } else {
      this.timer -= dt;
      const step = this.speed * dt;
      if (this.axis === 'x') this.pos.x += this.dir * step;
      else this.pos.z += this.dir * step;
      // At an intersection, sometimes turn onto the crossing road.
      const along = this.axis === 'x' ? this.pos.x : this.pos.z;
      const nearRoad = ROAD_COORDS.some((r) => Math.abs(along - r) < 2.5);
      if (this.timer <= 0 || Math.abs(along) > CITY_HALF - 8) {
        if (nearRoad && Math.random() < 0.5) {
          // Turn onto the road being crossed: snap to its lane.
          const cross = ROAD_COORDS.reduce((a, b) => (Math.abs(b - along) < Math.abs(a - along) ? b : a));
          this.side = pick([-8, 8]);
          this.dir = pick([-1, 1]);
          if (this.axis === 'x') {
            this.axis = 'z';
            this.pos.x = cross + this.side;
            this.heading = this.dir > 0 ? 0 : Math.PI;
          } else {
            this.axis = 'x';
            this.pos.z = cross + this.side;
            this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        } else {
          this.dir *= -1;
          this.heading += Math.PI;
        }
        this.timer = rand(3, 8);
      }
    }
    // Stay inside the city and out of buildings.
    this.pos.x = clamp(this.pos.x, -CITY_HALF + 4, CITY_HALF - 4);
    this.pos.z = clamp(this.pos.z, -CITY_HALF + 4, 148);
    for (const b of colliders) circleVsBox(this.pos, 0.4, b);
    this.phase += dt * (this.state === 'flee' ? 12 : 7);
    const swing = Math.sin(this.phase) * 0.5;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}

export class TrafficManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.peds = [];
    this.pickups = [];
    this.onPedDown = null; // (ped, byPlayer) => void
    this.danger = null; // {x, z} scare point, cleared after use
    // Traffic loops: rectangles around random blocks.
    for (let i = 0; i < 10; i++) {
      const bx = pick([-96, -48, 0, 48, 96]);
      const bz = pick([-96, -48, 0, 48, 96]);
      const cw = Math.random() < 0.5;
      const loop = this.makeLoop(bx, bz, cw);
      const car = new Car(scene, {
        x: loop[0].x, z: loop[0].z,
        heading: Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z),
        color: pick(CAR_COLORS), kind: 'civilian',
      });
      car.driver = 'npc';
      car.loop = loop;
      car.wp = 1;
      car.cruise = rand(7, 9.5);
      car.onCrash = null;
      this.cars.push(car);
    }
    for (let i = 0; i < 16; i++) {
      const ped = new Ped(scene, rand(-120, 120), rand(-120, 130));
      this.peds.push(ped);
    }
    // A few ambient cash drops to find while exploring.
    for (let i = 0; i < 5; i++) {
      this.spawnPickup(pick(ROAD_COORDS) + rand(-4, 4), pick(ROAD_COORDS) + rand(-30, 30), 100);
    }
  }

  makeLoop(bx, bz, cw) {
    // Rectangle around the block, hugging the roads at its edges, right-hand lane.
    const pts = [
      { x: bx - 24, z: bz - 24 }, { x: bx + 24, z: bz - 24 },
      { x: bx + 24, z: bz + 24 }, { x: bx - 24, z: bz + 24 },
    ];
    if (!cw) pts.reverse();
    // Offset each corner 3.4m to the right of travel.
    return pts.map((p, i) => {
      const n = pts[(i + 1) % pts.length];
      const fx = n.x - p.x, fz = n.z - p.z;
      const len = Math.hypot(fx, fz) || 1;
      const rx = (-fz / len) * 3.4, rz = (fx / len) * 3.4;
      return { x: p.x + rx, z: p.z + rz };
    });
  }

  spawnPickup(x, z, amount) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x37d67a }),
    );
    mesh.position.set(x, 0.5, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, amount, t: rand(Math.PI * 2) });
  }

  scare(x, z) { this.danger = { x, z }; }

  update(dt, playerPos, allCars) {
    // Traffic cars follow their loops; a car the player is driving is skipped.
    for (const car of this.cars) {
      if (car.wrecked || car.driver === 'player') continue;
      const target = car.loop[car.wp];
      const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7) {
        car.wp = (car.wp + 1) % car.loop.length;
        continue;
      }
      const desired = Math.atan2(dx, dz);
      const steer = clamp(angleDiff(car.heading, desired) * 1.6, -1, 1);
      // Slow down for a car ahead in the same lane.
      let throttle = 1;
      for (const other of allCars) {
        if (other === car || other.wrecked) continue;
        const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 10 && d > 0.1) {
          const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / d;
          if (ahead > 0.7) { throttle = 0.15; break; }
        }
      }
      const speedTarget = car.cruise * throttle;
      const input = {
        throttle: car.speed < speedTarget ? 1 : (car.speed > speedTarget + 1 ? -0.4 : 0),
        steer, handbrake: false,
      };
      car.drive(dt, input, this.colliders, allCars);
    }
    // Pedestrians.
    for (const ped of this.peds) ped.update(dt, this.danger, this.colliders);
    this.danger = null;
    // Pickups spin and bob.
    for (const p of this.pickups) {
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.5 + Math.sin(p.t * 3) * 0.15;
    }
  }

  // Player ran into a ped with a car, or punched/shot one: returns the ped.
  checkPedHit(pos, radius) {
    for (const ped of this.peds) {
      if (ped.state !== 'down' && dist2(pos.x, pos.z, ped.pos.x, ped.pos.z) < radius) return ped;
    }
    return null;
  }

  knockPed(ped, byPlayer) {
    ped.knockDown();
    this.spawnPickup(ped.pos.x + rand(-1, 1), ped.pos.z + rand(-1, 1), 25);
    if (this.onPedDown) this.onPedDown(ped, byPlayer);
  }

  // Collect pickups near pos (player on foot or in a car). Returns cash gained.
  collectPickups(pos) {
    let gained = 0;
    this.pickups = this.pickups.filter((p) => {
      if (dist2(pos.x, pos.z, p.x, p.z) < 2.4) {
        gained += p.amount;
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
    return gained;
  }
}
