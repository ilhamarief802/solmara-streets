// The HUD. Everything is plain DOM over the canvas except the minimap, which is a
// canvas of its own. The layout deliberately avoids the top-left corner (the page's menu
// button lives there in the captures): money, clock and the wanted stars sit top-right;
// health, armour, the weapon chip and the map bottom-left; the mission card bottom-right;
// one centred prompt and one centred crosshair. Text is set only when it changes, the
// money counter ticks up over a few frames, and the minimap redraws at 12 Hz.
//
// `update()` takes a plain snapshot from main.js; nothing in here imports a game system.

import { Minimap } from './minimap.js';

const WEAPON_LABEL = { fists: 'FISTS', pistol: 'PISTOL', shotgun: 'SHOTGUN' };

export class Hud {
  constructor(root = document.getElementById('hud-root'), world = null) {
    this.root = root;
    this.world = world;
    this.text = {};
    this.money = 0;
    this.shownMoney = 0;
    this.targetMoney = 0;
    this.minimapClock = 0;
    this.toastTimer = 0;
    this.pulse = 0;
    this.down = null;
    this.minimap = null;
    this.shopItems = null;
    if (!root) return;
    root.innerHTML = '';
    root.classList.add('hud');

    const make = (tag, className, parent = root, text = null) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== null) node.textContent = text;
      parent.append(node);
      return node;
    };

    // ------------------------------------------------------------ top right
    this.topRight = make('div', 'hud-topright');
    const clockLine = make('div', 'hud-clockline', this.topRight);
    this.clock = make('span', 'hud-clock', clockLine, '18:00');
    this.district = make('span', 'hud-district', clockLine, 'Downtown Core');
    this.moneyWrap = make('div', 'hud-money', this.topRight);
    make('span', 'hud-money-sign', this.moneyWrap, '$');
    this.moneyValue = make('span', 'hud-money-value', this.moneyWrap, '0');
    this.stars = make('div', 'hud-stars', this.topRight);
    this.starNodes = [];
    for (let index = 0; index < 5; index += 1) {
      this.starNodes.push(make('span', 'hud-star', this.stars, '★'));
    }
    this.wantedLabel = make('div', 'hud-wanted-label', this.topRight, 'WANTED');

    // ------------------------------------------------------------ bottom left
    this.bottomLeft = make('div', 'hud-bottomleft');
    this.vitals = make('div', 'hud-vitals', this.bottomLeft);
    this.healthRow = make('div', 'hud-vital', this.vitals);
    make('span', 'hud-vital-label', this.healthRow, 'HP');
    this.healthBar = make('div', 'hud-vital-bar', this.healthRow);
    this.healthFill = make('i', 'hud-vital-fill health', this.healthBar);
    this.armourRow = make('div', 'hud-vital', this.vitals);
    make('span', 'hud-vital-label', this.armourRow, 'AR');
    this.armourBar = make('div', 'hud-vital-bar', this.armourRow);
    this.armourFill = make('i', 'hud-vital-fill armour', this.armourBar);
    this.mapRow = make('div', 'hud-map-row', this.bottomLeft);
    this.mapWrap = make('div', 'hud-map-wrap', this.mapRow);
    const mapCanvas = document.createElement('canvas');
    mapCanvas.className = 'hud-minimap';
    mapCanvas.width = 184;
    mapCanvas.height = 184;
    this.mapWrap.append(mapCanvas);
    this.mapLabel = make('div', 'hud-map-label', this.mapWrap, '');
    const side = make('div', 'hud-map-side', this.mapRow);
    this.weaponName = make('div', 'hud-weapon-name', side, 'FISTS');
    this.weaponAmmo = make('div', 'hud-weapon-ammo', side, '');
    this.speedValue = make('div', 'hud-speed-value', side, '0');
    this.speedUnit = make('div', 'hud-speed-unit', side, 'KM/H');
    this.modeLabel = make('div', 'hud-mode-label', side, 'ON FOOT');
    this.minimap = new Minimap(
      world ?? { minimap: { bounds: { minX: -920, minZ: -980, maxX: 1280, maxZ: 680 }, blocks: [], roads: [], water: [], highway: [], landmarks: [] } },
      mapCanvas,
    );

    // ------------------------------------------------------------ mission card
    this.missionCard = make('div', 'hud-mission');
    this.missionTitle = make('div', 'hud-mission-title', this.missionCard, '');
    this.missionText = make('div', 'hud-mission-text', this.missionCard, '');
    this.missionMeta = make('div', 'hud-mission-meta', this.missionCard, '');
    this.missionBar = make('div', 'hud-mission-bar', this.missionCard);
    this.missionBarFill = make('i', 'hud-mission-bar-fill', this.missionBar);
    this.missionCard.hidden = true;

    // ------------------------------------------------------------ centre + prompt
    this.prompt = make('div', 'hud-prompt');
    this.prompt.hidden = true;
    this.crosshair = make('div', 'hud-crosshair');
    this.crosshair.hidden = true;
    const ring = make('i', 'hud-crosshair-ring', this.crosshair);
    const dot = make('i', 'hud-crosshair-dot', this.crosshair);
    this.crosshairRing = ring;
    this.crosshairDot = dot;

    this.toast = make('div', 'hud-toast');
    this.toast.hidden = true;

    this.downCard = make('div', 'hud-down');
    this.downTitle = make('div', 'hud-down-title', this.downCard, 'WASTED');
    this.downHint = make('div', 'hud-down-hint', this.downCard, 'You wake up at the hospital.');
    this.downCard.hidden = true;

    this.shop = make('div', 'hud-shop');
    this.shop.hidden = true;

    this.hint = make('div', 'hud-hint', root, 'WASD move · Shift sprint · LMB fight/shoot · 1-3 weapon · R reload · E talk/shop · F car · V camera');

    this.nodes = {
      clock: this.clock,
      district: this.district,
      money: this.moneyValue,
      mapLabel: this.mapLabel,
      weaponName: this.weaponName,
      weaponAmmo: this.weaponAmmo,
      speed: this.speedValue,
      mode: this.modeLabel,
      missionTitle: this.missionTitle,
      missionText: this.missionText,
      missionMeta: this.missionMeta,
    };
  }

  /** Sets a text node only when its value changed. */
  set(key, value) {
    if (this.text[key] === value) return;
    this.text[key] = value;
    const node = this.nodes[key];
    if (node) node.textContent = value;
  }

  /** Called around six times a second with the play-state snapshot. */
  update(info = {}) {
    if (!this.root) return;
    const minutes = Math.floor((info.hour ?? 0) * 60);
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    this.set('clock', `${hh}:${mm}`);
    this.set('district', info.districtName ?? 'Solmara');
    this.set('mapLabel', info.districtName ?? 'Solmara');

    // Money: the number slides to its target in tick(), so a reward counts up.
    this.targetMoney = Math.max(0, Math.round(info.money ?? 0));
    if (this.shownMoney === 0 && !this._moneySeeded) {
      this._moneySeeded = true;
      this.shownMoney = this.targetMoney;
      this.moneyValue.textContent = this.targetMoney.toLocaleString('en-US');
    }

    // Wanted stars.
    const wanted = Math.max(0, Math.min(5, Math.round(info.wanted ?? 0)));
    if (wanted !== this.text.wanted) {
      this.text.wanted = wanted;
      for (let index = 0; index < this.starNodes.length; index += 1) {
        this.starNodes[index].classList.toggle('is-on', index < wanted);
        this.starNodes[index].classList.toggle('is-hot', index < wanted && wanted >= 4);
      }
      this.stars.classList.toggle('is-active', wanted > 0);
      this.wantedLabel.classList.toggle('is-active', wanted > 0);
    }

    // Vitals.
    const health = Math.max(0, Math.min(100, Math.round(info.health ?? 100)));
    const armour = Math.max(0, Math.min(100, Math.round(info.armour ?? 0)));
    this.healthFill.style.width = `${health}%`;
    this.armourFill.style.width = `${armour}%`;
    this.healthBar.classList.toggle('is-low', health <= 30);
    this.armourRow.classList.toggle('is-empty', armour <= 0);

    // Weapon chip.
    const weapon = info.weapon ?? { id: 'fists', clip: 0, reserve: 0 };
    const armed = weapon.id !== 'fists';
    this.set('weaponName', WEAPON_LABEL[weapon.id] ?? String(weapon.id ?? 'FISTS').toUpperCase());
    this.set('weaponAmmo', armed ? `${weapon.clip ?? 0} / ${weapon.reserve ?? 0}` : 'MELEE');
    this.weaponAmmo.classList.toggle('is-empty', armed && (weapon.clip ?? 0) <= 0);
    this.crosshair.hidden = !armed || Boolean(info.down);
    this.crosshair.classList.toggle('is-shotgun', weapon.id === 'shotgun');
    this.crosshair.classList.toggle('is-firing', Boolean(info.firing));

    // Speed and mode.
    const driving = info.mode === 'driving';
    this.set('mode', driving ? `DRIVING · ${(info.vehicle ?? 'CAR').toUpperCase()}` : 'ON FOOT');
    this.set('speed', String(Math.round(driving ? info.speed ?? 0 : 0)));
    this.speedValue.classList.toggle('is-driving', driving);
    this.modeLabel.classList.toggle('is-driving', driving);

    // Mission card.
    const mission = info.mission;
    this.missionCard.hidden = !mission;
    if (mission) {
      this.set('missionTitle', mission.title ?? 'MISSION');
      this.set('missionText', mission.text ?? '');
      const parts = [];
      if (mission.step && mission.total) parts.push(`STEP ${mission.step}/${mission.total}`);
      if (mission.timer !== null && mission.timer !== undefined) {
        const seconds = Math.max(0, Math.ceil(mission.timer));
        parts.push(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
        this.missionBarFill.style.width = `${Math.max(0, Math.min(100, mission.timerFraction * 100))}%`;
      }
      if (mission.hint) parts.push(mission.hint);
      this.set('missionMeta', parts.join('   '));
      this.missionBar.hidden = mission.timer === null || mission.timer === undefined;
    }

    // Prompt.
    const prompt = info.prompt ?? '';
    if (prompt !== this.text.prompt) {
      this.text.prompt = prompt;
      this.prompt.textContent = prompt;
      this.prompt.hidden = !prompt;
    }

    // Down state.
    if (info.down !== this.down) {
      this.down = info.down ?? null;
      this.downCard.hidden = !this.down;
      if (this.down) {
        this.downTitle.textContent = this.down === 'busted' ? 'BUSTED' : 'WASTED';
        this.downTitle.classList.toggle('is-busted', this.down === 'busted');
        this.downHint.textContent =
          this.down === 'busted' ? 'The precinct lets you out at the station.' : 'You wake up at the hospital.';
      }
      this.root.classList.toggle('is-down', Boolean(this.down));
    }
  }

  /** Per-render: animate the money count and redraw the map at 12 Hz. */
  frame(dt, mapData = null) {
    if (!this.root) return;
    this.pulse += dt;
    this.minimapClock += dt;
    if (this.shownMoney !== this.targetMoney) {
      const difference = this.targetMoney - this.shownMoney;
      const step = Math.max(1, Math.abs(difference) * Math.min(1, dt * 7));
      this.shownMoney += Math.sign(difference) * Math.min(Math.abs(difference), step);
      if (Math.abs(this.targetMoney - this.shownMoney) < 1) this.shownMoney = this.targetMoney;
      this.moneyValue.textContent = Math.round(this.shownMoney).toLocaleString('en-US');
      this.moneyValue.classList.toggle('is-rising', difference > 0);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.hidden = true;
    }
    if (this.minimapClock >= 1 / 12 && mapData) {
      this.minimapClock = 0;
      this.minimap.pulse = this.pulse;
      this.minimap.draw({ ...mapData, x: mapData.x ?? 0, z: mapData.z ?? 0, heading: mapData.heading ?? 0, centre: true });
    }
  }

  /** A short-lived line across the lower middle, for rewards and mission beats. */
  notify(text, kind = 'info') {
    if (!this.root) return;
    this.toast.textContent = text;
    this.toast.className = `hud-toast is-${kind}`;
    this.toast.hidden = false;
    this.toastTimer = 3.6;
  }

  /** The shop: an item list with key hints, or null to close. */
  showShop(items) {
    if (!this.root) return;
    this.shopItems = items;
    if (!items) {
      this.shop.hidden = true;
      return;
    }
    this.shop.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'hud-shop-title';
    title.textContent = 'SOLMARA MOTORS · 24H';
    this.shop.append(title);
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'hud-shop-row';
      if (!item.affordable) row.classList.add('is-poor');
      row.innerHTML = `<span class="key">${item.key}</span><span class="label">${item.label}</span><span class="price">$${item.price}</span>`;
      this.shop.append(row);
    }
    const foot = document.createElement('div');
    foot.className = 'hud-shop-foot';
    foot.textContent = 'E or Esc to walk away';
    this.shop.append(foot);
    this.shop.hidden = false;
  }

  /** The list the minimap draws: markers from the mission system, dots from the world. */
  drawMap(mapData) {
    if (!this.root) return;
    this.minimap.draw(mapData);
  }
}

export function createHud(world = null) {
  return new Hud(undefined, world);
}
