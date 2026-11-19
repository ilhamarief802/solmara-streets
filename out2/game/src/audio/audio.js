// Sound, all of it synthesised at run time: there is not one audio file in the entry.
// The engine is two detuned oscillators through a low-pass; the siren is a pair of
// alternating tones that get faster and louder with the wanted level; the tyre squeal,
// gunshots, impacts and footsteps are short bursts of filtered noise; and the music is a
// slow chord pad plus a bass line generated from a small district mood table, changing
// with the time of day.
//
// Browsers refuse to start an AudioContext before a gesture, so nothing is created until
// the first pointer or key event. Until then, every call is a cheap no-op.

const MOODS = {
  downtown: { root: 50, chord: [0, 4, 7, 11], bass: [0, 0, 3, 5], tempo: 78, wave: 'sawtooth' },
  marina: { root: 45, chord: [0, 3, 7, 10], bass: [0, 3, 5, 7], tempo: 66, wave: 'triangle' },
  verano: { root: 53, chord: [0, 4, 7, 9], bass: [0, 4, 7, 4], tempo: 84, wave: 'triangle' },
  neon: { root: 48, chord: [0, 3, 7, 10], bass: [0, 0, 10, 7], tempo: 102, wave: 'square' },
  harbour: { root: 41, chord: [0, 5, 7, 10], bass: [0, 0, 5, 7], tempo: 60, wave: 'sawtooth' },
  beach: { root: 55, chord: [0, 4, 7, 11], bass: [0, 7, 5, 4], tempo: 72, wave: 'sine' },
  airstrip: { root: 43, chord: [0, 3, 7, 10], bass: [0, 3, 0, 5], tempo: 58, wave: 'triangle' },
};

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

/** A short, click-free envelope on a gain node. */
function envelope(ctx, gain, peak, attack, decay, at) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

export class GameAudio {
  constructor({ settings, bus = null } = {}) {
    this.settings = settings;
    this.bus = bus;
    this.ctx = null;
    this.started = false;
    this.muted = Boolean(settings?.muted);
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noise = null;
    this.engine = null;
    this.siren = null;
    this.tyre = null;
    this.musicClock = 0;
    this.beat = 0;
    this.chordStep = 0;
    this.mood = 'downtown';
    this.night = false;
    this.rain = false;
    this.engineState = { rpm: 0, load: 0 };
    this.tyreGain = 0;
    this._off = [];
    if (bus) this.attach(bus);
  }

  // ---------------------------------------------------------------- lifecycle
  /** Called on the first pointer/key gesture. Creates and resumes the context. */
  unlock() {
    if (this.started) {
      this._resume();
      return;
    }
    const Ctor = typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.3;
      this.musicGain.connect(this.master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.noise = this._noiseBuffer();
      this._buildEngine();
      this._buildSiren();
      this._buildTyre();
      this.started = true;
      this._resume();
    } catch {
      this.ctx = null;
      this.started = false;
    }
  }

  _resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _noiseBuffer() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Brown-ish noise: warmer than white and less hissy under a low-pass.
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  _buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 4;
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 55;
    const b = ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = 82;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    a.connect(filter);
    b.connect(bGain);
    bGain.connect(filter);
    filter.connect(out);
    out.connect(this.sfxGain);
    a.start();
    b.start();
    this.engine = { out, filter, a, b };
  }

  _buildSiren() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const a = ctx.createOscillator();
    a.type = 'triangle';
    a.frequency.value = 640;
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = 960;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.7;
    a.connect(out);
    b.connect(bGain);
    bGain.connect(out);
    out.connect(this.sfxGain);
    a.start();
    b.start();
    this.siren = { out, a, b, phase: 0 };
  }

  _buildTyre() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1750;
    band.Q.value = 7;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    src.connect(band);
    band.connect(out);
    out.connect(this.sfxGain);
    src.start();
    this.tyre = { src, band, out };
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, now, 0.03);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---------------------------------------------------------------- one-shots
  _burst({ freq = 800, q = 1, peak = 0.3, attack = 0.004, decay = 0.16, lowpass = 0, type = 'bandpass' }) {
    if (!this.started) return;
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    envelope(ctx, gain, peak, attack, decay, at);
    src.connect(filter);
    filter.connect(gain);
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      gain.connect(lp);
      lp.connect(this.sfxGain);
    } else {
      gain.connect(this.sfxGain);
    }
    src.start(at);
    src.stop(at + attack + decay + 0.05);
  }

  _tone({ freq = 440, endFreq = null, peak = 0.2, attack = 0.005, decay = 0.2, type = 'sine' }) {
    if (!this.started) return;
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), at + attack + decay);
    const gain = ctx.createGain();
    envelope(ctx, gain, peak, attack, decay, at);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  ui() {
    this._tone({ freq: 660, endFreq: 880, peak: 0.06, decay: 0.06, type: 'triangle' });
  }

  gunshot(kind = 'pistol') {
    const shotgun = kind === 'shotgun';
    this._burst({ freq: shotgun ? 420 : 900, q: 0.7, peak: shotgun ? 0.55 : 0.36, decay: shotgun ? 0.26 : 0.15 });
    this._tone({ freq: shotgun ? 92 : 150, endFreq: 40, peak: 0.3, decay: 0.18, type: 'sine' });
  }

  impact(strength = 1) {
    const amount = Math.min(1.5, 0.25 + strength * 0.22);
    this._tone({ freq: 96, endFreq: 38, peak: 0.34 * amount, decay: 0.24, type: 'sine' });
    this._burst({ freq: 340, q: 0.6, peak: 0.28 * amount, decay: 0.18, lowpass: 900 });
  }

  footstep(sprinting = false) {
    this._burst({
      freq: sprinting ? 420 : 300,
      q: 1.4,
      peak: sprinting ? 0.14 : 0.08,
      decay: 0.075,
      lowpass: 1200,
    });
  }

  punch() {
    this._burst({ freq: 240, q: 0.9, peak: 0.22, decay: 0.1, lowpass: 700 });
  }

  squeal(amount = 1) {
    this.tyreGain = Math.min(1, this.tyreGain + amount * 0.5);
  }

  // ---------------------------------------------------------------- continuous
  update(dt, state = {}) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const engineTarget = state.car
      ? Math.min(1, 0.35 + Math.abs(state.car.speed) / 28 + Math.abs(state.car.throttle) * 0.25)
      : 0;
    this.tyreGain = Math.max(0, this.tyreGain - dt * 0.9);
    if (this.engine) {
      const car = state.car;
      const speed = Math.abs(car?.speed ?? 0);
      const gear = speed < 7 ? 0 : speed < 15 ? 1 : speed < 22 ? 2 : 3;
      const gearBase = [52, 68, 86, 104][gear];
      const rpm = speed / 27;
      const base = gearBase + rpm * 46;
      this.engine.a.frequency.setTargetAtTime(base, now, 0.08);
      this.engine.b.frequency.setTargetAtTime(base * 1.51, now, 0.08);
      this.engine.filter.frequency.setTargetAtTime(280 + speed * 34 + Math.abs(car?.throttle ?? 0) * 400, now, 0.1);
      this.engine.out.gain.setTargetAtTime(0.0001 + engineTarget * 0.12, now, 0.12);
    }
    if (this.tyre) {
      this.tyre.out.gain.setTargetAtTime(0.0001 + this.tyreGain * 0.09, now, 0.04);
      this.tyre.band.frequency.setTargetAtTime(1500 + Math.sin(now * 9) * 220, now, 0.05);
    }
    if (this.siren) {
      const wanted = Math.max(0, Math.min(5, Number(state.wanted) || 0));
      const active = wanted > 0;
      const fast = 1.8 + wanted * 0.55;
      this.siren.phase += dt * fast;
      const hi = Math.floor(this.siren.phase) % 2 === 0;
      this.siren.a.frequency.setTargetAtTime(hi ? 620 : 840, now, 0.015);
      this.siren.b.frequency.setTargetAtTime(hi ? 930 : 1240, now, 0.015);
      this.siren.out.gain.setTargetAtTime(active ? Math.min(0.13, 0.025 + wanted * 0.025) : 0.0001, now, 0.2);
    }
    this.rain = Boolean(state.raining);
    if (state.district) this.mood = MOODS[state.district] ? state.district : this.mood;
    this.night = Number(state.hour ?? 12) >= 19.5 || Number(state.hour ?? 12) < 6.5;
    this._music(dt);
  }

  /** A slow loop: pad on the bar, bass on the beat, a bell when the district changes keys. */
  _music(dt) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const mood = MOODS[this.mood] ?? MOODS.downtown;
    const beatSeconds = 60 / mood.tempo;
    this.musicClock += dt;
    while (this.musicClock >= beatSeconds) {
      this.musicClock -= beatSeconds;
      const at = ctx.currentTime + 0.04;
      const shift = this.night ? -2 : 0;
      const bassNote = mood.root - 12 + mood.bass[this.beat % mood.bass.length] + shift;
      this._musicTone({ freq: midiToHz(bassNote), at, duration: beatSeconds * 0.9, peak: 0.11, type: 'triangle' });
      if (this.beat % 4 === 0) {
        const chord = mood.chord.map((interval) => mood.root + interval + shift);
        for (const note of chord) {
          this._musicTone({ freq: midiToHz(note), at, duration: beatSeconds * 3.6, peak: 0.035, type: mood.wave });
        }
      }
      if (this.beat % 8 === 0) {
        this._musicTone({
          freq: midiToHz(mood.root + 12 + mood.chord[this.chordStep % mood.chord.length]),
          at,
          duration: beatSeconds * 0.45,
          peak: 0.05,
          type: 'sine',
        });
        this.chordStep += 1;
      }
      this.beat += 1;
    }
  }

  _musicTone({ freq, at, duration, peak, type }) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.night ? 1400 : 2400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(at);
    osc.stop(at + duration + 0.08);
  }

  // ---------------------------------------------------------------- bus wiring
  attach(bus) {
    const on = (type, handler) => this._off.push(bus.on(type, handler));
    on('combat:fire', ({ weapon } = {}) => this.gunshot(weapon?.id === 'shotgun' ? 'shotgun' : 'pistol'));
    on('combat:thugfire', () => this._tone({ freq: 240, endFreq: 70, peak: 0.13, decay: 0.12, type: 'sawtooth' }));
    on('combat:copfire', () => this._tone({ freq: 300, endFreq: 80, peak: 0.12, decay: 0.12, type: 'sawtooth' }));
    on('combat:punch', ({ hit } = {}) => hit && this.punch());
    on('vehicle:crash', ({ impact } = {}) => this.impact(Math.min(2, (impact ?? 4) / 5)));
    on('police:ram', () => this.impact(1.1));
    on('vehicle:tyre', ({ slip } = {}) => this.squeal(Math.min(1, (slip ?? 3) / 9)));
    on('player:footstep', ({ sprinting } = {}) => this.footstep(Boolean(sprinting)));
    on('mission:complete', () => this._musicTone({ freq: midiToHz(76), at: this.ctx?.currentTime ?? 0, duration: 0.6, peak: 0.08, type: 'sine' }));
    on('player:down', () => this._tone({ freq: 180, endFreq: 44, peak: 0.2, decay: 0.9, type: 'sawtooth' }));
    on('wanted:change', ({ wanted } = {}) => this._tone({ freq: wanted > 0 ? 520 : 380, peak: 0.05, decay: 0.1, type: 'square' }));
  }

  dispose() {
    for (const off of this._off) off();
    this._off.length = 0;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.started = false;
  }
}

export function createAudio(options) {
  return new GameAudio(options);
}
