import { GameEvent, GameEventType } from '../types';

export interface EventBus {
  subscribe(type: GameEventType, callback: (event: GameEvent) => void): () => void;
  subscribeAll(callback: (event: GameEvent) => void): () => void;
  emit(event: GameEvent): void;
  getHistory(): GameEvent[];
  clearHistory(): void;
}

export class EventBusImpl implements EventBus {
  private listeners: Map<GameEventType, Set<(event: GameEvent) => void>> = new Map();
  private allListeners: Set<(event: GameEvent) => void> = new Set();
  private history: GameEvent[] = [];

  subscribe(type: GameEventType, callback: (event: GameEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  subscribeAll(callback: (event: GameEvent) => void): () => void {
    this.allListeners.add(callback);
    return () => {
      this.allListeners.delete(callback);
    };
  }

  emit(event: GameEvent): void {
    this.history.push(event);
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const callback of typeListeners) {
        callback(event);
      }
    }
    for (const callback of this.allListeners) {
      callback(event);
    }
  }

  getHistory(): GameEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
