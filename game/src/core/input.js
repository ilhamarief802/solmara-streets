// Keyboard and mouse with pointer lock. The player, the camera and the menus all read
// the same action map; every binding is remappable and every query is a no-op while
// input is disabled (the title screen keeps the world frozen that way).

import { bus } from './events.js';

/** The default action map. Values are KeyboardEvent.code names. */
export const DEFAULT_BINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'ControlLeft',
  interact: 'KeyE',
  enter: 'Enter',
  horn: 'KeyH',
  handbrake: 'Space',
  cameraLeft: 'ArrowLeft',
  cameraRight: 'ArrowRight',
  lookUp: 'ArrowUp',
  lookDown: 'ArrowDown',
  pause: 'KeyP',
  perf: 'F3',
  timeSkip: 'KeyT',
  photo: 'KeyF12',
};

export class Input {
  constructor(canvas, bindings = DEFAULT_BINDINGS) {
    this.canvas = canvas;
    this.bindings = { ...bindings };
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: 0, y: 0, buttons: 0 };
    this.locked = false;
    this.enabled = true;
    this.pointerSensitivity = 0.0022;
    // Bound once so detach() can remove exactly the listeners attach() added.
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onLockChange = this._handleLockChange.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onContextMenu = (event) => event.preventDefault();
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLockChange);
    if (this.canvas) {
      this.canvas.addEventListener('mousedown', this._onMouseDown);
      this.canvas.addEventListener('mouseup', this._onMouseUp);
      this.canvas.addEventListener('contextmenu', this._onContextMenu);
    }
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mouseup', this._onMouseUp);
      this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    }
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  _handleKeyDown(event) {
    const code = event.code;
    // Let the browser keep its own reload, devtools and tab shortcuts.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (code === 'F3' || code === 'F5' || code === 'F11' || code === 'F12') event.preventDefault();
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
    // Space scrolls the page and jumps — the jump wins.
    if (code === 'Space') event.preventDefault();
    bus.emit('input:key', { code, down: true, repeat: event.repeat });
  }

  _handleKeyUp(event) {
    const code = event.code;
    if (this.down.has(code)) this.released.add(code);
    this.down.delete(code);
    bus.emit('input:key', { code, down: false, repeat: false });
  }

  _handleMouseMove(event) {
    if (!this.locked) {
      // Unlocked, the pointer is only tracked as a 0..1 position for the menus.
      const rect = this.canvas?.getBoundingClientRect?.();
      if (rect && rect.width) {
        this.mouse.x = (event.clientX - rect.left) / rect.width;
        this.mouse.y = (event.clientY - rect.top) / rect.height;
      }
      return;
    }
    this.mouse.dx += event.movementX || 0;
    this.mouse.dy += event.movementY || 0;
  }

  _handleMouseDown(event) {
    this.mouse.buttons |= 1 << event.button;
    bus.emit('input:mouse', { button: event.button, down: true });
    if (event.button === 0 && !this.locked && this.canvas) this.requestLock();
  }

  _handleMouseUp(event) {
    this.mouse.buttons &= ~(1 << event.button);
    bus.emit('input:mouse', { button: event.button, down: false });
  }

  _handleWheel(event) {
    // Unlocked, the wheel belongs to the page; locked, to the camera zoom.
    if (!this.locked) return;
    event.preventDefault();
    this.mouse.wheel += Math.sign(event.deltaY);
  }

  _handleLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    bus.emit('input:lock', { locked: this.locked });
  }

  _handleBlur() {
    // A tab switch releases every key; without this the player would keep running.
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  requestLock() {
    if (!this.canvas?.requestPointerLock) return;
    const result = this.canvas.requestPointerLock();
    // Chrome returns a promise that rejects if the user just exited the lock.
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  releaseLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  /** True while the action's key is held. */
  isDown(action) {
    if (!this.enabled) return false;
    const code = this.bindings[action];
    return code ? this.down.has(code) : false;
  }

  /** True on the frame the action's key went down. */
  wasPressed(action) {
    if (!this.enabled) return false;
    const code = this.bindings[action];
    return code ? this.pressed.has(code) : false;
  }

  wasReleased(action) {
    if (!this.enabled) return false;
    const code = this.bindings[action];
    return code ? this.released.has(code) : false;
  }

  /** Was this exact key code pressed this frame? */
  keyPressed(code) {
    return this.pressed.has(code);
  }

  /** Reads and clears the accumulated pointer delta. */
  consumeMouseDelta() {
    const delta = { x: this.mouse.dx * this.pointerSensitivity, y: this.mouse.dy * this.pointerSensitivity };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return delta;
  }

  resetFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.wheel = 0;
  }
}

export function createInput(canvas) {
  return new Input(canvas);
}
