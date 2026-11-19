// NEON BAY HUD: wanted stars, cash, health, speed, objective, minimap and
// messages — all DOM plus one 2D canvas for the minimap.
import { ROAD_COORDS, CITY_HALF, BEACH_Z, OCEAN_Z } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      objTitle: document.getElementById('obj-title'),
      objText: document.getElementById('obj-text'),
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      healthFill: document.getElementById('healthfill'),
      speed: document.getElementById('speed'),
      hint: document.getElementById('hint'),
      message: document.getElementById('message'),
      crosshair: document.getElementById('crosshair'),
      damage: document.getElementById('damage'),
      menu: document.getElementById('menu'),
      endcard: document.getElementById('endcard'),
      endTitle: document.getElementById('end-title'),
      endText: document.getElementById('end-text'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.messageTimer = 0;
    this.blink = 0;
  }

  showMessage(title, sub = '', dur = 3.5) {
    this.el.message.innerHTML = `${title}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.messageTimer = dur;
  }

  flashDamage() {
    this.el.damage.style.opacity = '1';
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 160);
  }

  showEnd(title, text) {
    this.el.endTitle.textContent = title;
    this.el.endTitle.style.color = title === 'BUSTED' ? '#3fa9ff' : '#ff3b30';
    this.el.endText.textContent = text;
    this.el.endcard.style.display = 'flex';
  }
  hideEnd() { this.el.endcard.style.display = 'none'; }
  showMenu(show) { this.el.menu.style.display = show ? 'flex' : 'none'; }

  update(dt, s) {
    // s: {stars, cash, health, speedKmh, driving, onFoot, objective, hint, player, trafficCars, policeCars, missionMarker, pickups}
    this.blink += dt;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) starsHtml += `<span class="${i < s.stars ? '' : 'off'}">★</span>`;
    this.el.stars.innerHTML = starsHtml;
    this.el.cash.textContent = `$${Math.floor(s.cash).toLocaleString('en-US')}`;
    this.el.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.healthFill.style.background = s.health > 50
      ? 'linear-gradient(90deg, #37d67a, #9be15d)'
      : s.health > 25 ? 'linear-gradient(90deg, #ffb400, #ffcf5d)' : 'linear-gradient(90deg, #ff3b30, #ff7a6b)';
    this.el.objTitle.textContent = s.objective.title;
    this.el.objText.textContent = s.objective.text;
    this.el.speed.innerHTML = s.driving ? `${Math.round(s.speedKmh)}<small> km/h</small>` : '';
    this.el.hint.textContent = s.hint || '';
    this.el.crosshair.style.display = s.onFoot && !s.inMenu ? 'block' : 'none';
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.message.innerHTML = '';
    }
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.mapCtx;
    const W = 190, R = 95;
    const scale = W / 340;
    const toMap = (x, z) => [R + x * scale, R + (z - 10) * scale];
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    // Base.
    ctx.fillStyle = '#101c2c';
    ctx.fillRect(0, 0, W, W);
    // Ocean strip.
    ctx.fillStyle = '#2a7fa8';
    const [, oy] = toMap(0, OCEAN_Z);
    ctx.fillRect(0, oy, W, W - oy);
    ctx.fillStyle = '#e8d5a0';
    const [, by] = toMap(0, BEACH_Z);
    ctx.fillRect(0, by, W, oy - by);
    // Blocks.
    ctx.fillStyle = '#5d6673';
    for (let x = -130; x <= 130; x += 48) {
      for (let z = -130; z <= 130; z += 48) {
        const [px, pz] = toMap(x - 17, z - 17);
        ctx.fillRect(px, pz, 34 * scale, 34 * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#c8ccd4';
    ctx.lineWidth = 12 * scale;
    for (const r of ROAD_COORDS) {
      const [x1, y1] = toMap(r, -160);
      const [x2, y2] = toMap(r, 170);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-160, r);
      const [x4, y4] = toMap(170, r);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Mission marker.
    if (s.missionMarker) {
      const [mx, my] = toMap(s.missionMarker.x, s.missionMarker.z);
      const pulse = 6 + Math.sin(this.blink * 5) * 2;
      ctx.fillStyle = '#ffb400';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse * 0.7, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse * 0.7, my);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic cars.
    ctx.fillStyle = '#ffffff';
    for (const c of s.trafficCars) {
      const [px, pz] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(px - 1.5, pz - 1.5, 3, 3);
    }
    // Police cars (flashing).
    const flashing = Math.sin(this.blink * 10) > 0;
    ctx.fillStyle = flashing ? '#3fa9ff' : '#ff3b30';
    for (const c of s.policeCars) {
      const [px, pz] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow (north-up map, arrow rotates with heading).
    const [px, pz] = toMap(s.player.x, s.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(s.player.heading);
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
