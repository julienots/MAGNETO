/**
 * Fully procedural audio: every SFX and the music are synthesized with WebAudio,
 * with random variations so nothing sounds repetitive.
 */
type Mood = 'menu' | 'drive' | 'neon' | 'space' | 'heavy' | 'ice' | 'cosmic' | 'void' | 'boss';

const MOODS: Record<Mood, { bpm: number; root: number; scale: number[]; wave: OscillatorType; swing: number; dense: number }> = {
  menu: { bpm: 100, root: 48, scale: [0, 2, 4, 7, 9], wave: 'triangle', swing: 0.08, dense: 0.5 },
  drive: { bpm: 118, root: 45, scale: [0, 3, 5, 7, 10], wave: 'sawtooth', swing: 0, dense: 0.8 },
  neon: { bpm: 124, root: 50, scale: [0, 2, 3, 7, 10], wave: 'square', swing: 0.05, dense: 0.85 },
  space: { bpm: 108, root: 47, scale: [0, 2, 4, 7, 9], wave: 'triangle', swing: 0, dense: 0.6 },
  heavy: { bpm: 132, root: 40, scale: [0, 1, 5, 7, 8], wave: 'sawtooth', swing: 0, dense: 0.9 },
  ice: { bpm: 112, root: 52, scale: [0, 2, 3, 7, 9], wave: 'triangle', swing: 0.04, dense: 0.7 },
  cosmic: { bpm: 100, root: 48, scale: [0, 2, 4, 6, 9], wave: 'sine', swing: 0.06, dense: 0.6 },
  void: { bpm: 140, root: 44, scale: [0, 1, 3, 6, 7], wave: 'square', swing: 0, dense: 0.85 },
  boss: { bpm: 146, root: 41, scale: [0, 1, 3, 5, 7, 8], wave: 'sawtooth', swing: 0, dense: 1 },
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const vary = (v: number, pct = 0.08) => v * (1 + (Math.random() * 2 - 1) * pct);

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private humOsc: OscillatorNode | null = null;
  private humOsc2: OscillatorNode | null = null;
  private humGain!: GainNode;
  private humFilter!: BiquadFilterNode;
  private recent = new Map<string, number>();
  sfxVol = 0.8;
  musicVol = 0.55;
  private mood: Mood | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: any = null;
  private intensity = 0;
  private pattern: number[] = [];
  private musicFilter!: BiquadFilterNode;
  private paused = false;

  /** Must be called from a user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 9000;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol * 0.5;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // magnetic hum (continuous, modulated by the field)
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    this.humFilter = ctx.createBiquadFilter(); this.humFilter.type = 'bandpass'; this.humFilter.Q.value = 3; this.humFilter.frequency.value = 400;
    this.humOsc = ctx.createOscillator(); this.humOsc.type = 'sawtooth'; this.humOsc.frequency.value = 70;
    this.humOsc2 = ctx.createOscillator(); this.humOsc2.type = 'square'; this.humOsc2.frequency.value = 140.7;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.humOsc.connect(this.humFilter); this.humOsc2.connect(g2).connect(this.humFilter);
    this.humFilter.connect(this.humGain).connect(this.sfxBus);
    this.humOsc.start(); this.humOsc2.start();
    if (this.mood) { const m = this.mood; this.mood = null; this.music(m); }
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
  }
  suspend() { this.paused = true; this.ctx?.suspend(); }
  resume() { this.paused = false; this.ctx?.resume(); }

  private ok(key: string, gapMs: number) {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    if (now - (this.recent.get(key) ?? 0) < gapMs) return false;
    this.recent.set(key, now);
    return true;
  }
  private t() { return this.ctx!.currentTime; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { to?: number; attack?: number; dest?: AudioNode; delay?: number; filter?: number } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx; const t0 = this.t() + (opts.delay ?? 0);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = o;
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; o.connect(f); node = f; }
    node.connect(g).connect(opts.dest ?? this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private noise(dur: number, vol: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; delay?: number; dest?: AudioNode; attack?: number } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx; const t0 = this.t() + (opts.delay ?? 0);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = vary(1, 0.15);
    const f = ctx.createBiquadFilter(); f.type = opts.type ?? 'lowpass'; f.frequency.setValueAtTime(opts.freq ?? 2000, t0); f.Q.value = opts.q ?? 0.8;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(opts.dest ?? this.sfxBus);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  /* ---------------- UI ---------------- */
  tap() { if (!this.ok('tap', 30)) return; this.tone(vary(880, 0.05), 0.07, 'triangle', 0.25, { to: 1300 }); this.noise(0.03, 0.08, { type: 'highpass', freq: 4000 }); }
  back() { if (!this.ok('tap', 30)) return; this.tone(vary(660), 0.08, 'triangle', 0.22, { to: 400 }); }
  pop() { if (!this.ok('pop', 25)) return; this.tone(vary(500, 0.2), 0.09, 'sine', 0.3, { to: vary(1400, 0.1) }); }
  error() { if (!this.ok('err', 120)) return; this.tone(180, 0.18, 'square', 0.15, { to: 120, filter: 1200 }); this.tone(140, 0.2, 'square', 0.12, { to: 90, delay: 0.09, filter: 1200 }); }
  coin(i = 0) { if (!this.ok('coin' + (i % 3), 18)) return; const b = 1200 + (i % 8) * 90; this.tone(b, 0.06, 'square', 0.1, { filter: 5000 }); this.tone(b * 1.5, 0.14, 'square', 0.09, { delay: 0.05, filter: 5000 }); }
  crystal() { if (!this.ok('crys', 40)) return; [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(84 + s), 0.25, 'sine', 0.12, { delay: i * 0.04 })); }
  star(i: number) { if (!this.ok('star' + i, 10)) return; const base = 76 + i * 4; [0, 7, 12].forEach((s, k) => this.tone(mtof(base + s), 0.3, 'triangle', 0.2, { delay: k * 0.05 })); this.noise(0.3, 0.08, { type: 'highpass', freq: 6000 }); }
  whooshUI() { if (!this.ok('wui', 60)) return; this.noise(0.25, 0.12, { type: 'bandpass', freq: 600, to: 3000, q: 1.5, attack: 0.08 }); }

  /* ---------------- gameplay ---------------- */
  /** Continuous magnet hum. intensity 0..1, polarity ±1 */
  field(intensity: number, polarity: number) {
    if (!this.ctx || !this.humOsc) return;
    const t = this.t();
    const base = polarity > 0 ? 62 : 92;
    this.humOsc.frequency.setTargetAtTime(base + intensity * 30, t, 0.05);
    this.humOsc2!.frequency.setTargetAtTime((base + intensity * 30) * 2.01, t, 0.05);
    this.humFilter.frequency.setTargetAtTime(300 + intensity * 1400, t, 0.06);
    this.humGain.gain.setTargetAtTime(intensity * 0.11, t, 0.06);
  }
  flip(pol: number) {
    if (!this.ok('flip', 50)) return;
    if (pol > 0) { this.tone(vary(220), 0.16, 'sawtooth', 0.18, { to: 520, filter: 2500 }); this.tone(vary(440), 0.12, 'sine', 0.2, { to: 900 }); }
    else { this.tone(vary(520), 0.16, 'sawtooth', 0.18, { to: 200, filter: 2500 }); this.tone(vary(900), 0.12, 'sine', 0.2, { to: 300 }); }
  }
  launch(power: number) {
    if (!this.ok('launch', 40)) return;
    const p = Math.min(1, power);
    this.noise(0.22 + p * 0.2, 0.25 + p * 0.25, { type: 'bandpass', freq: 400, to: 4000, q: 1.2, attack: 0.01 });
    this.tone(vary(160), 0.2, 'sine', 0.3 * p + 0.1, { to: 60 });
  }
  impact(power: number, material: 'metal' | 'wood' | 'robot' | 'ice' | 'rock' = 'metal') {
    if (!this.ok('imp' + material, 28)) return;
    const p = Math.max(0.15, Math.min(1, power));
    this.noise(0.08 + p * 0.1, 0.2 + p * 0.35, { freq: material === 'wood' ? 1500 : material === 'ice' ? 6000 : 3000, to: 200 });
    this.tone(vary(material === 'wood' ? 140 : 90, 0.2), 0.12 + p * 0.1, 'sine', 0.35 * p + 0.1, { to: 40 });
    if (material === 'metal' || material === 'robot') this.tone(vary(material === 'robot' ? 600 : 1100, 0.25), 0.18, 'square', 0.05 * p + 0.02, { to: vary(300), filter: 3500 });
    if (material === 'ice') this.tone(vary(2400, 0.3), 0.2, 'sine', 0.08, { to: 3600 });
  }
  hitEnemy(power: number) {
    if (!this.ok('hitE', 30)) return;
    this.tone(vary(300, 0.2), 0.09, 'square', 0.12, { to: 120, filter: 2500 });
    this.noise(0.06, 0.15 + power * 0.15, { type: 'bandpass', freq: vary(1800, 0.3), q: 2 });
  }
  enemyDie() { if (!this.ok('die', 35)) return; this.tone(vary(700, 0.15), 0.22, 'square', 0.1, { to: 90, filter: 3000 }); this.noise(0.18, 0.18, { freq: 2500, to: 300 }); this.tone(vary(1500, 0.2), 0.1, 'sine', 0.08, { delay: 0.04, to: 2400 }); }
  explosion(size = 1) {
    if (!this.ok('boom', 45)) return;
    const s = Math.min(2, size);
    this.noise(0.5 + s * 0.4, 0.5 + s * 0.15, { freq: 1600, to: 60, attack: 0.002 });
    this.tone(vary(70, 0.15), 0.5 + s * 0.3, 'sine', 0.6, { to: 28 });
    this.noise(0.12, 0.25, { type: 'highpass', freq: 3000 });
  }
  hurt() { if (!this.ok('hurt', 120)) return; this.tone(vary(240), 0.2, 'sawtooth', 0.18, { to: 90, filter: 1500 }); this.noise(0.15, 0.2, { freq: 900, to: 200 }); }
  shoot() { if (!this.ok('shoot', 60)) return; this.tone(vary(900, 0.15), 0.12, 'square', 0.06, { to: 300, filter: 4000 }); }
  zap() { if (!this.ok('zap', 40)) return; for (let i = 0; i < 3; i++) this.tone(vary(1800, 0.4), 0.05, 'sawtooth', 0.08, { delay: i * 0.03, to: vary(400), filter: 6000 }); this.noise(0.15, 0.15, { type: 'highpass', freq: 5000 }); }
  freeze() { if (!this.ok('frz', 80)) return; this.noise(0.4, 0.15, { type: 'highpass', freq: 7000, to: 2000 }); this.tone(2600, 0.3, 'sine', 0.06, { to: 1800 }); }
  shield() { if (!this.ok('shd', 60)) return; this.tone(vary(1300), 0.15, 'sine', 0.15, { to: 800 }); this.tone(vary(1950), 0.15, 'sine', 0.08, { to: 1200 }); }
  pickup() { if (!this.ok('pick', 40)) return; this.tone(vary(900), 0.12, 'sine', 0.18, { to: 1800 }); }
  deposit() { if (!this.ok('dep', 60)) return; [0, 4, 7, 12, 16].forEach((s, i) => this.tone(mtof(72 + s), 0.2, 'triangle', 0.16, { delay: i * 0.05 })); }
  combo(tier: number) {
    if (!this.ok('combo', 60)) return;
    const base = 64 + Math.min(tier, 7) * 2;
    [0, 4, 7, 12].slice(0, 2 + Math.min(2, Math.floor(tier / 2))).forEach((s, i) => this.tone(mtof(base + s), 0.22, 'square', 0.09, { delay: i * 0.045, filter: 4000 }));
    if (tier >= 4) this.noise(0.4, 0.12, { type: 'highpass', freq: 5000, to: 9000 });
  }
  ability(id: string) {
    if (!this.ok('abil', 100)) return;
    this.noise(0.7, 0.35, { type: 'bandpass', freq: 200, to: 5000, q: 1, attack: 0.15 });
    this.tone(id === 'zeroField' ? 1200 : 110, 0.7, 'sawtooth', 0.2, { to: id === 'zeroField' ? 200 : 880, filter: 3000, attack: 0.1 });
    this.tone(55, 0.8, 'sine', 0.4, { to: 35, delay: 0.2 });
  }
  bossRoar() {
    if (!this.ok('roar', 400)) return;
    this.tone(60, 1.4, 'sawtooth', 0.35, { to: 38, filter: 600, attack: 0.08 });
    this.tone(90, 1.2, 'square', 0.15, { to: 50, filter: 500, attack: 0.1 });
    this.noise(1.3, 0.3, { freq: 600, to: 120, attack: 0.15 });
  }
  warning() { if (!this.ok('warn', 300)) return; this.tone(880, 0.12, 'square', 0.12, { filter: 3000 }); this.tone(880, 0.12, 'square', 0.12, { delay: 0.18, filter: 3000 }); }
  countdown(final = false) { this.tone(final ? 1320 : 660, final ? 0.4 : 0.15, 'square', 0.15, { filter: 3500 }); }
  victory() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19];
    seq.forEach((s, i) => this.tone(mtof(67 + s), 0.25, 'square', 0.12, { delay: i * 0.09, filter: 5000 }));
    this.noise(1.2, 0.1, { type: 'highpass', freq: 6000, delay: 0.6 });
  }
  defeat() { [7, 5, 3, 0].forEach((s, i) => this.tone(mtof(60 + s), 0.35, 'triangle', 0.18, { delay: i * 0.18 })); }
  chestShake(i: number) { this.noise(0.18, 0.25, { freq: 900, to: 300 }); this.tone(vary(120 + i * 30), 0.15, 'square', 0.12, { filter: 900 }); }
  chestBurst(rarityIdx: number) {
    this.explosion(0.8 + rarityIdx * 0.2);
    const base = 72 + rarityIdx * 2;
    [0, 4, 7, 11, 14, 19].slice(0, 3 + rarityIdx).forEach((s, i) => this.tone(mtof(base + s), 0.6, 'triangle', 0.13, { delay: 0.1 + i * 0.06 }));
  }
  reveal(rarityIdx: number) {
    this.tone(mtof(76 + rarityIdx * 3), 0.4, 'sine', 0.2, { to: mtof(88 + rarityIdx * 3) });
    if (rarityIdx >= 3) this.noise(1, 0.15, { type: 'highpass', freq: 5000, attack: 0.2 });
  }
  levelUp() { [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(mtof(64 + s), 0.3, 'square', 0.1, { delay: i * 0.06, filter: 5000 })); }
  introPulse() { this.tone(50, 1.2, 'sine', 0.5, { to: 30 }); this.noise(1.5, 0.2, { type: 'bandpass', freq: 300, to: 6000, q: 0.7, attack: 0.05 }); }
  particleTick(i: number) { if (!this.ok('ptick', 25)) return; this.tone(mtof(84 + (i % 5) * 2), 0.04, 'sine', 0.05); }

  /* ---------------- music ---------------- */
  music(mood: Mood | null) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!mood || !this.ctx) return;
    this.step = 0; this.nextTime = this.t() + 0.1;
    const m = MOODS[mood];
    // generate a 32-step melodic pattern for variety per session
    this.pattern = Array.from({ length: 32 }, (_, i) => (i % 4 === 0 || Math.random() < m.dense * 0.45 ? Math.floor(Math.random() * m.scale.length) : -1));
    this.timer = setInterval(() => this.schedule(), 25);
  }
  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.ctx) this.musicFilter.frequency.setTargetAtTime(2500 + this.intensity * 9000, this.t(), 0.3);
  }
  private schedule() {
    if (!this.ctx || !this.mood || this.ctx.state !== 'running') return;
    const m = MOODS[this.mood];
    const stepDur = 60 / m.bpm / 4;
    while (this.nextTime < this.t() + 0.12) {
      const s = this.step % 32;
      const tt = this.nextTime + (s % 2 ? m.swing * stepDur : 0);
      this.playStep(s, tt, m, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }
  private playStep(s: number, t: number, m: (typeof MOODS)[Mood], sd: number) {
    const ctx = this.ctx!; const dest = this.musicBus;
    const menu = this.mood === 'menu';
    const kick = () => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.3);
    };
    const hat = (v: number, open = false) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.15 : 0.04));
      src.connect(f).connect(g).connect(dest); src.start(t, Math.random()); src.stop(t + 0.2);
    };
    const snare = () => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(f).connect(g).connect(dest); src.start(t, Math.random()); src.stop(t + 0.2);
      const o = ctx.createOscillator(); const g2 = ctx.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
      g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g2).connect(dest); o.start(t); o.stop(t + 0.12);
    };
    const note = (midi: number, dur: number, type: OscillatorType, vol: number, cutoff: number) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(midi);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    };
    const bar = Math.floor(this.step / 16) % 4;
    const chordShift = [0, 0, m.scale[3] ?? 7, m.scale[2] ?? 5][bar] - (bar === 3 ? 12 : 0);
    // drums
    if (!menu) {
      if (s % 4 === 0) kick();
      if (this.mood === 'boss' && s % 8 === 6) kick();
      if (s % 8 === 4) snare();
      hat(s % 2 === 0 ? 0.12 : 0.06 + this.intensity * 0.06, s % 8 === 6);
    } else {
      if (s % 8 === 0) kick();
      if (s % 4 === 2) hat(0.05, true);
    }
    // bass
    if (s % 2 === 0 && (s % 8 !== 6 || menu)) note(m.root - 12 + chordShift + (s % 8 === 4 ? 7 : 0), sd * 1.8, 'sawtooth', menu ? 0.12 : 0.2, 900 + this.intensity * 600);
    // arp/lead
    const pi = this.pattern[s];
    if (pi >= 0) {
      const deg = m.scale[pi]; const oct = s % 16 >= 8 ? 24 : 12;
      note(m.root + oct + deg + chordShift, sd * (menu ? 3 : 1.6), m.wave, menu ? 0.07 : 0.06 + this.intensity * 0.04, 3000 + this.intensity * 3000);
    }
    // pad on bar start
    if (s % 16 === 0) for (const d of [0, m.scale[2] ?? 4, m.scale[3] ?? 7]) note(m.root + 12 + d + chordShift, sd * 16, 'triangle', 0.035, 1800);
  }
}
export const audio = new AudioEngine();
export type { Mood };
