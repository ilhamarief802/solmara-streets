// A very small synchronous event bus. Systems in later phases (player, cars,
// wanted level) need to talk without importing each other, and this is the whole
// of what that needs: subscribe, unsubscribe, emit.

export class EventBus {
  constructor(label = 'bus') {
    this.label = label;
    this.listeners = new Map();
    this.emitting = 0;
  }

  /** Subscribes; returns the unsubscribe function so callers do not track handles. */
  on(type, handler) {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(handler);
    return () => this.off(type, handler);
  }

  /** Subscribes for a single delivery. */
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const bucket = this.listeners.get(type);
    if (!bucket) return false;
    const removed = bucket.delete(handler);
    if (bucket.size === 0) this.listeners.delete(type);
    return removed;
  }

  emit(type, payload) {
    const bucket = this.listeners.get(type);
    if (!bucket || bucket.size === 0) return 0;
    this.emitting += 1;
    let delivered = 0;
    for (const handler of Array.from(bucket)) {
      try {
        handler(payload, type);
        delivered += 1;
      } catch (error) {
        // A broken listener must not stop the others or kill the frame.
        console.error(`[${this.label}] listener for "${type}" failed:`, error);
      }
    }
    this.emitting -= 1;
    return delivered;
  }

  listenerCount(type) {
    return type ? (this.listeners.get(type)?.size ?? 0) : this.listeners.size;
  }

  clear(type) {
    if (type) this.listeners.delete(type);
    else this.listeners.clear();
  }
}

export function createBus(label) {
  return new EventBus(label);
}
