// The front end: a start screen over the paused city, an Escape pause menu, the settings
// panel every other screen shares, and the two story cards (wasted/busted, mission
// complete). It is plain DOM above the canvas, so it works before pointer lock, without the
// WebGL context and with a mouse or the arrow keys: every button is reachable by Tab, Enter,
// and Escape returns one screen, never to a dead end.
//
// The menu never simulates the game. It pauses the loop, lets the last frame stay on the
// canvas behind a scrim, and resumes when the player chooses. The shot rig hides it.

import {
  hasSave,
  loadSave,
  writeSave,
  snapshotGame,
  restoreGame,
  clearSave,
  settingsSnapshot,
} from '../state/save.js';

const SCREENS = ['start', 'pause', 'settings', 'credits', 'end', 'complete'];
/** How long the mission-complete card stays up before it closes itself. */
const COMPLETE_SECONDS = 4.8;

export class MenuUI {
  constructor({ game, settings, audio = null, perf = null, onSaved = null }) {
    this.game = game;
    this.settings = settings;
    this.audio = audio;
    this.perf = perf;
    this.onSaved = onSaved;
    this.screen = null;
    this.root = null;
    this.settingsFrom = 'start';
    this.completeTimer = 0;
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

    const card = (parent, className) => {
      const node = document.createElement('div');
      node.className = `menu-card ${className}`;
      parent.append(node);
      return node;
    };

    const text = (tag, className, parent, content) => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = content;
      parent.append(node);
      return node;
    };

    const button = (parent, label, action, kind = '') => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `menu-button ${kind}`.trim();
      node.textContent = label;
      node.addEventListener('click', () => {
        // Every click plays the UI tick, whether or not it changes screen.
        this.click();
        action();
      });
      parent.append(node);
      return node;
    };

    const buttonRow = (parent) => {
      const row = document.createElement('div');
      row.className = 'menu-buttons';
      parent.append(row);
      return row;
    };

    // ------------------------------------------------------------ start
    const startCard = card(screen('start'), 'menu-card-start');
    text('div', 'menu-mark', startCard, 'SOLMARA');
    text('h1', 'menu-title', startCard, 'STREETS');
    text(
      'p',
      'menu-subtitle',
      startCard,
      'A sun-soaked coastal city. One stolen coupe. Three hundred days of summer.',
    );
    const startButtons = buttonRow(startCard);
    this.playButton = button(startButtons, 'Play', () => this.startNew());
    this.continueButton = button(startButtons, 'Continue', () => this.continueGame());
    button(startButtons, 'Settings', () => this.openSettings('start'));
    button(startButtons, 'Credits', () => this.show('credits'));
    // Continue is only live when there is a record to restore.
    this.continueButton.disabled = !hasSave();
    text('p', 'menu-keyline', startCard, 'WASD walk · Shift sprint · E talk · F steal · LMB fight · V camera · Esc pause');

    // ------------------------------------------------------------ pause
    const pauseCard = card(screen('pause'), 'menu-card-pause');
    text('div', 'menu-eyebrow', pauseCard, 'PAUSED');
    text('h2', 'menu-title-sm', pauseCard, 'Solmara can wait.');
    const pauseButtons = buttonRow(pauseCard);
    button(pauseButtons, 'Resume', () => this.resume());
    button(pauseButtons, 'Settings', () => this.openSettings('pause'));
    button(pauseButtons, 'Quit to menu', () => this.quitToMenu());
    text('p', 'menu-keyline', pauseCard, 'Esc resumes · progress saves when you pause');

    // ------------------------------------------------------------ settings
    const settingsCard = card(screen('settings'), 'menu-card-settings');
    text('h2', 'menu-title-sm', settingsCard, 'SETTINGS');
    const grid = document.createElement('div');
    grid.className = 'menu-settings';
    settingsCard.append(grid);
    // One record per control, so fillSettings can write the current values back into them.
    this.rows = {};

    const row = (label, hint = null) => {
      const line = document.createElement('label');
      line.className = 'menu-setting';
      text('span', 'menu-setting-label', line, label);
      if (hint) text('span', 'menu-setting-hint', line, hint);
      grid.append(line);
      return line;
    };

    const control = (line) => {
      const wrap = document.createElement('span');
      wrap.className = 'menu-setting-control';
      line.append(wrap);
      return wrap;
    };

    const slider = (key, label, min, max, step, format) => {
      const line = row(label);
      const wrap = control(line);
      const output = document.createElement('output');
      output.className = 'menu-setting-value';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.className = 'menu-slider';
      input.dataset.setting = key;
      // Dragging applies live; letting go writes the save.
      input.addEventListener('input', () => {
        output.textContent = format(Number(input.value));
        this.applyLive(key, Number(input.value));
      });
      input.addEventListener('change', () => this.saveSettings());
      wrap.append(input, output);
      this.rows[key] = { input, value: output, format };
      return input;
    };

    const toggle = (key, label, onChange = null) => {
      const line = row(label);
      const wrap = control(line);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'menu-toggle';
      input.dataset.setting = key;
      input.addEventListener('change', () => {
        this.click();
        onChange?.(input.checked);
        this.applyLive(key, input.checked);
        this.saveSettings();
      });
      wrap.append(input);
      this.rows[key] = { input, format: (value) => (value ? 'on' : 'off') };
      return input;
    };

    slider('drawDistance', 'Draw distance', 1200, 4500, 100, (v) => `${(v / 1000).toFixed(1)} km`);
    slider('traffic', 'Traffic', 0, 48, 1, (v) => `${v} cars`);
    slider('pedestrians', 'Pedestrians', 0, 48, 1, (v) => `${v} people`);
    slider('sensitivity', 'Camera sensitivity', 0.55, 2.4, 0.05, (v) => `${v.toFixed(2)}×`);

    // Shadow quality is a two-state segmented control rather than a checkbox.
    const shadowLine = row('Shadow quality');
    const shadowWrap = control(shadowLine);
    shadowWrap.classList.add('menu-segmented');
    const shadowOff = document.createElement('button');
    shadowOff.type = 'button';
    shadowOff.textContent = 'Off';
    const shadowLow = document.createElement('button');
    shadowLow.type = 'button';
    shadowLow.textContent = 'Low';
    shadowWrap.append(shadowOff, shadowLow);
    this.shadowButtons = { off: shadowOff, low: shadowLow };
    for (const [node, value] of [[shadowOff, 'off'], [shadowLow, 'low']]) {
      node.addEventListener('click', () => {
        this.click();
        this.applyLive('shadows', value);
        this.saveSettings();
      });
    }

    toggle('post', 'Post processing');
    toggle('mute', 'Mute all audio', (muted) => this.audio?.setMuted(muted));
    toggle('fps', 'Show frame rate', (shown) => this.perf?.toggle(shown));

    const settingsButtons = document.createElement('div');
    settingsButtons.className = 'menu-buttons menu-buttons-row';
    settingsCard.append(settingsButtons);
    button(settingsButtons, 'Back', () => this.closeSettings(), 'is-quiet');
    text('p', 'menu-keyline', settingsCard, 'Changes apply at once; Back keeps them and writes the save.');

    // ------------------------------------------------------------ credits
    const creditsCard = card(screen('credits'), 'menu-card-start');
    text('div', 'menu-eyebrow', creditsCard, 'CREDITS');
    text('h2', 'menu-title-sm', creditsCard, 'SOLMARA STREETS');
    const creditsText = document.createElement('div');
    creditsText.className = 'menu-credits';
    for (const [line, className] of [
      ['An open-city entry for make.fun gta6-01.', null],
      [
        'Built with three.js, one canvas and no downloaded assets: every road, tower, palm, engine tone and chord is generated in the browser.',
        null,
      ],
      ['City, driving, traffic, crowd, fighting, police and story by the Solmara build sessions.', null],
      ['Sound is Web Audio only. Music is a procedural loop that follows the district and the hour.', 'menu-dim'],
    ]) {
      text('p', className ?? '', creditsText, line);
    }
    creditsCard.append(creditsText);
    const creditsButtons = document.createElement('div');
    creditsButtons.className = 'menu-buttons menu-buttons-row';
    creditsCard.append(creditsButtons);
    button(creditsButtons, 'Back', () => this.closeCredits(), 'is-quiet');

    // ------------------------------------------------------------ wasted / busted
    const endCard = card(screen('end'), 'menu-card-end');
    this.endTitle = text('div', 'menu-end-title', endCard, 'WASTED');
    this.endText = text('p', 'menu-subtitle', endCard, 'You wake up at the hospital.');
    const endButtons = document.createElement('div');
    endButtons.className = 'menu-buttons menu-buttons-row';
    endCard.append(endButtons);
    button(endButtons, 'Continue', () => this.continueAfterDown(), 'is-hot');
    button(endButtons, 'Quit to menu', () => this.quitToMenu(), 'is-quiet');

    // ------------------------------------------------------------ mission complete
    const completeCard = card(screen('complete'), 'menu-card-complete');
    text('div', 'menu-eyebrow is-gold', completeCard, 'MISSION COMPLETE');
    this.completeTitle = text('h2', 'menu-title-sm', completeCard, '');
    this.completeText = text('p', 'menu-subtitle', completeCard, '');
    const completeButtons = document.createElement('div');
    completeButtons.className = 'menu-buttons menu-buttons-row';
    completeCard.append(completeButtons);
    button(completeButtons, 'Keep driving', () => this.hideComplete(), 'is-hot');
  }

  // ---------------------------------------------------------------- wiring
  _bindKeys() {
    window.addEventListener('keydown', (event) => {
      // A shot owns the keyboard; the menus stay out of it entirely.
      if (this.game?.settings?.shot || this.game?.shots?.active) return;
      if (event.code === 'Escape') this.handleEscape(event);
      if (this.screen === 'pause' && event.code === 'KeyP') {
        event.preventDefault();
        this.resume();
      }
      // Arrow keys walk the visible buttons, top to bottom.
      if (this.screen && (event.code === 'ArrowDown' || event.code === 'ArrowUp')) {
        event.preventDefault();
        this.moveFocus(event.code === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  /** Escape goes back one screen, and never leaves the player stuck. */
  handleEscape(event) {
    event.preventDefault();
    switch (this.screen) {
      case 'settings':
        this.closeSettings();
        return;
      case 'credits':
        this.closeCredits();
        return;
      case 'start':
        // A dead end would be a bug: Escape on the title starts the saved or the new game.
        if (!this.continueButton.disabled) this.continueGame();
        else this.startNew();
        return;
      case 'pause':
        this.resume();
        return;
      case 'end':
        this.continueAfterDown();
        return;
      case 'complete':
        this.hideComplete();
        return;
      default:
        // Escape in the street opens the pause menu.
        this.pause();
    }
  }

  moveFocus(direction) {
    // Only the buttons on the screen actually showing are focusable.
    const buttons = [...this.root.querySelectorAll('button:not([disabled])')].filter((node) => node.offsetParent !== null);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    const next =
      index === -1 ? (direction > 0 ? 0 : buttons.length - 1) : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  _bindEvents() {
    const bus = this.game?.bus;
    if (!bus) return;
    bus.on('player:down', ({ kind }) => this.showEnd(kind));
    bus.on('player:respawn', () => this.hideEnd());
    bus.on('mission:complete', (payload) => this.showComplete(payload));
    // The settings screen can ask for the readout before the menu is ever opened.
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
    // Focus only if this screen is still the one on show when the timer fires.
    if (first) {
      setTimeout(() => {
        if (this.screen === name) first.focus({ preventScroll: true });
      }, 30);
    }
  }

  hide() {
    for (const key of SCREENS) this.screens[key].hidden = true;
    this.root.hidden = true;
    this.screen = null;
    delete document.body.dataset.menu;
  }

  /** Called once at boot: the title over the paused world. */
  boot() {
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    // A save may have appeared since the menu was built.
    this.continueButton.disabled = !hasSave();
    this.show('start');
  }

  startNew() {
    clearSave();
    const { game } = this;

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

    // The same pavement the boot spawn uses, so Play and the first frame agree.
    const spawn = game.world.spawnById('downtown-boulevard') ?? { x: 340, z: 80, heading: 0 };
    game.player.teleport(spawn.x - 10.8, spawn.z - 20, 0);
    game.player.character?.rest();
    if (game.cameraRig) {
      game.cameraRig.anchor.x = game.player.position.x;
      game.cameraRig.anchor.z = game.player.position.z;
      game.cameraRig.yaw = 0;
    }

    this.resume();
    game.hud?.notify('Solmara is yours. Press E at Rosa to start.', 'info');
    this.persist();
  }

  continueGame() {
    const save = loadSave();
    if (!save) {
      // Nothing to continue: treat it as Play rather than doing nothing.
      this.startNew();
      return;
    }
    restoreGame(save, this.game);
    this.resume();
    this.game.hud?.notify(`Welcome back · $${save.money.toLocaleString('en-US')}`, 'reward');
  }

  pause() {
    // A downed player gets the wasted card, not the pause menu.
    if (this.screen || this.game.combat?.isDown) return;
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    this.game.input.releaseLock?.();
    this.persist();
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
    this.persist();
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    this.game.input.releaseLock?.();
    // The save has just been written, so Continue is now live.
    this.continueButton.disabled = !hasSave();
    this.show('start');
  }

  openSettings(from) {
    this.settingsFrom = from;
    this.fillSettings();
    this.show('settings');
  }

  closeSettings() {
    this.saveSettings();
    this.show(this.settingsFrom === 'pause' ? 'pause' : 'start');
  }

  closeCredits() {
    this.show('start');
  }

  showEnd(kind) {
    this.game.loop.setPaused(true);
    this.game.input.enabled = false;
    // Let go of pointer lock, or the cursor cannot reach the two buttons below.
    this.game.input.releaseLock?.();
    const busted = kind === 'busted';
    this.endTitle.textContent = busted ? 'BUSTED' : 'WASTED';
    this.endTitle.classList.toggle('is-busted', busted);
    this.endText.textContent = busted ? 'The precinct lets you out at the station.' : 'You wake up at the hospital.';
    this.show('end');
  }

  hideEnd() {
    if (this.screen !== 'end') return;
    this.hide();
    this.game.loop.setPaused(false);
    this.game.input.enabled = true;
  }

  continueAfterDown() {
    // The respawn puts the body back on a pavement; the card is already answering it.
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
    this.completeTimer = COMPLETE_SECONDS;
    this.persist();
  }

  hideComplete() {
    if (this.screen !== 'complete') return;
    this.hide();
    // Only take the pointer back if the game is not paused behind the card.
    if (!this.game.loop.paused) {
      this.game.input.enabled = true;
      this.game.input.requestLock?.();
    }
  }

  // ---------------------------------------------------------------- settings
  fillSettings() {
    const settings = this.settings;
    const put = (key, value) => {
      const row = this.rows[key];
      if (!row) return;
      if (row.input.type === 'checkbox') row.input.checked = Boolean(value);
      else row.input.value = String(value);
      if (row.value) row.value.textContent = row.format(Number(value));
    };

    put('drawDistance', settings.drawDistance);
    put('traffic', settings.trafficCount);
    put('pedestrians', settings.pedestrianCount);
    put('sensitivity', settings.cameraSensitivity);
    put('post', settings.postProcessing);
    put('mute', settings.muted);
    put('fps', settings.showFps);

    const shadows = settings.shadowQuality === 'low' ? 'low' : 'off';
    this.shadowButtons.off.classList.toggle('is-on', shadows === 'off');
    this.shadowButtons.low.classList.toggle('is-on', shadows === 'low');
  }

  /** Applies one live control. main.js owns the systems, so every change is a bus event. */
  applyLive(key, value) {
    const settings = this.settings;
    const { game } = this;

    switch (key) {
      case 'drawDistance':
        settings.drawDistance = value;
        if (game.camera) {
          game.camera.far = value;
          game.camera.updateProjectionMatrix();
        }
        game.world?.setDrawDistance?.(value);
        break;
      case 'traffic':
        settings.trafficCount = value;
        game.traffic?.setCount?.(value);
        break;
      case 'pedestrians':
        settings.pedestrianCount = value;
        game.pedestrians?.setCount?.(value);
        break;
      case 'sensitivity':
        settings.cameraSensitivity = value;
        if (game.input) game.input.pointerSensitivity = 0.0022 * value;
        break;
      case 'shadows':
        settings.shadowQuality = value;
        settings.shadows = value !== 'off';
        game.renderer.shadowMap.enabled = settings.shadows;
        game.renderer.shadowMap.needsUpdate = true;
        game.world?.setShadows?.(settings.shadows);
        // Redraw the segmented control so the choice shows.
        this.fillSettings();
        break;
      case 'post':
        settings.postProcessing = Boolean(value);
        document.body.classList.toggle('post-on', settings.postProcessing);
        break;
      case 'mute':
        settings.muted = Boolean(value);
        this.audio?.setMuted(settings.muted);
        break;
      case 'fps':
        settings.showFps = Boolean(value);
        this.perf?.toggle(settings.showFps);
        break;
      default:
        return;
    }
    game.bus?.emit('settings:change', { key, value, snapshot: settings.snapshot() });
  }

  saveSettings() {
    writeSave({ settings: settingsSnapshot(this.settings) });
    this.game.bus?.emit('save:write', { reason: 'settings' });
  }

  // ---------------------------------------------------------------- save
  persist() {
    const snapshot = snapshotGame(this.game);
    snapshot.settings = settingsSnapshot(this.settings);
    writeSave(snapshot);
    this.onSaved?.(snapshot);
    this.game.bus?.emit('save:write', { reason: 'menu', money: snapshot.money });
  }

  /** The per-frame tick: hides the mission card after its wall-clock timeout. */
  update(dt) {
    if (this.completeTimer <= 0) return;
    this.completeTimer -= dt;
    if (this.completeTimer <= 0) this.hideComplete();
  }
}

export function createMenus(options) {
  return new MenuUI(options);
}
