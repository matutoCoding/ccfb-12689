import { useSyncExternalStore } from 'react';

// 极简外部 store:不可变更新 + useSyncExternalStore,避免上百次拖拽产生堆积
export class Store<T> {
  private state: T;
  private listeners = new Set<() => void>();
  constructor(initial: T) { this.state = initial; }
  getState = (): T => this.state;
  setState = (next: T | ((prev: T) => T)) => {
    this.state = typeof next === 'function' ? (next as (p: T) => T)(this.state) : next;
    this.listeners.forEach((l) => l());
  };
  patch = (p: Partial<T>) => { this.setState({ ...this.state, ...p }); };
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  useStore<S>(selector: (s: T) => S): S {
    return useSyncExternalStore(
      this.subscribe,
      () => selector(this.state),
      () => selector(this.state),
    );
  }
}
