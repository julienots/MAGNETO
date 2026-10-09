/** Generic object pool: avoids GC spikes for short-lived gameplay objects. */
export class Pool<T> {
  private free: T[] = [];
  constructor(private make: () => T, private reset?: (o: T) => void, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(make());
  }
  get(): T { return this.free.pop() ?? this.make(); }
  release(o: T) { this.reset?.(o); this.free.push(o); }
  get size() { return this.free.length; }
}
