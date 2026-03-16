
type EventMap = {
  'card:added': any;
  'card:updated': any;
  'card:deleted': string;
  'card:contextmenu': { card: any; event: MouseEvent };
  'card:dragstart': { card: any; event: DragEvent };
  'filter:changed': any;
  'filter:tag': string;
  'sort:changed': { mode: string; ascending: boolean };
  'settings:changed': any;
};

export class EventBus {
  private listeners = new Map<keyof EventMap, Set<Function>>();

  on<K extends keyof EventMap>(
    event: K,
    callback: (data: EventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`Error in event handler for ${event}:`, e);
      }
    });
  }

  async emitAsync<K extends keyof EventMap>(
    event: K,
    data: EventMap[K]
  ): Promise<void> {
    const handlers = Array.from(this.listeners.get(event) || []);
    await Promise.all(handlers.map(cb => {
      try {
        return cb(data);
      } catch (e) {
        console.error(`Error in async event handler for ${event}:`, e);
        return Promise.resolve();
      }
    }));
  }
}
