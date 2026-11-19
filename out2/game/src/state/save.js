// The entry's save file. One record in localStorage holds everything a player expects to
// find again after closing the tab: the wallet, the missions already finished, the
// settings they chose and the place they were standing. The missions module keeps its own
// older record so a save written before this module existed still loads; both keys are
// read here, and the new record is the one written from now on.
//
// Nothing in here touches the DOM or the WebGL context, so a test can call it directly
// with a stub storage.

const SAVE_KEY = 'solmara.save.v2';
const LEGACY_KEY = 'solmara.save.v1';

/** localStorage can throw (private mode, disabled storage). Every call is guarded. */
function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(key) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The shape every reader can rely on, with sane defaults for a fresh player. */
export function emptySave() {
  return {
    version: 2,
    money: 750,
    completed: [],
    settings: null,
    position: null,
    health: 100,
    armour: 0,
    savedAt: 0,
  };
}

function normalise(payload) {
  const save = { ...emptySave(), ...(payload ?? {}) };
  save.money = Math.max(0, Math.round(Number(save.money) || 0));
  save.completed = Array.isArray(save.completed) ? save.completed.filter((id) => typeof id === 'string') : [];
  save.health = Math.max(0, Math.min(100, Number(save.health) || 100));
  save.armour = Math.max(0, Math.min(100, Number(save.armour) || 0));
  if (save.settings && typeof save.settings !== 'object') save.settings = null;
  if (save.position && !Number.isFinite(Number(save.position.x))) save.position = null;
  return save;
}

/** Reads the newest save, falling back to the missions' older record. */
export function loadSave() {
  const fresh = readJson(SAVE_KEY);
  if (fresh) return normalise(fresh);
  const legacy = readJson(LEGACY_KEY);
  if (!legacy) return null;
  return normalise({
    money: legacy.money,
    completed: legacy.completed,
    health: legacy.health,
    armour: legacy.armour,
    savedAt: legacy.savedAt ?? 0,
  });
}

/** True when Continue has something to continue. */
export function hasSave() {
  return loadSave() !== null;
}

/**
 * Merges a partial snapshot into the record and writes it. A field left out keeps the
 * value already on disk, so the menu can save settings without clobbering the wallet and
 * the mission system can save the wallet without clobbering the position.
 */
export function writeSave(partial = {}) {
  const current = loadSave() ?? emptySave();
  const merged = normalise({ ...current, ...partial, savedAt: Date.now() });
  writeJson(SAVE_KEY, merged);
  return merged;
}

export function clearSave() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
    store.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to do: the game simply keeps the last record.
  }
}

/**
 * Builds the snapshot main.js hands to writeSave every few seconds and whenever the
 * player pauses. Kept a plain function so the game object stays inspectable.
 */
export function snapshotGame(game) {
  const player = game.player;
  const car = game.vehicles?.activeCar;
  return {
    money: Math.round(game.missions?.money ?? 0),
    completed: [...(game.missions?.completed ?? [])],
    health: Math.round(game.combat?.health ?? 100),
    armour: Math.round(game.combat?.armour ?? 0),
    settings: settingsSnapshot(game.settings ?? {}),
    position: {
      x: Number(player?.position.x ?? 0),
      z: Number(player?.position.z ?? 0),
      heading: Number(player?.heading ?? 0),
      car: car ? { type: car.type, paint: car.paint, x: car.x, z: car.z, heading: car.heading } : null,
    },
  };
}

/** Only the player-facing knobs, not the derived render state. */
export function settingsSnapshot(settings) {
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

/**
 * Applies a stored settings record onto the live settings object. Unknown or out-of-range
 * values are ignored, so an old save cannot make the game unplayable.
 */
export function applySettings(save, settings) {
  const values = save?.settings;
  if (!values || !settings.apply) return false;
  return settings.apply(values);
}

/**
 * Restores the player and story from a save. The menu calls this from Continue; Play
 * calls it with reset=true first, so both paths go through one place.
 */
export function restoreGame(save, game) {
  if (!save) return false;
  const { missions, combat, player, vehicles } = game;
  if (missions) {
    missions.money = Math.max(0, Math.round(save.money ?? 750));
    missions.completed = [...(save.completed ?? [])];
  }
  if (combat) {
    combat.health = Math.max(1, Math.min(100, save.health ?? 100));
    combat.armour = Math.max(0, Math.min(100, save.armour ?? 0));
    combat.downKind = null;
    combat.downTimer = 0;
  }
  const position = save.position;
  if (player && position) {
    player.teleport(position.x, position.z, position.heading ?? 0);
    player.character?.rest();
    if (game.cameraRig) {
      game.cameraRig.anchor.x = position.x;
      game.cameraRig.anchor.y = player.position.y + 1.45;
      game.cameraRig.anchor.z = position.z;
      game.cameraRig.yaw = position.heading ?? 0;
      game.cameraRig.timeSinceLook = 0;
    }
    if (position.car && vehicles?.spawnDrivenCar) {
      const spot = vehicles.world.placeOnGround
        ? vehicles.world.placeOnGround(position.car.x, position.car.z)
        : { x: position.car.x, z: position.car.z };
      vehicles.spawnDrivenCar({
        type: position.car.type,
        paint: position.car.paint,
        x: spot.x,
        z: spot.z,
        heading: position.car.heading ?? 0,
      });
    }
  }
  return true;
}

export { SAVE_KEY, LEGACY_KEY };
