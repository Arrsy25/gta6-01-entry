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
    // Pull two police cars close behind the player.
    for (let i = 0; i < 2; i++) {
      const cop = game.police.spawnPoliceNear(game.player.pos);
      cop.pos.set(24 + (i === 0 ? -6 : 5), 0, -24 - 14 - i * 8);
      cop.heading = 0;
      cop.speed = 14;
    }
    return true;
  }
  if (shot === 'mission') {
    game.missions.startMission(1);
    game.player.teleport(48, 30, Math.PI);
    game.player.pos.set(48, 0, 30);
    return true;
  }
  return false;
}
