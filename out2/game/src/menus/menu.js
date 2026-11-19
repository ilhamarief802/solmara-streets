// The front end: a start screen over the paused city, an Escape pause menu, the settings
// panel every other screen shares, and the two story cards (wasted/busted, mission
// complete). It is plain DOM above the canvas, so it works before pointer lock, without
// the WebGL context and with a mouse or the arrow keys: every button is reachable by Tab,
// Enter and Escape returns one screen, never to a dead end.
//
// The menu never simulates the game. It pauses the loop, lets the last frame stay on the
// canvas behind a scrim, and resumes when the player chooses. The shot rig hides it.

import { hasSave, loadSave, writeSave, snapshotGame, restoreGame, clearSave } from '../state/save.js';

const SCREENS = ['start', 'pause', 'settings', 'credits', 'end', 'complete'];

export class MenuUI {
  constructor({ game, settings, audio = null, perf = null, onSaved = null }) {
    this.game = game;
    this.settings = settings;
    this.audio = audio;
    this.perf = perf;
    this.onSaved = onSaved;
    this.screen = null;
    this.returnTo = 'start';
    this.root = null;
    this.settingsFrom = 'start';
    this.completeTimer = 0;
    this.bound = false;
    this._build();
    this._bindKeys();
    this._bindEvents();
  }

  // ---------------------------------------------------------------- DOM
  _build() {
    const root = document.createElement('div');
    root.id = 'menu-root';
    root.className = 'menu-root';
    root.hidden = true;
    document.body.append(root);
    this.root = root;
    this.screens = {};

    const screen = (name) => {
      const node = document.createElement('section');
      node.className = `menu-screen menu-${name}`;
      node.dataset.screen = name;
      node.hidden = true;
      root.append(node);
      this.screens[name] = node;
      return node;
    };

    const button = (parent, label, action, kind = '') => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `menu-button ${kind}`.trim();
      node.textContent = label;
      node.addEventListener('click', () => {
        this.click();
        action();
      });
      parent.append(node);
      return node;
    };

    // ------------------------------------------------------------ start
    const start = screen('start');
    const startCard = document.createElement('div');
    startCard.className = 'menu-card menu-card-start';
    start.append(startCard);
    const mark = document.createElement('div');
    mark.className = 'menu-mark';
    mark.textContent = 'SOLMARA';
    startCard.append(mark);
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = 'STREETS';
    startCard.append(title);
    const subtitle = document.createElement('p');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = 'A sun-soaked coastal city. One stolen coupe. Three hundred days of summer.';
    startCard.append(subtitle);
    const startButtons = document.createElement('div');
    startButtons.className = 'menu-buttons';
    startCard.append(startButtons);
    this.playButton = button(startButtons, 'Play', () => this.startNew());
    this.continueButton = button(startButtons, 'Continue', () => this.continueGame());
    button(startButtons, 'Settings', () => this.openSettings('start'));
    button(startButtons, 'Credits', () => this.show('credits'));
    this.continueButton.disabled = !hasSave();
    const keyline = document.createElement('p');
    keyline.className = 'menu-keyline';
    keyline.textContent = 'WASD walk · Shift sprint · E talk · F steal · LMB fight · V camera · Esc pause';
    startCard.append(keyline);

    // ------------------------------------------------------------ pause
    const pause = screen('pause');
    const pauseCard = document.createElement('div');
    pauseCard.className = 'menu-card menu-card-pause';
    pause.append(pauseCard);
    const paused = document.createElement('div');
    paused.className = 'menu-eyebrow';
    paused.textContent = 'PAUSED';
    pauseCard.append(paused);
    const pauseTitle = document.createElement('h2');
    pauseTitle.className = 'menu-title-sm';
    pauseTitle.textContent = 'Solmara can wait.';
    pauseCard.append(pauseTitle);
    const pauseButtons = document.createElement('div');
    pauseButtons.className = 'menu-buttons';
    pauseCard.append(pauseButtons);
    button(pauseButtons, 'Resume', () => this.resume());
    button(pauseButtons, 'Settings', () => this.openSettings('pause'));
    button(pauseButtons, 'Quit to menu', () => this.quitToMenu());
    const pauseFoot = document.createElement('p');
    pauseFoot.className = 'menu-keyline';
    pauseFoot.textContent = 'Esc resumes · progress saves when you pause';
    pauseCard.append(pauseFoot);

    // ------------------------------------------------------------ settings
    const settingsScreen = screen('settings');
    const settingsCard = document.createElement('div');
    settingsCard.className = 'menu-card menu-card-settings';
    settingsScreen.append(settingsCard);
    const settingsTitle = document.createElement('h2');
    settingsTitle.className = 'menu-title-sm';
    settingsTitle.textContent = 'SETTINGS';
    settingsCard.append(settingsTitle);
    const grid = document.createElement('div');
    grid.className = 'menu-settings';
    settingsCard.append(grid);
    this.rows = {};

    const row = (label, hint) => {
      const line = document.createElement('label');
      line.className = 'menu-setting';
      const name = document.createElement('span');
      name.className = 'menu-setting-label';
      name.textContent = label;
      line.append(name);
      if (hint) {
        const note = document.createElement('span');
        note.className = 'menu-setting-hint';
        note.textContent = hint;
        line.append(note);
      }
      grid.append(line);
      return line;
    };

    const slider = (key, label, min, max, step, format) => {
      const line = row(label);
      const control = document.createElement('span');
      control.className = 'menu-setting-control';
      const value = document.createElement('output');
      value.className = 'menu-setting-value';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.className = 'menu-slider';
      input.dataset.setting = key;
      input.addEventListener('input', () => {
        value.textContent = format(Number(input.value));
        this._applyLive(key, Number(input.value));
      });
      input.addEventListener('change', () => this.saveSettings());
      control.append(input, value);
      line.append(control);
      this.rows[key] = { input, value, format };
      return input;
    };

    const toggle = (key, label, onChange = null) => {
      const line = row(label);
      const control = document.createElement('span');
      control.className = 'menu-setting-control';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'menu-toggle';
      input.dataset.setting = key;
      input.addEventListener('change', () => {
        this.click();
        if (onChange) onChange(input.checked);
        this._applyLive(key, input.checked);
        this.saveSettings();
      });
      control.append(input);
      line.append(control);
      this.rows[key] = { input, format: (v) => (v ? 'on' : 'off') };
      return input;
    };

    slider('drawDistance', 'Draw distance', 1200, 4500, 100, (v) => `${(v / 1000).toFixed(1)} km`);
    slider('traffic', 'Traffic', 0, 48, 1, (v) => `${v} cars`);
    slider('pedestrians', 'Pedestrians', 0, 48, 1, (v) => `${v} people`);
    slider('sensitivity', 'Camera sensitivity', 0.55, 2.4, 0.05, (v) => `${v.toFixed(2)}×`);

    const shadowLine = row('Shadow quality');
    const shadowControl = document.createElement('span');
    shadowControl.className = 'menu-setting-control menu-segmented';
    const shadowOff = document.createElement('button');
    shadowOff.type = 'button';
    shadowOff.textContent = 'Off';
    const shadowLow = document.createElement('button');
    shadowLow.type = 'button';
    shadowLow.textContent = 'Low';
    shadowControl.append(shadowOff, shadowLow);
    shadowLine.append(shadowControl);
    this.shadowButtons = { off: shadowOff, low: shadowLow };
    shadowOff.addEventListener('click', () => {
      this.click();
      this._applyLive('shadows', 'off');
      this.saveSettings();
    });
    shadowLow.addEventListener('click', () => {
      this.click();
      this._applyLive('shadows', 'low');
      this.saveSettings();
    });

    toggle('post', 'Post processing', null);
    toggle('mute', 'Mute all audio', (muted) => this.audio?.setMuted(muted));
    toggle('fps', 'Show frame rate', (shown) => this.perf?.toggle(shown));

    const settingsButtons = document.createElement('div');
    settingsButtons.className = 'menu-buttons menu-buttons-row';
    settingsCard.append(settingsButtons);
    button(settingsButtons, 'Back', () => this.closeSettings(), 'is-quiet');
    this.settingsNote = document.createElement('p');
    this.settingsNote.className = 'menu-keyline';
    this.settingsNote.textContent = 'Changes apply at once; Back keeps them and writes the save.';
    settingsCard.append(this.settingsNote);

    // ------------------------------------------------------------ credits
    const credits = screen('credits');
    const creditsCard = document.createElement('div');
    creditsCard.className = 'menu-card menu-card-start';
    credits.append(creditsCard);
    const creditsEyebrow = document.createElement('div');
    creditsEyebrow.className = 'menu-eyebrow';
    creditsEyebrow.textContent = 'CREDITS';
    creditsCard.append(creditsEyebrow);
    const creditsTitle = document.createElement('h2');
    creditsTitle.className = 'menu-title-sm';
    creditsTitle.textContent = 'SOLMARA STREETS';
    creditsCard.append(creditsTitle);
    const creditsText = document.createElement('div');
    creditsText.className = 'menu-credits';
    creditsText.innerHTML =
      '<p>An open-city entry for make.fun gta6-01.</p>' +
      '<p>Built with three.js, one canvas and no downloaded assets: every road, tower, palm, engine tone and chord is generated in the browser.</p>' +
      '<p>City, driving, traffic, crowd, fighting, police and story by the Solmara build sessions.</p>' +
      '<p class="menu-dim">Sound is Web Audio only. Music is a procedural loop that follows the district and the hour.</p>';
    creditsCard.append(creditsText);
    const creditsButtons = document.createElement('div');
    creditsButtons.className = 'menu-buttons menu-buttons-row';
    creditsCard.append(creditsButtons);
    button(creditsButtons, 'Back', () => this.closeCredits(), 'is-quiet');

    // ------------------------------------------------------------ wasted / busted
    const end = screen('end');
    const endCard = document.createElement('div');
    endCard.className = 'menu-card menu-card-end';
    end.append(endCard);
    this.endTitle = document.createElement('div');
    this.endTitle.className = 'menu-end-title';
    this.endTitle.textContent = 'WASTED';
    endCard.append(this.endTitle);
    this.endText = document.createElement('p');
    this.endText.className = 'menu-subtitle';
    this.endText.textContent = 'You wake up at the hospital.';
    endCard.append(this.endText);
    const endButtons = document.createElement('div');
    endButtons.className = 'menu-buttons menu-buttons-row';
    endCard.append(endButtons);
    button(endButtons, 'Continue', () => this.continueAfterDown(), 'is-hot');
    button(endButtons, 'Quit to menu', () => this.quitToMenu(), 'is-quiet');

    // ------------------------------------------------------------ mission complete
    const complete = screen('complete');
    const completeCard = document.createElement('div');
    completeCard.className = 'menu-card menu-card-complete';
    complete.append(completeCard);
    const completeEyebrow = document.createElement('div');
    completeEyebrow.className = 'menu-eyebrow is-gold';
    completeEyebrow.textContent = 'MISSION COMPLETE';
    completeCard.append(completeEyebrow);
    this.completeTitle = document.createElement('h2');
    this.completeTitle.className = 'menu-title-sm';
    completeCard.append(this.completeTitle);
    this.completeText = document.createElement('p');
    this.completeText.className = 'menu-subtitle';
    completeCard.append(this.completeText);
    const completeButtons = document.createElement('div');
    completeButtons.className = 'menu-buttons menu-buttons-row';
    completeCard.append(completeButtons);
    button(completeButtons, 'Keep driving', () => this.hideComplete(), 'is-hot');
  }

  // ---------------------------------------------------------------- wiring
  _bindKeys() {
    window.addEventListener('keydown', (event) => {
      if (this.game?.settings?.shot || this.game?.shots?.active) return;
      if (event.code === 'Escape') {
        if (this.screen === 'settings') {
          event.preventDefault();
          this.closeSettings();
        } else if (this.screen === 'credits') {
          event.preventDefault();
          this.closeCredits();
        } else if (this.screen === 'start') {
          // No dead end: Escape on the title screen starts the default game.
          event.preventDefault();
          if (!this.continueButton.disabled) this.continueGame();
          else this.startNew();
        } else if (this.screen === 'pause') {
          event.preventDefault();
          this.resume();
        } else if (this.screen === 'end') {
          event.preventDefault();
          this.continueAfterDown();
        } else if (this.screen === 'complete') {
          event.preventDefault();
          this.hideComplete();
        } else if (!this.screen) {
          event.preventDefault();
          this.pause();
        }
      }
      if (this.screen === 'pause' && event.code === 'KeyP') {
        event.preventDefault();
        this.resume();
      }
      if (this.screen && (event.code === 'ArrowDown' || event.code === 'ArrowUp')) {
        event.preventDefault();
        this._moveFocus(event.code === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  _moveFocus(direction) {
    const buttons = [...this.root.querySelectorAll('button:not([disabled])')].filter((node) => node.offsetParent !== null);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    const next = index === -1 ? (direction > 0 ? 0 : buttons.length - 1) : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  _bindEvents() {
    const bus = this.game?.bus;
    if (!bus) return;
    bus.on('player:down', ({ kind }) => this.showEnd(kind));
    bus.on('player:respawn', () => this.hideEnd());
    bus.on('mission:complete', (payload) => this.showComplete(payload));
    if (this.settings.showFps) this.perf?.toggle(true);
  }

  click() {
    this.audio?.ui();
  }

  // ---------------------------------------------------------------- screens
  show(name) {
    if (!SCREENS.includes(name)) return;
    for (const key of SCREENS) this.screens[key].hidden = key !== name;
    this.root.hidden = false;
    this.screen = name;
    document.body.dataset.menu = name;
    this.root.classList.toggle('is-start', name === 'start');
    const first = this.screens[name].querySelector('button:not([disabled])');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  hide() {
    for (const key of SCREENS) this.screens[key].hidden = true;
    this.root.hidden = true;
    this.screen = null;
    delete document.body.dataset.menu;
  }

  /** Called once at boot: title over the paused world. */
  boot() {
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    this.continueButton.disabled = !hasSave();
    this.show('start');
  }

  startNew() {
    clearSave();
    const game = this.game;
    if (game.missions) {
      game.missions.money = 750;
      game.missions.completed = [];
      game.missions.active = null;
    }
    if (game.combat) {
      game.combat.health = 100;
      game.combat.armour = 0;
      game.combat.downKind = null;
    }
    const spawn = game.world.spawnById('downtown-boulevard') ?? { x: 340, z: 80, heading: 0 };
    game.player.teleport(spawn.x - 10.8, spawn.z - 20, 0);
    game.player.character?.rest();
    if (game.cameraRig) {
      game.cameraRig.anchor.x = game.player.position.x;
      game.cameraRig.anchor.z = game.player.position.z;
      game.cameraRig.yaw = 0;
    }
    this.resume();
    this.game.hud?.notify('Solmara is yours. Press E at Rosa to start.', 'info');
    this._persist();
  }

  continueGame() {
    const save = loadSave();
    if (!save) {
      this.startNew();
      return;
    }
    restoreGame(save, this.game);
    this.resume();
    this.game.hud?.notify(`Welcome back · $${save.money.toLocaleString('en-US')}`, 'reward');
  }

  pause() {
    if (this.screen || this.game.combat?.isDown) return;
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    this.game.input.releaseLock?.();
    this._persist();
    this.show('pause');
  }

  resume() {
    this.hide();
    this.game.loop.setPaused(false);
    this.game.input.enabled = true;
    this.game.input.requestLock?.();
    this.game.bus?.emit('menu:resume', {});
  }

  quitToMenu() {
    this._persist();
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    this.game.input.releaseLock?.();
    this.continueButton.disabled = !hasSave();
    this.show('start');
  }

  openSettings(from) {
    this.settingsFrom = from;
    this._fillSettings();
    this.show('settings');
  }

  closeSettings() {
    this.saveSettings();
    if (this.settingsFrom === 'pause') this.show('pause');
    else this.show('start');
  }

  closeCredits() {
    this.show('start');
  }

  showEnd(kind) {
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    // Let go of pointer lock, or the cursor cannot reach the two buttons below.
    this.game.input.releaseLock?.();
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.endTitle.classList.toggle('is-busted', kind === 'busted');
    this.endText.textContent =
      kind === 'busted' ? 'The precinct lets you out at the station.' : 'You wake up at the hospital.';
    this.show('end');
  }

  hideEnd() {
    if (this.screen !== 'end') return;
    this.hide();
    this.game.loop.setPaused(false);
    this.game.input.enabled = true;
  }

  continueAfterDown() {
    this.game.combat?.respawn?.();
    this.hideEnd();
    this.game.input.requestLock?.();
  }

  showComplete(payload) {
    const reward = Number(payload?.reward ?? 0);
    this.completeTitle.textContent = payload?.title ?? 'Job done';
    this.completeText.textContent = `$${reward.toLocaleString('en-US')} paid into the wallet.`;
    // The card does not stop the drive, but it does free the cursor for its one button.
    this.game.input.releaseLock?.();
    this.show('complete');
    this.completeTimer = 4.8;
    this._persist();
  }

  hideComplete() {
    if (this.screen === 'complete') {
      this.hide();
      if (!this.game.loop.paused) {
        this.game.input.enabled = true;
        this.game.input.requestLock?.();
      }
    }
  }

  // ---------------------------------------------------------------- settings
  _fillSettings() {
    const s = this.settings;
    const put = (key, value) => {
      const row = this.rows[key];
      if (!row) return;
      if (row.input.type === 'checkbox') row.input.checked = Boolean(value);
      else row.input.value = String(value);
      if (row.value) row.value.textContent = row.format(Number(value));
    };
    put('drawDistance', s.drawDistance);
    put('traffic', s.trafficCount);
    put('pedestrians', s.pedestrianCount);
    put('sensitivity', s.cameraSensitivity);
    put('post', s.postProcessing);
    put('mute', s.muted);
    put('fps', s.showFps);
    const shadows = s.shadowQuality === 'low' ? 'low' : 'off';
    this.shadowButtons.off.classList.toggle('is-on', shadows === 'off');
    this.shadowButtons.low.classList.toggle('is-on', shadows === 'low');
  }

  /** Applies one live control. main.js owns the systems, so every change is also a bus event. */
  _applyLive(key, value) {
    const s = this.settings;
    const game = this.game;
    if (key === 'drawDistance') {
      s.drawDistance = value;
      if (game.camera) {
        game.camera.far = value;
        game.camera.updateProjectionMatrix();
      }
      game.world?.setDrawDistance?.(value);
    } else if (key === 'traffic') {
      s.trafficCount = value;
      game.traffic?.setCount?.(value);
    } else if (key === 'pedestrians') {
      s.pedestrianCount = value;
      game.pedestrians?.setCount?.(value);
    } else if (key === 'sensitivity') {
      s.cameraSensitivity = value;
      if (game.input) game.input.pointerSensitivity = 0.0022 * value;
    } else if (key === 'shadows') {
      s.shadowQuality = value;
      s.shadows = value !== 'off';
      game.renderer.shadowMap.enabled = s.shadows;
      game.renderer.shadowMap.needsUpdate = true;
      game.world?.setShadows?.(s.shadows);
      this._fillSettings();
    } else if (key === 'post') {
      s.postProcessing = Boolean(value);
      document.body.classList.toggle('post-on', s.postProcessing);
    } else if (key === 'mute') {
      s.muted = Boolean(value);
      this.audio?.setMuted(s.muted);
    } else if (key === 'fps') {
      s.showFps = Boolean(value);
      this.perf?.toggle(s.showFps);
    }
    game.bus?.emit('settings:change', { key, value, snapshot: s.snapshot() });
  }

  saveSettings() {
    writeSave({ settings: { ...writeSaveSettings(this.settings) } });
    this.game.bus?.emit('save:write', { reason: 'settings' });
  }

  // ---------------------------------------------------------------- save
  _persist() {
    const snapshot = snapshotGame(this.game);
    snapshot.settings = writeSaveSettings(this.settings);
    writeSave(snapshot);
    this.onSaved?.(snapshot);
    this.game.bus?.emit('save:write', { reason: 'menu', money: snapshot.money });
  }

  /** The per-frame tick: hides the mission card after its wall-clock timeout. */
  update(dt) {
    if (this.completeTimer > 0) {
      this.completeTimer -= dt;
      if (this.completeTimer <= 0) this.hideComplete();
    }
  }
}

/** The settings record written by the save module, kept in one shape. */
function writeSaveSettings(settings) {
  return {
    drawDistance: settings.drawDistance,
    traffic: settings.trafficCount,
    pedestrians: settings.pedestrianCount,
    shadows: settings.shadowQuality,
    post: Boolean(settings.postProcessing),
    sensitivity: settings.cameraSensitivity,
    mute: Boolean(settings.muted),
    showFps: Boolean(settings.showFps),
  };
}

export function createMenus(options) {
  return new MenuUI(options);
}
