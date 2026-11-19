// A tiny synchronous event bus. Systems talk through this instead of importing each
// other, so a new one can be added without editing the ones already written.

export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.emitted = 0;
  }

  /** Subscribes; returns an unsubscribe function. */
  on(type, handler) {
    let list = this.listeners.get(type);
    if (!list) {
      list = [];
      this.listeners.set(type, list);
    }
    list.push(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const list = this.listeners.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
    if (!list.length) this.listeners.delete(type);
  }

  /** Calls every listener for a type. A throwing listener must not stop the rest. */
  emit(type, payload) {
    this.emitted += 1;
    const list = this.listeners.get(type);
    if (!list || !list.length) return;
    // Iterate a copy: a listener is allowed to unsubscribe itself mid-emit.
    for (const handler of list.slice()) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`event "${type}" listener failed`, error);
      }
    }
  }

  count(type) {
    return this.listeners.get(type)?.length ?? 0;
  }

  clear() {
    this.listeners.clear();
  }
}

/** The game-wide bus. */
export const bus = new EventBus();
