export interface QueuedMessage {
  from: string;
  message: string;
  channel?: string;
  timestamp: number;
}

export class MessageRouter {
  private inbox: Map<string, QueuedMessage[]> = new Map();
  private channels: Map<string, Set<string>> = new Map();

  joinChannel(agentId: string, channel: string) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(agentId);
  }

  leaveChannel(agentId: string, channel: string) {
    this.channels.get(channel)?.delete(agentId);
  }

  removeAgent(agentId: string) {
    for (const members of this.channels.values()) {
      members.delete(agentId);
    }
  }

  getChannelMembers(channel: string): Set<string> {
    return this.channels.get(channel) ?? new Set();
  }

  getAllChannels(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, members] of this.channels) {
      result[name] = [...members];
    }
    return result;
  }

  queueMessage(agentId: string, from: string, message: string, channel?: string) {
    if (!this.inbox.has(agentId)) this.inbox.set(agentId, []);
    const q = this.inbox.get(agentId)!;
    q.push({ from, message, channel, timestamp: Date.now() });
    if (q.length > 100) q.shift();
  }

  drainInbox(agentId: string): QueuedMessage[] {
    const msgs = this.inbox.get(agentId) ?? [];
    this.inbox.delete(agentId);
    return msgs;
  }

  peekInbox(agentId: string): QueuedMessage[] {
    return this.inbox.get(agentId) ?? [];
  }
}
