// Keyboard and mouse state for a third-person game: held keys, per-frame pressed edges, mouse
// deltas while the pointer is locked, and the pointer-lock handshake. The player, the camera and
// the later vehicle layer read this; nothing here knows what a "car" is.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyC', 'KeyV', 'KeyX',
  'KeyZ', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyP', 'KeyT', 'KeyU', 'KeyI', 'KeyO', 'KeyB',
  'KeyN', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'Tab', 'Escape', 'Enter', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'Digit0', 'F1', 'F2', 'F3', 'F4', 'F5',
]);

export class Input {
  /**
   * @param {HTMLCanvasElement|null} canvas the element pointer lock is requested on
   * @param {EventTarget} target where key and mouse events are heard (usually window)
   */
  constructor(canvas = null, target = window) {
    this.canvas = canvas;
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = [false, false, false];
    this.buttonPressed = [false, false, false];
    this.pointerLocked = false;
    this.enabled = true;
    /** Extra handlers a mode may install: onKeyDown, onPointerLock(locked). */
    this.onKeyDown = null;
    this.onPointerLock = null;
    this._bound = false;
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onLockChange = this._handleLockChange.bind(this);
    this._onBlur = this._handleBlur.bind(this);
  }

  attach() {
    if (this._bound) return this;
    this._bound = true;
    this.target.addEventListener('keydown', this._onKeyDown, { capture: true });
    this.target.addEventListener('keyup', this._onKeyUp, { capture: true });
    this.target.addEventListener('mousemove', this._onMouseMove);
    this.target.addEventListener('mousedown', this._onMouseDown);
    this.target.addEventListener('mouseup', this._onMouseUp);
    this.target.addEventListener('wheel', this._onWheel, { passive: false });
    this.target.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    return this;
  }

  detach() {
    if (!this._bound) return;
    this._bound = false;
    this.target.removeEventListener('keydown', this._onKeyDown, { capture: true });
    this.target.removeEventListener('keyup', this._onKeyUp, { capture: true });
    this.target.removeEventListener('mousemove', this._onMouseMove);
    this.target.removeEventListener('mousedown', this._onMouseDown);
    this.target.removeEventListener('mouseup', this._onMouseUp);
    this.target.removeEventListener('wheel', this._onWheel);
    this.target.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  _handleKeyDown(event) {
    if (!this.enabled) return;
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!this.keys.has(event.code)) this.pressed.add(event.code);
    this.keys.add(event.code);
    if (this.onKeyDown) this.onKeyDown(event);
  }

  _handleKeyUp(event) {
    this.keys.delete(event.code);
    this.released.add(event.code);
  }

  _handleMouseMove(event) {
    if (!this.pointerLocked) return;
    this.mouse.dx += event.movementX || 0;
    this.mouse.dy += event.movementY || 0;
  }

  _handleMouseDown(event) {
    const index = event.button;
    if (index >= 0 && index < 3) {
      if (!this.buttons[index]) this.buttonPressed[index] = true;
      this.buttons[index] = true;
    }
  }

  _handleMouseUp(event) {
    const index = event.button;
    if (index >= 0 && index < 3) this.buttons[index] = false;
  }

  _handleWheel(event) {
    if (!this.pointerLocked) return;
    event.preventDefault();
    this.mouse.wheel += Math.sign(event.deltaY);
  }

  _handleLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) this.mouse.dx = this.mouse.dy = 0;
    if (this.onPointerLock) this.onPointerLock(this.pointerLocked);
  }

  _handleBlur() {
    this.keys.clear();
    this.buttons = [false, false, false];
    this.mouse.dx = this.mouse.dy = 0;
  }

  /** Requests pointer lock; browsers require a user gesture, so this is called from a click. */
  requestPointerLock() {
    if (!this.canvas || this.pointerLocked) return;
    const request = this.canvas.requestPointerLock?.();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Held this frame. */
  down(code) {
    return this.keys.has(code);
  }

  /** Went down since the last endFrame(). */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Came up since the last endFrame(). */
  wasReleased(code) {
    return this.released.has(code);
  }

  /** Mouse delta and wheel since the last endFrame(), then the deltas reset. */
  takeMouse() {
    const out = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return out;
  }

  /** -1, 0 or 1 from a pair of keys: (positive, negative). */
  axis(positive, negative) {
    return (this.down(positive) ? 1 : 0) - (this.down(negative) ? 1 : 0);
  }

  /** Clears the per-frame edges. The loop calls this at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.buttonPressed = [false, false, false];
  }
}

/** The game's input, attached to the viewport canvas and the window. */
export function createInput(canvas) {
  return new Input(canvas, window).attach();
}
