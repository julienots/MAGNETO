/**
 * Persistent save with checksum + rolling backup + schema migrations.
 * Storage is abstracted so a cloud provider can be plugged in later.
 */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStorage implements StorageAdapter {
  private m = new Map<string, string>();
  get(k: string) { return this.m.get(k) ?? null; }
  set(k: string, v: string) { this.m.set(k, v); }
  remove(k: string) { this.m.delete(k); }
}

export function defaultStorage(): StorageAdapter {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__mw_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
    }
  } catch { /* private mode or blocked: fall through */ }
  return new MemoryStorage();
}

/** Hook for future cloud sync (Play Games Services, custom backend...). */
export interface CloudSaveProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  pull(): Promise<{ json: string; updatedAt: number } | null>;
  push(json: string, updatedAt: number): Promise<void>;
}
export class NoCloud implements CloudSaveProvider {
  readonly name = 'none';
  async isAvailable() { return false; }
  async pull() { return null; }
  async push() { /* no-op until a backend exists */ }
}

export function checksum(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const KEY = 'magnetwar.save';
const BACKUP = 'magnetwar.save.bak';

export class SaveService<T extends { v: number; updatedAt: number }> {
  constructor(
    private storage: StorageAdapter,
    private fresh: () => T,
    private migrate: (raw: any) => T,
    public cloud: CloudSaveProvider = new NoCloud(),
  ) {}

  private decode(s: string | null): T | null {
    if (!s) return null;
    try {
      const env = JSON.parse(s);
      if (!env || typeof env.d !== 'string' || checksum(env.d) !== env.c) return null;
      return this.migrate(JSON.parse(env.d));
    } catch {
      return null;
    }
  }

  load(): { data: T; source: 'main' | 'backup' | 'fresh' } {
    const main = this.decode(this.storage.get(KEY));
    if (main) return { data: main, source: 'main' };
    const bak = this.decode(this.storage.get(BACKUP));
    if (bak) return { data: bak, source: 'backup' };
    return { data: this.fresh(), source: 'fresh' };
  }

  save(data: T) {
    data.updatedAt = Date.now();
    const d = JSON.stringify(data);
    const env = JSON.stringify({ d, c: checksum(d) });
    const prev = this.storage.get(KEY);
    try {
      if (prev) this.storage.set(BACKUP, prev);
      this.storage.set(KEY, env);
    } catch (e) {
      console.warn('[save] write failed', e);
    }
  }

  wipe() { this.storage.remove(KEY); this.storage.remove(BACKUP); }
}
