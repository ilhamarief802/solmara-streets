// The HUD. Everything is plain DOM over the canvas except the minimap, which is a canvas
// of its own. The layout deliberately avoids the top-left corner (the page's menu button
// lives there in the captures): money, clock and the wanted stars sit top-right; health,
// armour, the weapon chip and the map bottom-left; the mission card bottom-right; one
// centred prompt and one centred crosshair. Text is set only when it changes, the money
// counter ticks up over a few frames, and the minimap redraws at 12 Hz.
//
// `update()` takes a plain snapshot from main.js; nothing in here imports a game system.

import { Minimap } from './minimap.js';

const WEAPON_LABEL = { fists: 'FISTS', pistol: 'PISTOL', shotgun: 'SHOTGUN' };
const STAR_COUNT = 5;
const MAP_HZ = 12;
const TOAST_SECONDS = 3.6;

/** A fallback world for the minimap when the HUD is built before the city. */
const EMPTY_MAP = {
  minimap: {
    bounds: { minX: -920, minZ: -980, maxX: 1280, maxZ: 680 },
    blocks: [],
    roads: [],
    water: [],
    highway: [],
    landmarks: [],
  },
};

/** Formats a countdown as mm:ss. */
function clockText(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(root = document.getElementById('hud-root'), world = null) {
    this.root = root;
    this.world = world;
    this.text = {};
    this.shownMoney = 0;
    this.targetMoney = 0;
    this.minimapClock = 0;
    this.toastTimer = 0;
    this.pulse = 0;
    this.down = null;
    this.minimap = null;
    this.shopItems = null;
    this._moneySeeded = false;
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
    for (let index = 0; index < STAR_COUNT; index += 1) {
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
    this.minimap = new Minimap(world ?? EMPTY_MAP, mapCanvas);

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
    this.crosshairRing = make('i', 'hud-crosshair-ring', this.crosshair);
    this.crosshairDot = make('i', 'hud-crosshair-dot', this.crosshair);

    this.toast = make('div', 'hud-toast');
    this.toast.hidden = true;

    this.downCard = make('div', 'hud-down');
    this.downTitle = make('div', 'hud-down-title', this.downCard, 'WASTED');
    this.downHint = make('div', 'hud-down-hint', this.downCard, 'You wake up at the hospital.');
    this.downCard.hidden = true;

    this.shop = make('div', 'hud-shop');
    this.shop.hidden = true;

    this.hint = make(
      'div',
      'hud-hint',
      root,
      'WASD move · Shift sprint · LMB fight/shoot · 1-3 weapon · R reload · E talk/shop · F car · V camera',
    );

    // Only these nodes are written through set(); everything else is styled in place.
    this.nodes = {
      clock: this.clock,
      district: this.district,
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
    this.set('clock', `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    this.set('district', info.districtName ?? 'Solmara');
    this.set('mapLabel', info.districtName ?? 'Solmara');

    // Money: the number slides to its target in frame(), so a reward counts up.
    this.targetMoney = Math.max(0, Math.round(info.money ?? 0));
    if (!this._moneySeeded) {
      // The first snapshot is the truth; after that every change is animated.
      this._moneySeeded = true;
      this.shownMoney = this.targetMoney;
      this.moneyValue.textContent = this.targetMoney.toLocaleString('en-US');
    }

    this.updateWanted(info.wanted ?? 0);
    this.updateVitals(info.health ?? 100, info.armour ?? 0);
    this.updateWeapon(info.weapon, info);
    this.updateMotion(info);
    this.updateMission(info.mission);
    this.updatePrompt(info.prompt ?? '');
    this.updateDown(info.down ?? null);
  }

  updateWanted(value) {
    const wanted = Math.max(0, Math.min(STAR_COUNT, Math.round(value)));
    if (wanted === this.text.wanted) return;
    this.text.wanted = wanted;
    for (let index = 0; index < this.starNodes.length; index += 1) {
      this.starNodes[index].classList.toggle('is-on', index < wanted);
      // Four stars and up, the lit stars glow hotter.
      this.starNodes[index].classList.toggle('is-hot', index < wanted && wanted >= 4);
    }
    this.stars.classList.toggle('is-active', wanted > 0);
    this.wantedLabel.classList.toggle('is-active', wanted > 0);
  }

  updateVitals(healthValue, armourValue) {
    const health = Math.max(0, Math.min(100, Math.round(healthValue)));
    const armour = Math.max(0, Math.min(100, Math.round(armourValue)));
    this.healthFill.style.width = `${health}%`;
    this.armourFill.style.width = `${armour}%`;
    this.healthBar.classList.toggle('is-low', health <= 30);
    this.armourRow.classList.toggle('is-empty', armour <= 0);
  }

  updateWeapon(weapon, info) {
    const current = weapon ?? { id: 'fists', clip: 0, reserve: 0 };
    const armed = current.id !== 'fists';
    this.set('weaponName', WEAPON_LABEL[current.id] ?? String(current.id ?? 'FISTS').toUpperCase());
    this.set('weaponAmmo', armed ? `${current.clip ?? 0} / ${current.reserve ?? 0}` : 'MELEE');
    this.weaponAmmo.classList.toggle('is-empty', armed && (current.clip ?? 0) <= 0);
    this.crosshair.hidden = !armed || Boolean(info.down);
    this.crosshair.classList.toggle('is-shotgun', current.id === 'shotgun');
    this.crosshair.classList.toggle('is-firing', Boolean(info.firing));
  }

  updateMotion(info) {
    const driving = info.mode === 'driving';
    this.set('mode', driving ? `DRIVING · ${(info.vehicle ?? 'CAR').toUpperCase()}` : 'ON FOOT');
    this.set('speed', String(Math.round(driving ? info.speed ?? 0 : 0)));
    this.speedValue.classList.toggle('is-driving', driving);
    this.modeLabel.classList.toggle('is-driving', driving);
  }

  updateMission(mission) {
    this.missionCard.hidden = !mission;
    if (!mission) return;

    this.set('missionTitle', mission.title ?? 'MISSION');
    this.set('missionText', mission.text ?? '');
    const hasTimer = mission.timer !== null && mission.timer !== undefined;
    const parts = [];
    if (mission.step && mission.total) parts.push(`STEP ${mission.step}/${mission.total}`);
    if (hasTimer) {
      parts.push(clockText(mission.timer));
      this.missionBarFill.style.width = `${Math.max(0, Math.min(100, mission.timerFraction * 100))}%`;
    }
    if (mission.hint) parts.push(mission.hint);
    this.set('missionMeta', parts.join('   '));
    this.missionBar.hidden = !hasTimer;
  }

  updatePrompt(prompt) {
    if (prompt === this.text.prompt) return;
    this.text.prompt = prompt;
    this.prompt.textContent = prompt;
    this.prompt.hidden = !prompt;
  }

  updateDown(down) {
    if (down === this.down) return;
    this.down = down;
    this.downCard.hidden = !down;
    if (down) {
      this.downTitle.textContent = down === 'busted' ? 'BUSTED' : 'WASTED';
      this.downTitle.classList.toggle('is-busted', down === 'busted');
      this.downHint.textContent =
        down === 'busted' ? 'The precinct lets you out at the station.' : 'You wake up at the hospital.';
    }
    this.root.classList.toggle('is-down', Boolean(down));
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

    if (this.minimapClock >= 1 / MAP_HZ && mapData) {
      this.minimapClock = 0;
      this.minimap.pulse = this.pulse;
      this.minimap.draw({
        ...mapData,
        x: mapData.x ?? 0,
        z: mapData.z ?? 0,
        heading: mapData.heading ?? 0,
        centre: true,
      });
    }
  }

  /** A short-lived line across the lower middle, for rewards and mission beats. */
  notify(text, kind = 'info') {
    if (!this.root) return;
    this.toast.textContent = text;
    this.toast.className = `hud-toast is-${kind}`;
    this.toast.hidden = false;
    this.toastTimer = TOAST_SECONDS;
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
      row.className = item.affordable ? 'hud-shop-row' : 'hud-shop-row is-poor';
      // Built from nodes rather than an innerHTML template: the labels are data.
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = item.key;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.label;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = `$${item.price}`;
      row.append(key, label, price);
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
