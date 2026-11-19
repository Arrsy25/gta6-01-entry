// NEON BAY — main wiring: renderer, game loop, camera, entering cars,
// save/load, menus, and the hooks the screenshots and tests use.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { WantedManager } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { applyShot } from './shots.js';
import { clamp, lerp, dist2 } from './utils.js';

const SAVE_KEY = 'neonbay-save-v1';

const game = {
  state: 'menu', // menu | playing | busted | wasted | paused
  cash: 0,
  cameraYaw: 0,
  cameraPitch: 0.32,
  trauma: 0,
  saveTimer: 0,
};

function boot() {
  const params = new URLSearchParams(window.location.search);
  const lowFx = params.get('lowfx') === '1';
  const container = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lowFx;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc3e8);
  scene.fog = new THREE.Fog(0xe8b07a, 180, 420);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 60, 140);

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(-120, 160, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x8a6a4a, 0.85));

  const city = buildCity(scene);
  const sounds = new SoundBank();
  const input = new Input(renderer.domElement);
  const hud = new HUD();
  const player = new Player(scene, city.spots.playerSpawn);
  const traffic = new TrafficManager(scene, city.colliders);
  const wanted = new WantedManager(scene, city.colliders, sounds);
  const missions = new MissionManager(scene, city.spots, {
    onReward: (amount, text) => {
      game.cash += amount;
      sounds.missionDone();
      hud.showMessage('JOB DONE', text);
      saveGame();
    },
    onMessage: (title, sub) => hud.showMessage(title, sub, 4.5),
    onMissionStart: () => {},
    onAllDone: () => hud.showMessage('NEON BAY IS YOURS', 'Every job done. Free roam — find the cash drops.'),
  });
  const combat = new Combat(scene, camera, {
    player, traffic, wanted, sounds,
    policeCars: () => wanted.police,
    onPlayerDamaged: () => hud.flashDamage(),
  });

  // Parked cars the player can steal.
  const parkedCars = city.parkedSpots.map((s) => {
    const car = new Car(scene, { x: s.x, z: s.z, heading: s.heading, color: s.color, kind: 'civilian' });
    car.driver = null;
    return car;
  });

  const allCars = () => [...parkedCars, ...traffic.cars, ...wanted.police];
  const nearPlayer = (car) => dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 34;

  for (const car of allCars()) {
    car.onCrash = (strength) => {
      if (strength > 6 && nearPlayer(car)) sounds.crash();
      if (car === player.currentCar && strength > 8) {
        player.health = Math.max(0, player.health - strength * 0.35);
        hud.flashDamage();
        game.trauma = Math.min(1, game.trauma + 0.35);
        if (player.health <= 0) wastePlayer();
      }
    };
  }
  traffic.onPedDown = (ped, byPlayer) => {
    if (byPlayer) {
      game.cash += 0; // cash comes from the pickup the ped drops
      hud.showMessage('+$25', 'The mark dropped some cash.', 1.6);
    }
  };

  wanted.onBusted = () => {
    if (game.state !== 'playing') return;
    game.state = 'busted';
    sounds.busted();
    sounds.sirenStop();
    sounds.engineStop();
    const fine = Math.min(game.cash, 150);
    game.cash -= fine;
    input.unlockPointer();
    hud.showEnd('BUSTED', `The Bay PD caught Jax on foot. Bail and fines cost you $${fine}. Your jobs are still waiting — get back out there.`);
    saveGame();
  };

  function wastePlayer() {
    if (game.state !== 'playing') return;
    game.state = 'wasted';
    sounds.wasted();
    sounds.engineStop();
    const lost = Math.min(game.cash, 150);
    game.cash -= lost;
    input.unlockPointer();
    hud.showEnd('WASTED', `Jax went down in Neon Bay. The hospital patch-up cost you $${lost}.`);
    saveGame();
  }

  function respawn() {
    player.health = 100;
    if (player.currentCar) {
      player.currentCar.driver = null;
      player.currentCar = null;
      sounds.engineStop();
    }
    player.teleport(city.spots.playerSpawn.x, city.spots.playerSpawn.z, city.spots.playerSpawn.heading);
    wanted.clearAll();
    hud.hideEnd();
    game.state = 'playing';
    input.lockPointer();
  }

  function saveGame() {
    if (game.state === 'menu') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: game.cash,
        missionIndex: missions.missionIndex,
        stepIndex: missions.stepIndex,
        done: missions.done,
        px: player.pos.x, pz: player.pos.z,
        health: player.health,
      }));
    } catch (e) { /* storage unavailable; the game still plays */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function nearestCar(pos, maxDist, includeTraffic = true) {
    let best = null, bestD = maxDist;
    const pool = includeTraffic ? allCars() : parkedCars;
    for (const car of pool) {
      if (car.wrecked) continue;
      const d = dist2(pos.x, pos.z, car.pos.x, car.pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function enterCar(car, silent = false) {
    if (!car || car.wrecked) return false;
    if (car.driver === 'npc') {
      // Carjacking: the driver bails and the law notices.
      wanted.addCrime(25);
      traffic.scare(car.pos.x, car.pos.z);
      if (!silent) hud.showMessage('CARJACKED!', 'The driver ran off screaming. The cops noticed.', 2.5);
    }
    if (player.currentCar) player.currentCar.driver = null;
    car.driver = 'player';
    player.currentCar = car;
    player.mesh.group.visible = false;
    sounds.engineStart();
    if (!silent) hud.showMessage('', '');
    return true;
  }

  function exitCar() {
    const car = player.currentCar;
    if (!car) return;
    car.driver = null;
    player.currentCar = null;
    sounds.engineStop();
    const side = car.heading + Math.PI / 2;
    player.teleport(car.pos.x + Math.sin(side) * 2.4, car.pos.z + Math.cos(side) * 2.4, car.heading);
    player.mesh.group.visible = true;
  }

  function startGame(opts = {}) {
    const save = opts.load ? loadSave() : null;
    if (save) {
      game.cash = save.cash || 0;
      player.health = save.health ?? 100;
      missions.missionIndex = save.missionIndex || 0;
      missions.stepIndex = save.stepIndex || 0;
      missions.done = !!save.done;
      missions.setStep(missions.missionIndex, missions.stepIndex);
      player.teleport(save.px ?? city.spots.playerSpawn.x, save.pz ?? city.spots.playerSpawn.z);
      hud.showMessage('WELCOME BACK', 'Your save was loaded. The jobs are still open.', 3);
    } else {
      game.cash = 0;
      player.health = 100;
      missions.reset();
      player.teleport(city.spots.playerSpawn.x, city.spots.playerSpawn.z, city.spots.playerSpawn.heading);
    }
    wanted.clearAll();
    hud.hideEnd();
    hud.showMenu(false);
    game.state = 'playing';
    sounds.ensure();
    sounds.musicStart();
    input.lockPointer();
  }

  // Buttons.
  document.getElementById('btn-start').addEventListener('click', () => startGame());
  document.getElementById('btn-continue').addEventListener('click', () => startGame({ load: true }));
  document.getElementById('btn-retry').addEventListener('click', respawn);
  if (loadSave()) document.getElementById('btn-continue').style.display = '';
  window.addEventListener('beforeunload', saveGame);

  // ---- Camera ----
  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const t = game.trauma;
    const shakeX = t > 0 ? (Math.random() - 0.5) * t * 0.9 : 0;
    const shakeY = t > 0 ? (Math.random() - 0.5) * t * 0.6 : 0;
    game.trauma = Math.max(0, t - dt * 1.6);
    if (game.state === 'menu') {
      const a = performance.now() * 0.00004;
      camera.position.set(Math.sin(a) * 130, 52, Math.cos(a) * 130);
      camera.lookAt(0, 4, 10);
      camera.fov = 55;
      camera.updateProjectionMatrix();
      return;
    }
    if (player.currentCar) {
      const car = player.currentCar;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const speed01 = clamp(Math.abs(car.speed) / 38, 0, 1);
      const dist = 10.5 + speed01 * 2.5;
      const desired = new THREE.Vector3(car.pos.x - fx * dist, 4.2 + speed01, car.pos.z - fz * dist);
      camera.position.lerp(desired, clamp(dt * 5, 0, 1));
      camTarget.set(car.pos.x + fx * 9, 1.6, car.pos.z + fz * 9);
      camera.lookAt(camTarget.x + shakeX, camTarget.y + shakeY, camTarget.z);
      const targetFov = 60 + speed01 * 14;
      camera.fov = lerp(camera.fov, targetFov, clamp(dt * 4, 0, 1));
      camera.updateProjectionMatrix();
      return;
    }
    // On foot: third-person orbit.
    const dist = 7.5;
    const cx = player.pos.x + Math.sin(game.cameraYaw) * dist * Math.cos(game.cameraPitch);
    const cz = player.pos.z + Math.cos(game.cameraYaw) * dist * Math.cos(game.cameraPitch);
    const cy = 2.6 + Math.sin(game.cameraPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), clamp(dt * 10, 0, 1));
    camTarget.set(player.pos.x, 1.6, player.pos.z);
    camera.lookAt(camTarget.x + shakeX, camTarget.y + shakeY, camTarget.z);
    camera.fov = lerp(camera.fov, 60, clamp(dt * 4, 0, 1));
    camera.updateProjectionMatrix();
  }

  // ---- Main loop ----
  const clock = new THREE.Clock();
  let fpsFrames = 0, fpsLast = performance.now(), fpsValue = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    fpsFrames++;
    const now = performance.now();
    if (now - fpsLast >= 1000) {
      fpsValue = Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0;
      fpsLast = now;
    }
    const inputFrame = input.poll();
    const inMenu = game.state === 'menu';

    // Global keys.
    if (inputFrame.pressed.has('KeyM')) {
      const muted = sounds.toggleMute();
      if (!inMenu) hud.showMessage(muted ? 'SOUND OFF' : 'SOUND ON', '', 1.2);
    }
    if (inputFrame.pressed.has('KeyP') && (game.state === 'playing' || game.state === 'paused')) {
      game.state = game.state === 'playing' ? 'paused' : 'playing';
      hud.showMessage(game.state === 'paused' ? 'PAUSED' : '', game.state === 'paused' ? 'Press P to resume.' : '', 1.5);
    }
    if (!inMenu) {
      game.cameraYaw -= inputFrame.mouseDX * 0.0032;
      game.cameraPitch = clamp(game.cameraPitch + inputFrame.mouseDY * 0.0022, -0.05, 0.85);
    }

    if (game.state === 'playing') {
      // Enter / exit a car.
      if (inputFrame.pressed.has('KeyE')) {
        if (player.currentCar) exitCar();
        else {
          const car = nearestCar(player.pos, 4.5);
          if (car) enterCar(car);
        }
      }
      // Driving or walking.
      if (player.currentCar) {
        const car = player.currentCar;
        const throttle = input.moveY();
        const steer = -input.moveX();
        car.drive(dt, { throttle, steer, handbrake: input.down('Space') }, city.colliders, allCars());
        sounds.engineSet(clamp(Math.abs(car.speed) / 38, 0, 1), true);
        // Running over a pedestrian is a crime.
        if (Math.abs(car.speed) > 4) {
          const ped = traffic.checkPedHit(car.pos, 2.4);
          if (ped) {
            traffic.knockPed(ped, true);
            wanted.addCrime(20);
            sounds.crash();
            hud.flashDamage();
          }
        }
        if (car.wrecked) {
          player.health = Math.max(0, player.health - 12);
          hud.flashDamage();
          hud.showMessage('CAR WRECKED', 'Get out and find another ride.', 2.5);
          exitCar();
          if (player.health <= 0) wastePlayer();
        }
      } else {
        player.update(dt, input, game.cameraYaw, city.colliders, inputFrame.pressed);
        sounds.engineSet(0, false);
        // Traffic hitting the player on foot.
        for (const car of [...traffic.cars, ...wanted.police]) {
          if (car.wrecked || Math.abs(car.speed) < 3) continue;
          if (dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 2.0) {
            combat.hitPlayerByCar(car, Math.abs(car.speed));
            if (player.health <= 0) { wastePlayer(); break; }
          }
        }
      }
      // While driving, the player's position rides with the car so every
      // system that reads player.pos (missions, police, traffic, pickups,
      // minimap) sees where the player actually is.
      if (player.currentCar) player.pos.copy(player.currentCar.pos);
      traffic.update(dt, player.pos, allCars());
      wanted.update(dt, player, allCars());
      missions.update(dt, player, wanted);
      combat.update(dt, inputFrame);
      city.update(dt);
      const gained = traffic.collectPickups(player.pos);
      if (gained > 0) {
        game.cash += gained;
        sounds.pickup();
      }
      game.saveTimer += dt;
      if (game.saveTimer > 20) { game.saveTimer = 0; saveGame(); }
    } else if (inMenu) {
      // The city stays alive behind the title screen.
      traffic.update(dt, player.pos, allCars());
      city.update(dt);
    }

    // HUD.
    const step = missions.currentStep();
    const markerSpot = !missions.done && step && step.marker ? city.spots[step.marker] : null;
    let hint = '';
    if (game.state === 'playing') {
      if (player.currentCar) hint = 'W/S drive · A/D steer · Space handbrake · E exit car';
      else {
        const near = nearestCar(player.pos, 4.5);
        hint = near ? 'Press E to enter the car' : 'WASD move · Shift run · E enter car · F punch · Click shoot';
      }
    }
    hud.update(dt, {
      stars: wanted.stars,
      cash: game.cash,
      health: player.health,
      speedKmh: player.currentCar ? Math.abs(player.currentCar.speed) * 3.6 : 0,
      driving: !!player.currentCar,
      onFoot: !player.currentCar,
      inMenu,
      objective: missions.objectiveText(),
      hint,
      player,
      trafficCars: traffic.cars,
      policeCars: wanted.police,
      missionMarker: markerSpot,
    });

    updateCamera(dt);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Test + screenshot hooks ----
  const api = {
    startGame,
    respawn,
    enterCar,
    exitCar,
    setWanted(n) { wanted.setHeat([0, 12, 28, 48, 68, 88][clamp(n, 0, 5)]); },
    nearestParkedCar: (pos, maxDist) => nearestCar(pos, maxDist, false),
    nearestCar,
    player, wanted, missions, traffic, police: wanted,
    cars: allCars,
    spots: city.spots,
    get cash() { return game.cash; },
    set cash(v) { game.cash = v; },
    get state() { return game.state; },
    get fps() { return fpsValue; },
    get cameraYaw() { return game.cameraYaw; },
    set cameraYaw(v) { game.cameraYaw = v; },
    version: 'neonbay-1',
  };
  window.__game = api;

  // Screenshot staging (?shot=start|drive|chase|mission).
  applyShot(api, params);

  frame();
}

boot();
