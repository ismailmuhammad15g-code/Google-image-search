// Tiny in-memory LRU with TTL (per warm serverless instance).
export class TTLCache {
  constructor(max = 200, ttlMs = 5 * 60_000) {
    this.max = max;
    this.ttl = ttlMs;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, exp: Date.now() + this.ttl });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}
