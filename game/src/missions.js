// NEON BAY story: three jobs for fixer Lena Cruz, then free roam.
// A mission marker (light beacon + floating diamond) and the HUD objective
// always show the player where to go next.
import * as THREE from 'three';
import { dist2 } from './utils.js';

const MISSIONS = [
  {
    title: 'JOB 1 — FIRST WHEELS',
    story: 'Lena needs a driver with wheels of his own. Take any car.',
    steps: [
      { text: 'Steal a car — walk up to one and press E', marker: null, check: 'hasCar' },
      { text: 'Drive to the Docks — follow the yellow beacon', marker: 'docks', check: 'atMarker', radius: 7 },
    ],
    reward: 500,
  },
  {
    title: 'JOB 2 — THE PICKUP',
    story: 'A package is waiting at Bay Market. Fetch it, then bring it to Lena.',
    steps: [
      { text: 'Go to Bay Market and collect the package', marker: 'market', check: 'atMarker', radius: 6 },
      { text: 'Deliver the package to Lena\u2019s Garage', marker: 'garage', check: 'atMarker', radius: 6 },
    ],
    reward: 800,
  },
  {
    title: 'JOB 3 — HEAT RUN',
    story: 'The drop was a setup. The whole Bay PD is on you — lose them, then vanish.',
    steps: [
      { text: 'Lose the cops — get your wanted level to zero', marker: null, check: 'noWanted' },
      { text: 'Reach the Hideout and lay low', marker: 'hideout', check: 'atMarker', radius: 6 },
    ],
    reward: 1500,
  },
];

export class MissionManager {
  constructor(scene, spots, hooks) {
    this.scene = scene;
    this.spots = spots;
    this.hooks = hooks; // {onReward, onMessage, onMissionStart, onAllDone}
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.done = false;
    this.packageHeld = false;
    // Marker: beacon cylinder + ground ring + floating diamond.
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    this.marker.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    this.marker.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    );
    diamond.position.y = 26;
    this.marker.add(diamond);
    this.diamond = diamond;
    this.marker.visible = false;
    scene.add(this.marker);
    this.setStep(0, 0);
  }

  current() { return MISSIONS[this.missionIndex]; }
  currentStep() { return this.done ? null : MISSIONS[this.missionIndex].steps[this.stepIndex]; }

  objectiveText() {
    if (this.done) return { title: 'FREE ROAM', text: 'All jobs done. Find cash drops around Neon Bay, or keep the streets hot.' };
    const m = this.current();
    return { title: m.title, text: this.currentStep().text };
  }

  setStep(missionIndex, stepIndex) {
    this.missionIndex = missionIndex;
    this.stepIndex = stepIndex;
    const step = this.currentStep();
    if (!step) { this.marker.visible = false; return; }
    if (step.marker) {
      const s = this.spots[step.marker];
      this.marker.position.set(s.x, 0, s.z);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }
  }

  startMission(index) {
    this.setStep(index, 0);
    const m = MISSIONS[index];
    if (this.hooks.onMissionStart) this.hooks.onMissionStart(m);
    if (this.hooks.onMessage) this.hooks.onMessage(m.title, m.story);
  }

  completeStep(player, wanted) {
    const m = this.current();
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) {
      if (this.hooks.onReward) this.hooks.onReward(m.reward, `${m.title} — job done: +$${m.reward}`);
      if (this.missionIndex + 1 >= MISSIONS.length) {
        this.done = true;
        this.marker.visible = false;
        if (this.hooks.onAllDone) this.hooks.onAllDone();
        if (this.hooks.onMessage) this.hooks.onMessage('ALL JOBS DONE', 'Neon Bay is yours now, Jax.');
        return;
      }
      this.startMission(this.missionIndex + 1);
      // Job 3 starts hot: the drop was a setup.
      if (this.missionIndex === 2 && wanted) wanted.setHeat(45);
      return;
    }
    this.setStep(this.missionIndex, this.stepIndex);
  }

  update(dt, player, wanted) {
    this.diamond.rotation.y += dt * 2;
    this.diamond.position.y = 26 + Math.sin(Date.now() * 0.002) * 0.5;
    if (this.done) return;
    const step = this.currentStep();
    if (!step) return;
    if (step.check === 'hasCar' && player.currentCar) {
      this.completeStep(player, wanted);
    } else if (step.check === 'atMarker' && step.marker) {
      const s = this.spots[step.marker];
      // While driving, the player's own position is frozen where they got in —
      // the mission target must be measured from the car they are driving.
      const eff = player.currentCar ? player.currentCar.pos : player.pos;
      if (dist2(eff.x, eff.z, s.x, s.z) < step.radius) {
        if (this.missionIndex === 1 && this.stepIndex === 0) this.packageHeld = true;
        if (this.missionIndex === 1 && this.stepIndex === 1) this.packageHeld = false;
        this.completeStep(player, wanted);
      }
    } else if (step.check === 'noWanted' && wanted.stars === 0) {
      this.completeStep(player, wanted);
    }
  }

  reset() {
    this.done = false;
    this.packageHeld = false;
    this.startMission(0);
  }
}
