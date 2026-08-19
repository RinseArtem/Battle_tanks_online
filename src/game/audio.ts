/* Крошечный WebAudio-синтезатор в духе NES, но пожирнее. Без внешних файлов. */

type OscType = OscillatorType;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private beep(type: OscType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, delay = 0, q = 0.8) {
    if (!this.ctx || !this.master) return;
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot() { this.beep("square", 950, 240, 0.08, 0.16); }
  enemyShoot() { this.beep("square", 620, 180, 0.09, 0.1); }
  brickHit() { this.noise(0.07, 0.2, 1400, 300); }
  steelHit() {
    this.beep("triangle", 2600, 1900, 0.05, 0.16);
    this.noise(0.04, 0.12, 5000, 2500);
  }
  bulletClash() { this.beep("square", 1400, 500, 0.06, 0.12); }
  explode(big = false) {
    this.noise(big ? 0.6 : 0.3, big ? 0.5 : 0.32, big ? 1600 : 1100, 70, 0, 0.6);
    this.beep("sine", big ? 170 : 140, 38, big ? 0.5 : 0.28, big ? 0.5 : 0.3);
  }
  playerDeath() {
    this.explode(true);
    this.beep("sawtooth", 400, 60, 0.55, 0.2, 0.08);
  }
  powerup() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.beep("square", n, n, 0.09, 0.14, i * 0.07));
  }
  extraLife() {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((n, i) => this.beep("square", n, n, 0.11, 0.15, i * 0.09));
  }
  freeze() {
    this.beep("sine", 1800, 2600, 0.25, 0.1);
    this.beep("sine", 2400, 3200, 0.3, 0.08, 0.08);
  }
  shield() { this.beep("sine", 600, 1400, 0.18, 0.12); }
  levelStart() {
    const notes = [262, 330, 392, 523];
    notes.forEach((n, i) => this.beep("square", n, n, 0.12, 0.14, i * 0.1));
    this.beep("square", 784, 784, 0.22, 0.14, 0.42);
  }
  levelClear() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((n, i) => this.beep("triangle", n, n, 0.13, 0.16, i * 0.09));
  }
  gameOver() {
    const notes = [392, 311, 262, 196, 131];
    notes.forEach((n, i) => this.beep("sawtooth", n, n * 0.98, 0.24, 0.14, i * 0.18));
  }
  victory() {
    const notes = [523, 523, 523, 659, 784, 1046];
    notes.forEach((n, i) => this.beep("square", n, n, i === 5 ? 0.4 : 0.12, 0.15, i * 0.12));
  }
  uiMove() { this.beep("square", 700, 900, 0.05, 0.08); }
  pauseBlip() { this.beep("square", 440, 220, 0.1, 0.1); }

  // ---------- дезматч ----------
  uiClick() { this.beep("square", 900, 1200, 0.06, 0.1); }
  join() { this.beep("square", 520, 780, 0.09, 0.12); this.beep("square", 780, 1040, 0.09, 0.1, 0.09); }
  dmShoot(kind: string) {
    if (kind === "mg") this.beep("square", 880, 320, 0.05, 0.08);
    else if (kind === "shotgun") { this.noise(0.14, 0.3, 1800, 200); this.beep("square", 300, 90, 0.12, 0.2); }
    else if (kind === "rocket") { this.noise(0.3, 0.2, 900, 150); this.beep("sawtooth", 220, 90, 0.28, 0.14); }
    else if (kind === "laser") { this.beep("sawtooth", 1900, 700, 0.12, 0.12); this.beep("sine", 2400, 900, 0.1, 0.08); }
    else if (kind === "mine") { this.beep("sine", 500, 120, 0.25, 0.3); this.noise(0.3, 0.3, 1200, 100); }
  }
  dmHit() { this.beep("square", 300, 140, 0.06, 0.12); }
  dmBoom(big = false) {
    this.noise(big ? 0.7 : 0.35, big ? 0.5 : 0.3, big ? 1800 : 1200, 60, 0, 0.5);
    this.beep("sine", big ? 160 : 130, 34, big ? 0.55 : 0.3, big ? 0.5 : 0.3);
  }
  pickupSfx() { this.beep("square", 660, 990, 0.08, 0.13); this.beep("square", 990, 1320, 0.09, 0.11, 0.07); }
  healSfx() { this.beep("sine", 500, 900, 0.16, 0.1); this.beep("sine", 700, 1200, 0.16, 0.08, 0.1); }
  alarmSfx() { this.beep("square", 620, 620, 0.14, 0.14); this.beep("square", 470, 470, 0.14, 0.14, 0.18); }
  streakSfx() { [660, 880, 1100, 1320].forEach((n, i) => this.beep("square", n, n, 0.08, 0.13, i * 0.06)); }
  zoneSfx() { this.beep("sawtooth", 200, 60, 0.7, 0.16); }
  countdown() { this.beep("square", 880, 880, 0.1, 0.14); }
}

export const audio = new AudioEngine();
