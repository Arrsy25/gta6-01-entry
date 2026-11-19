// Synthesized sound for NEON BAY: every sound is made with WebAudio, no files.
// Engine hum, siren, gunshot, punch, pickups, mission jingles and a soft pad loop.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol = 0.3, lowpass = 1200, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  click() { this._tone(660, 0.06, 'square', 0.08); }
  punch() { this._noise(0.12, 0.35, 500); this._tone(90, 0.1, 'sine', 0.25, 50); }
  gunshot() { this._noise(0.16, 0.5, 2600); this._tone(160, 0.08, 'square', 0.12, 60); }
  pickup() { this._tone(880, 0.09, 'sine', 0.18); this._tone(1320, 0.14, 'sine', 0.18, null, 0.08); }
  crash() { this._noise(0.35, 0.4, 800); this._tone(70, 0.25, 'sine', 0.3, 40); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.22, null, i * 0.11));
  }
  busted() { [392, 311, 233].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.14, null, i * 0.16)); }
  wasted() { [330, 262, 196, 131].forEach((f, i) => this._tone(f, 0.35, 'sawtooth', 0.14, null, i * 0.18)); }

  engineStart() {
    if (!this.ensure()) return;
    if (this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speed01: 0..1, on: whether the engine should be audible.
  engineSet(speed01, on) {
    if (!this.engineOsc || !this.engineGain) return;
    const target = on ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  engineStop() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch (e) {}
    this.engineOsc = null;
    this.engineGain = null;
  }

  sirenStart() {
    if (!this.ensure() || this.sirenOn) return;
    this.sirenOn = true;
    let hi = false;
    this.sirenTimer = setInterval(() => {
      if (this.muted) return;
      this._tone(hi ? 960 : 720, 0.42, 'sine', 0.045);
      hi = !hi;
    }, 430);
  }

  sirenStop() {
    this.sirenOn = false;
    if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
  }

  // A lazy golden-hour pad: Am – F – C – G, one soft chord every 4 seconds.
  musicStart() {
    if (!this.ensure() || this.musicTimer) return;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const chord = chords[this.musicStep % chords.length];
      this.musicStep++;
      for (const f of chord) this._tone(f, 3.6, 'triangle', 0.035);
    }, 4000);
  }

  musicStop() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
