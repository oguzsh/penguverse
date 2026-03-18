export interface WorldEvent {
  id: number;
  timestamp: number;
  agentId: string;
  action: { type: string; [key: string]: unknown };
}

export class EventLog {
  private events: WorldEvent[] = [];
  private maxSize: number;
  private nextId = 1;
  private listeners: ((event: WorldEvent) => void)[] = [];

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  push(agentId: string, action: { type: string; [key: string]: unknown }): WorldEvent {
    const event: WorldEvent = {
      id: this.nextId++,
      timestamp: Date.now(),
      agentId,
      action,
    };
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  since(afterId: number): WorldEvent[] {
    const idx = this.events.findIndex(e => e.id > afterId);
    return idx === -1 ? [] : this.events.slice(idx);
  }

  recent(count = 50): WorldEvent[] {
    return this.events.slice(-count);
  }

  lastId(): number {
    return this.events.length > 0 ? this.events[this.events.length - 1].id : 0;
  }

  onEvent(listener: (event: WorldEvent) => void) {
    this.listeners.push(listener);
  }
}
