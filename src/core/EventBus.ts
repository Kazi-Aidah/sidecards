
import type { Card } from "../models/Card";

type EventMap = {
  'card:added': Card;
  'card:updated': Card;
  'card:deleted': string;
  'card:contextmenu': { card: Card; event: MouseEvent };
  'card:dragstart': { card: Card; event: DragEvent };
  'filter:changed': { type: string; value: string };
  'filter:tag': string;
  'sort:changed': { mode: string; ascending: boolean };
  'settings:changed': Record<string, unknown>;
  'card:focus': string;
};

type EventCallback<T> = (data: T) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<keyof EventMap, Set<EventCallback<EventMap[keyof EventMap]>>>();

  on<K extends keyof EventMap>(
    event: K,
    callback: (data: EventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<EventMap[keyof EventMap]>);
    
    return () => this.listeners.get(event)?.delete(callback as EventCallback<EventMap[keyof EventMap]>);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        void cb(data);
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
        return Promise.resolve(cb(data));
      } catch (e) {
        console.error(`Error in async event handler for ${event}:`, e);
        return Promise.resolve();
      }
    }));
  }
}
