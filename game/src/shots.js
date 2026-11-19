// Screenshot staging for NEON BAY: ?shot= puts the game into a chosen scene
// so the dossier screenshots show the world at its best. The scenes are real
// gameplay states — the same code the player runs.
import { dist2 } from './utils.js';

// game: the object main.js exposes (startGame, player, traffic, police,
// missions, enterCar, setWanted, cars, spots).
export function applyShot(game, params) {
  const shot = params.get('shot');
  if (!shot) return false;
  if (shot === 'start') {
    // Title screen over the living city; nothing to start.
    return true;
  }
  game.startGame();
  if (shot === 'drive') {
    const car = game.nearestParkedCar(game.player.pos, 60);
    if (car) game.enterCar(car, false);
    game.player.pos.x = 24;
    game.player.pos.z = -60;
    if (game.player.currentCar) {
      game.player.currentCar.pos.set(24, 0, -60);
      game.player.currentCar.heading = 0;
      game.player.currentCar.speed = 14;
    }
    return true;
  }
  if (shot === 'chase') {
    const car = game.nearestParkedCar(game.player.pos, 60);
    if (car) game.enterCar(car, false);
    game.player.pos.set(24, 0, -24);
    if (game.player.currentCar) {
      game.player.currentCar.pos.set(24, 0, -24);
      game.player.currentCar.heading = 0;
      game.player.currentCar.speed = 16;
    }
    game.setWanted(3);
    // Pull two police cars into the frame ahead of the player, driving
    // toward them — the chase camera looks forward, so cops behind the car
    // would never be seen.
    for (let i = 0; i < 2; i++) {
      const cop = game.police.spawnPoliceNear(game.player.pos);
      cop.pos.set(24 + (i === 0 ? -5 : 4), 0, -24 + 16 + i * 10);
      cop.heading = Math.PI;
      cop.speed = 12;
    }
    return true;
  }
  if (shot === 'mission') {
    game.missions.startMission(1);
    // On the road west of the market (48,48), facing east toward it, camera
    // behind the player — the yellow beacon and the market are in frame.
    game.player.teleport(24, 48, Math.PI / 2);
    game.player.pos.set(24, 0, 48);
    game.cameraYaw = -Math.PI / 2;
    return true;
  }
  return false;
}
