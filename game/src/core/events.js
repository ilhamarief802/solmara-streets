// A tiny synchronous event bus. The world, the clock and the later police and mission layers
// talk through named events rather than reaching into each other, so a listener can be added in
// a later session without touching the emitter.

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** Subscribes; returns an unsubscribe function. */
  on(name, handler) {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(handler);
    return () => this.off(name, handler);
  }

  /** Subscribes for exactly one emission. */
  once(name, handler) {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(name, handler) {
    const set = this.listeners.get(name);
    if (set) set.delete(handler);
  }

  /** Calls every listener; a throwing listener is reported and does not stop the others. */
  emit(name, payload) {
    const set = this.listeners.get(name);
    if (!set) return 0;
    let called = 0;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
        called++;
      } catch (error) {
        console.error(`event "${name}" listener failed`, error);
      }
    }
    return called;
  }

  clear() {
    this.listeners.clear();
  }
}

/** The game's one bus, for the pieces that do not want to be handed one. */
export const bus = new EventBus();
