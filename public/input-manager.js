// InputManager — unified input abstraction for keyboard + touch
//
// getInput() returns { up, down, left, right, fire } — all boolean.
// Both singleplayer and online modes read from this single source.

export class InputManager {
  constructor() {
    this._keys = {};
    this._touchState = { up: false, down: false, left: false, right: false, fire: false };
    this._joystickTouch = null;  // { id, startX, startY, currentX, currentY }
    this._fireTouchId = null;
    this._container = null;
    this._joyZone = null;
    this._joyThumb = null;
    this._fireBtn = null;
    this._initialized = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  // ---- Public API ----

  init(containerEl) {
    if (this._initialized) this.destroy();
    this._container = containerEl;
    this._joyZone = containerEl.querySelector('#joystick-zone');
    this._joyThumb = containerEl.querySelector('#joystick-thumb');
    this._fireBtn = containerEl.querySelector('#fire-btn');

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    containerEl.addEventListener('pointerdown', this._onPointerDown);
    containerEl.addEventListener('pointermove', this._onPointerMove);
    containerEl.addEventListener('pointerup', this._onPointerUp);
    containerEl.addEventListener('pointercancel', this._onPointerUp);
    this._initialized = true;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._container) {
      this._container.removeEventListener('pointerdown', this._onPointerDown);
      this._container.removeEventListener('pointermove', this._onPointerMove);
      this._container.removeEventListener('pointerup', this._onPointerUp);
      this._container.removeEventListener('pointercancel', this._onPointerUp);
    }
    this._initialized = false;
    this.reset();
  }

  reset() {
    this._keys = {};
    this._touchState = { up: false, down: false, left: false, right: false, fire: false };
    this._joystickTouch = null;
    this._fireTouchId = null;
    this._updateJoystickVisual(0, 0);
    this._updateFireVisual(false);
  }

  // Re-read container bounds — call after orientation/layout changes
  refresh() {
    if (!this._container) return;
    // Update joystick zone and fire button references in case DOM changed
    this._joyZone = this._container.querySelector('#joystick-zone');
    this._joyThumb = this._container.querySelector('#joystick-thumb');
    this._fireBtn = this._container.querySelector('#fire-btn');
  }

  // ---- Main input read ----

  getInput() {
    const k = this._keys;
    const t = this._touchState;

    return {
      up: !!(k['w'] || k['W'] || k['ArrowUp']) || t.up,
      down: !!(k['s'] || k['S'] || k['ArrowDown']) || t.down,
      left: !!(k['a'] || k['A'] || k['ArrowLeft']) || t.left,
      right: !!(k['d'] || k['D'] || k['ArrowRight']) || t.right,
      fire: !!(k[' '] || k['Space']) || t.fire,
    };
  }

  // ---- Keyboard backend ----

  _onKeyDown(e) {
    this._keys[e.key] = true;
    this._keys[e.code] = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this._keys[e.key] = false;
    this._keys[e.code] = false;
  }

  // ---- Touch backend (Pointer Events) ----

  _onPointerDown(e) {
    e.preventDefault();
    const rect = this._container.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    if (relX < 0.5) {
      // Left half → joystick
      if (!this._joystickTouch) {
        this._joystickTouch = {
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        };
        // Position joystick base at touch point
        if (this._joyZone) {
          this._joyZone.style.left = (e.clientX - rect.left) + 'px';
          this._joyZone.style.top = (e.clientY - rect.top) + 'px';
          this._joyZone.style.display = 'block';
          this._joyZone.style.transform = 'translate(-50%, -50%)';
        }
      }
    } else {
      // Right half → fire
      if (this._fireTouchId === null) {
        this._fireTouchId = e.pointerId;
        this._touchState.fire = true;
        this._updateFireVisual(true);
      }
    }
    this._container.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    e.preventDefault();
    if (this._joystickTouch && e.pointerId === this._joystickTouch.id) {
      this._joystickTouch.currentX = e.clientX;
      this._joystickTouch.currentY = e.clientY;
      const dx = e.clientX - this._joystickTouch.startX;
      const dy = e.clientY - this._joystickTouch.startY;
      this._updateJoystickVisual(dx, dy);
      this._updateJoystickState(dx, dy);
    }
  }

  _onPointerUp(e) {
    e.preventDefault();
    if (this._joystickTouch && e.pointerId === this._joystickTouch.id) {
      this._joystickTouch = null;
      this._touchState.up = false;
      this._touchState.down = false;
      this._touchState.left = false;
      this._touchState.right = false;
      if (this._joyZone) {
        this._joyZone.style.display = 'none';
      }
      this._updateJoystickVisual(0, 0);
    }
    if (this._fireTouchId === e.pointerId) {
      this._fireTouchId = null;
      this._touchState.fire = false;
      this._updateFireVisual(false);
    }
  }

  _updateJoystickState(dx, dy) {
    const deadZone = 12;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < deadZone && absDy < deadZone) {
      this._touchState.up = false;
      this._touchState.down = false;
      this._touchState.left = false;
      this._touchState.right = false;
      return;
    }
    // Prioritize the dominant axis
    if (absDx > absDy) {
      this._touchState.left = dx < -deadZone;
      this._touchState.right = dx > deadZone;
      this._touchState.up = false;
      this._touchState.down = false;
    } else {
      this._touchState.up = dy < -deadZone;
      this._touchState.down = dy > deadZone;
      this._touchState.left = false;
      this._touchState.right = false;
    }
  }

  _updateJoystickVisual(dx, dy) {
    if (!this._joyThumb) return;
    const maxR = 40;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, maxR);
    const sx = dist > 0 ? (dx / dist) * clamp : 0;
    const sy = dist > 0 ? (dy / dist) * clamp : 0;
    this._joyThumb.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
  }

  _updateFireVisual(active) {
    if (this._fireBtn) {
      this._fireBtn.classList.toggle('active', active);
    }
  }
}

export const inputManager = new InputManager();
