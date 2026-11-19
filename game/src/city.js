// NEON BAY city: a sun-soaked coastal grid city, built from boxes, canvas
// textures and a few props. Exports colliders, road lines, spawn points and
// mission spots for the other systems.
import * as THREE from 'three';
import { rand, randInt, pick } from './utils.js';

export const ROAD_COORDS = [-120, -72, -24, 24, 72, 120];
export const BLOCK_CENTERS = [-96, -48, 0, 48, 96];
export const CITY_HALF = 150;
export const BEACH_Z = 150;
export const OCEAN_Z = 178;

const BUILDING_COLORS = [0xe8dcc8, 0xd9a066, 0x7fb3a8, 0xc96f4a, 0xf2ead8, 0x9db8c4, 0xe0b24a, 0xb98a6e];
const CAR_SPOT_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x1abc9c, 0x8e44ad, 0xe67e22];

function makeWindowTexture() {
  // Light concrete base so the building's tint color shows; windows are
  // dark glass with some lit amber, so facades read as sunlit walls.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ddd6c4';
  g.fillRect(0, 0, 128, 256);
  // Subtle floor shading.
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 16; y += 2) g.fillRect(0, y * 16, 128, 2);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : '#42566e';
      g.fillRect(6 + x * 15, 8 + y * 15, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTextTexture(lines, bg, fg, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.floor(h / (lines.length + 1))}px Arial Black, Impact, sans-serif`;
  lines.forEach((line, i) => {
    g.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Top-down ground texture: roads, lane dashes, crosswalks, beach and ocean.
function makeGroundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const world = (v) => ((v + 170) / 340) * S; // world -170..170 -> px
  const w = (d) => (d / 340) * S;

  g.fillStyle = '#b5ac9c'; // sidewalks / blocks base
  g.fillRect(0, 0, S, S);
  // Ocean (south) and sand.
  g.fillStyle = '#2a7fa8';
  g.fillRect(0, world(OCEAN_Z), S, S - world(OCEAN_Z));
  const grad = g.createLinearGradient(0, world(OCEAN_Z), 0, S);
  grad.addColorStop(0, '#3a9cc4');
  grad.addColorStop(1, '#155a80');
  g.fillStyle = grad;
  g.fillRect(0, world(OCEAN_Z), S, S - world(OCEAN_Z));
  g.fillStyle = '#e8d5a0';
  g.fillRect(0, world(BEACH_Z), S, world(OCEAN_Z) - world(BEACH_Z));
  // Roads.
  g.fillStyle = '#3a3f47';
  for (const r of ROAD_COORDS) {
    g.fillRect(world(r - 6), 0, w(12), world(BEACH_Z));
    g.fillRect(0, world(r - 6), world(BEACH_Z), w(12));
  }
  // Lane dashes.
  g.fillStyle = '#e8c832';
  for (const r of ROAD_COORDS) {
    for (let v = -160; v < BEACH_Z; v += 10) {
      g.fillRect(world(r) - 1.5, world(v), 3, w(4));
      g.fillRect(world(v), world(r) - 1.5, w(4), 3);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#e8e8e8';
  for (const rx of ROAD_COORDS) {
    for (const rz of ROAD_COORDS) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(world(rx + i * 2.4) - 1, world(rz - 5.4), 2, w(2.4));
        g.fillRect(world(rx + i * 2.4) - 1, world(rz + 3), 2, w(2.4));
        g.fillRect(world(rx - 5.4), world(rz + i * 2.4) - 1, w(2.4), 2);
        g.fillRect(world(rx + 3), world(rz + i * 2.4) - 1, w(2.4), 2);
      }
    }
  }
  // Block interiors: parking lots and plazas.
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      g.fillStyle = Math.random() < 0.4 ? '#a8a294' : '#bdb5a4';
      g.fillRect(world(bx - 17), world(bz - 17), w(34), w(34));
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5.4, 6), trunkMat);
  trunk.position.y = 2.7;
  trunk.rotation.z = 0.08;
  group.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.4, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    leaf.scale.set(1, 1, 0.18);
    group.add(leaf);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

export function buildCity(scene) {
  const colliders = [];
  const windowTex = makeWindowTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  ground.receiveShadow = true;
  scene.add(ground);

  // Ocean plane (animated shimmer via opacity pulse in update).
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 170),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.05, OCEAN_Z + 85);
  scene.add(ocean);

  // Buildings: 1-3 per block, varied heights and warm colors.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const count = randInt(1, 2);
      for (let i = 0; i < count; i++) {
        const w = rand(12, 20), d = rand(12, 20), h = rand(8, 42);
        const x = bx + rand(-8, 8) * (count > 1 ? 0.5 : 0);
        const z = bz + rand(-8, 8) * (count > 1 ? 0.5 : 0);
        const tex = windowTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 7)));
        const mat = new THREE.MeshLambertMaterial({ map: tex, color: pick(BUILDING_COLORS) });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.5, d + 0.6);
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        colliders.push({ minX: x - w / 2 - 0.3, maxX: x + w / 2 + 0.3, minZ: z - d / 2 - 0.3, maxZ: z + d / 2 + 0.3 });
      }
    }
  }

  // Palms along the beach and a few on sidewalks.
  for (let x = -140; x <= 140; x += 14) {
    const palm = makePalm();
    palm.position.set(x + rand(-3, 3), 0, BEACH_Z + rand(4, 12));
    palm.rotation.y = rand(Math.PI * 2);
    scene.add(palm);
    colliders.push({ minX: palm.position.x - 0.5, maxX: palm.position.x + 0.5, minZ: palm.position.z - 0.5, maxZ: palm.position.z + 0.5 });
  }
  for (let i = 0; i < 16; i++) {
    const palm = makePalm();
    palm.position.set(pick(ROAD_COORDS) + pick([-8, 8]), 0, pick(ROAD_COORDS) + pick([-8, 8]));
    palm.scale.setScalar(rand(0.8, 1.1));
    scene.add(palm);
    colliders.push({ minX: palm.position.x - 0.5, maxX: palm.position.x + 0.5, minZ: palm.position.z - 0.5, maxZ: palm.position.z + 0.5 });
  }

  // Street lamps along the main roads.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const r of [-72, 24, 120]) {
    for (let v = -120; v <= 120; v += 48) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6), lampMat);
      pole.position.set(r + 7, 2.75, v);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampHeadMat);
      head.position.set(r + 7, 5.6, v);
      scene.add(head);
    }
  }

  // Billboards with original Neon Bay names.
  const boards = [
    { pos: [-72, 14, -96], lines: ['NEON BAY', 'DRIVE FAST'], bg: '#ff7a00', fg: '#fff7e8', w: 18 },
    { pos: [72, 12, 48], lines: ["LENA'S", 'GARAGE'], bg: '#14213d', fg: '#ffb400', w: 16 },
    { pos: [24, 12, 120], lines: ['DOCK 9', 'FRESH CATCH'], bg: '#0f766e', fg: '#e8fff8', w: 16 },
  ];
  for (const b of boards) {
    const tex = makeTextTexture(b.lines, b.bg, b.fg);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(b.w, b.w * 0.5),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    mesh.rotation.y = Math.PI / 4;
    scene.add(mesh);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, b.pos[1], 0.5), lampMat);
    post.position.set(b.pos[0], b.pos[1] / 2, b.pos[2]);
    scene.add(post);
  }

  // Pier into the ocean at the Docks (mission 1 destination).
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 46), pierMat);
  pier.position.set(0, 0.4, OCEAN_Z + 20);
  pier.receiveShadow = true;
  scene.add(pier);
  colliders.push({ minX: -5, maxX: 5, minZ: OCEAN_Z - 3, maxZ: OCEAN_Z + 43 });

  // Invisible boundary colliders: city edges and the waterline.
  colliders.push({ minX: -CITY_HALF - 10, maxX: -CITY_HALF, minZ: -CITY_HALF - 10, maxZ: CITY_HALF + 10 });
  colliders.push({ minX: CITY_HALF, maxX: CITY_HALF + 10, minZ: -CITY_HALF - 10, maxZ: CITY_HALF + 10 });
  colliders.push({ minX: -CITY_HALF - 10, maxX: CITY_HALF + 10, minZ: -CITY_HALF - 10, maxZ: -CITY_HALF });
  colliders.push({ minX: -CITY_HALF - 10, maxX: CITY_HALF + 10, minZ: OCEAN_Z + 40, maxZ: OCEAN_Z + 60 });

  // Parked cars along the roads (spots the player can steal from).
  const parkedSpots = [];
  const parkedAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (let i = 0; i < 14; i++) {
    const road = pick(ROAD_COORDS);
    const along = pick(ROAD_COORDS) + rand(-30, 30);
    const horizontal = Math.random() < 0.5;
    parkedSpots.push({
      x: horizontal ? along : road + pick([-3.4, 3.4]),
      z: horizontal ? road + pick([-3.4, 3.4]) : along,
      // Heading follows the road: east/west on a horizontal road, north/south on a vertical one.
      heading: horizontal ? pick([Math.PI / 2, -Math.PI / 2]) : pick([0, Math.PI]),
      color: pick(CAR_SPOT_COLORS),
    });
  }
  // Keep parked spots off the pier and off mission markers.
  const spots = {
    playerSpawn: { x: 24, z: 120, heading: Math.PI },
    docks: { x: 0, z: OCEAN_Z - 8 },
    market: { x: 48, z: 48 },
    garage: { x: -48, z: -48 },
    hideout: { x: 96, z: -96 },
    pierEnd: { x: 0, z: OCEAN_Z - 8 },
  };

  let t = 0;
  return {
    colliders,
    parkedSpots,
    spots,
    update(dt) {
      t += dt;
      ocean.material.opacity = 0.88 + Math.sin(t * 0.8) * 0.04;
    },
  };
}
