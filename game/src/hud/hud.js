// The HUD, drawn in plain DOM over the canvas: where you are and what time it is in the
// top left, how fast you are going (or that you are on foot) in the bottom left, the one
// context action in the middle, and the controls in the bottom right. It paints at 6 Hz
// and only touches the text nodes that changed, so it never shows up in a frame profile.

const HINTS = 'WASD move · Shift sprint · Space jump/handbrake · F steal a car · V camera · click to look';

export class Hud {
  constructor(root = document.getElementById('hud-root')) {
    this.root = root;
    this.last = '';
    if (!root) return;
    root.innerHTML = '';
    root.classList.add('hud');

    this.top = document.createElement('div');
    this.top.className = 'hud-top';
    this.mark = document.createElement('span');
    this.mark.className = 'hud-mark';
    this.mark.textContent = 'SOLMARA';
    this.district = document.createElement('span');
    this.district.className = 'hud-district';
    this.clock = document.createElement('span');
    this.clock.className = 'hud-clock';
    this.top.append(this.mark, this.district, this.clock);

    this.mode = document.createElement('div');
    this.mode.className = 'hud-mode';
    this.modeLabel = document.createElement('div');
    this.modeLabel.className = 'hud-mode-label';
    this.modeLabel.textContent = 'ON FOOT';
    this.speedRow = document.createElement('div');
    this.speedRow.className = 'hud-speed-row';
    this.speedValue = document.createElement('span');
    this.speedValue.className = 'hud-speed-value';
    this.speedValue.textContent = '0';
    this.speedUnit = document.createElement('span');
    this.speedUnit.className = 'hud-speed-unit';
    this.speedUnit.textContent = 'km/h';
    this.speedRow.append(this.speedValue, this.speedUnit);
    this.bar = document.createElement('div');
    this.bar.className = 'hud-bar';
    this.barFill = document.createElement('div');
    this.barFill.className = 'hud-bar-fill';
    this.bar.append(this.barFill);
    this.mode.append(this.modeLabel, this.speedRow, this.bar);

    this.prompt = document.createElement('div');
    this.prompt.className = 'hud-prompt';
    this.prompt.hidden = true;

    this.hint = document.createElement('div');
    this.hint.className = 'hud-hint';
    this.hint.textContent = HINTS;

    root.append(this.top, this.mode, this.prompt, this.hint);
    this.nodes = {
      district: this.district,
      clock: this.clock,
      modeLabel: this.modeLabel,
      speedValue: this.speedValue,
      barFill: this.barFill,
      prompt: this.prompt,
    };
    this.text = {};
  }

  /** Writes a value only when it changed. */
  set(key, value) {
    if (this.text[key] === value) return;
    this.text[key] = value;
    this.nodes[key].textContent = value;
  }

  /**
   * @param {object} info { districtName, hour, mode, speed, vehicle, prompt }
   */
  update(info = {}) {
    if (!this.root) return;
    const minutes = Math.floor((info.hour ?? 0) * 60);
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    this.set('district', info.districtName ?? 'Solmara');
    this.set('clock', `${hh}:${mm}`);
    const driving = info.mode === 'driving';
    this.modeLabel.classList.toggle('is-driving', driving);
    this.set('modeLabel', driving ? `DRIVING · ${(info.vehicle ?? 'CAR').toUpperCase()}` : 'ON FOOT');
    const speed = Math.round(driving ? info.speed ?? 0 : 0);
    this.set('speedValue', String(speed));
    this.barFill.style.width = `${Math.min(100, (speed / 120) * 100).toFixed(1)}%`;
    const prompt = info.prompt ?? '';
    if (prompt !== this.text.prompt) {
      this.text.prompt = prompt;
      this.prompt.textContent = prompt;
      this.prompt.hidden = !prompt;
    }
    this.speedRow.classList.toggle('is-hidden', !driving);
    this.bar.classList.toggle('is-hidden', !driving);
  }
}

export function createHud() {
  return new Hud();
}
