// Keyboard and mouse, including pointer lock. The debug camera of this phase and
// the player controller of the next one both read actions from here, so the binding
// table lives in one place.

import { EventBus } from './events.js';

/** Action name -> the KeyboardEvent.code values that trigger it. */
export const BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['Space', 'KeyR'],
  down: ['KeyC', 'ControlLeft'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  boost: ['KeyE'],
  slow: ['AltLeft'],
  pause: ['KeyP', 'Escape'],
  debug: ['F3', 'Backquote'],
  cycleShot: ['KeyN'],
  toggleShadows: ['KeyL'],
  nextWeather: ['KeyK'],
  faster: ['BracketRight'],
  slower: ['BracketLeft'],
});

/** Codes the page swallows so the browser does not scroll or follow a shortcut. */
const SWALLOWED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'F3',
  'Tab',
]);

export class Input {
  constructor(options = {}) {
    this.element = options.element ?? document.body;
    this.bus = new EventBus('input');
    this.sensitivity = options.sensitivity ?? 0.0022;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.actions = {};
    this.mouse = { dx: 0, dy: 0, x: 0, y: 0, wheel: 0, left: false, right: false, middle: false };
    this.pointerLocked = false;
    this.enabled = true;
    this._frameActions = new Set();

    for (const name of Object.keys(BINDINGS)) this.actions[name] = false;

    this._onKeyDown = (event) => this.handleKeyDown(event);
    this._onKeyUp = (event) => this.handleKeyUp(event);
    this._onMouseMove = (event) => this.handleMouseMove(event);
    this._onMouseDown = (event) => this.handleMouseButton(event, true);
    this._onMouseUp = (event) => this.handleMouseButton(event, false);
    this._onWheel = (event) => {
      this.mouse.wheel += event.deltaY;
    };
    this._onContextMenu = (event) => event.preventDefault();
    this._onPointerLockChange = () => {
      const locked = document.pointerLockElement === this.element;
      if (locked === this.pointerLocked) return;
      this.pointerLocked = locked;
      this.bus.emit(locked ? 'lock' : 'unlock', null);
    };
    this._onBlur = () => this.releaseAll();

    this.install();
  }

  install() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.bus.clear();
  }

  handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey) return;
    if (SWALLOWED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.keys.add(event.code);
    this.pressedThisFrame.add(event.code);
    this.syncActions();
    this.bus.emit('keydown', event.code);
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
    this.releasedThisFrame.add(event.code);
    this.syncActions();
    this.bus.emit('keyup', event.code);
  }

  handleMouseMove(event) {
    // Pointer lock gives us the raw deltas; a held button gives us a drag look
    // fallback for browsers or embedded views where lock is unavailable.
    if (this.pointerLocked || this.mouse.left || this.mouse.right) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    }
    const rect = this.element.getBoundingClientRect?.();
    this.mouse.x = event.clientX - (rect?.left ?? 0);
    this.mouse.y = event.clientY - (rect?.top ?? 0);
  }

  handleMouseButton(event, down) {
    const button = event.button === 0 ? 'left' : event.button === 2 ? 'right' : event.button === 1 ? 'middle' : null;
    if (!button) return;
    this.mouse[button] = down;
    if (down) this.syncActions();
    this.bus.emit(down ? 'mousedown' : 'mouseup', button);
  }

  /** Recomputes the action table from the raw key set. */
  syncActions() {
    for (const [name, codes] of Object.entries(BINDINGS)) {
      let active = false;
      for (const code of codes) {
        if (this.keys.has(code)) {
          active = true;
          break;
        }
      }
      this.actions[name] = active;
      if (active) this._frameActions.add(name);
    }
  }

  action(name) {
    return this.actions[name] === true && this.enabled;
  }

  /** True only on the frame the action first went down. */
  actionPressed(name) {
    if (!this.enabled) return false;
    for (const code of BINDINGS[name] ?? []) {
      if (this.pressedThisFrame.has(code)) return true;
    }
    return false;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.pressedThisFrame.has(code);
  }

  /** -1 / 0 / 1 axes, handy for both the fly camera and the walking player. */
  moveAxis() {
    const forward = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0);
    const strafe = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0);
    return { forward, strafe, vertical: (this.action('up') ? 1 : 0) - (this.action('down') ? 1 : 0) };
  }

  lookDelta() {
    return { yaw: -this.mouse.dx * this.sensitivity, pitch: -this.mouse.dy * this.sensitivity };
  }

  requestPointerLock() {
    const request = this.element.requestPointerLock?.bind(this.element);
    if (request) {
      const result = request();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    this.keys.clear();
    this.mouse.left = false;
    this.mouse.right = false;
    this.mouse.middle = false;
    this.syncActions();
    for (const name of Object.keys(this.actions)) this.actions[name] = false;
  }

  /** Call once at the end of every frame: per frame state is edge triggered. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this._frameActions.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}

export function createInput(options) {
  return new Input(options);
}
