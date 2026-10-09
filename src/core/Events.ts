type Fn = (...a: any[]) => void;
export class Emitter {
  private m = new Map<string, Set<Fn>>();
  on(ev: string, fn: Fn) { (this.m.get(ev) ?? this.m.set(ev, new Set()).get(ev)!).add(fn); return () => this.off(ev, fn); }
  off(ev: string, fn: Fn) { this.m.get(ev)?.delete(fn); }
  emit(ev: string, ...a: any[]) { this.m.get(ev)?.forEach((f) => f(...a)); }
}
/** Global app bus (meta changes, settings, ...). */
export const bus = new Emitter();
