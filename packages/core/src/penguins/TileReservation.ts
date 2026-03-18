export class TileReservation {
  private map = new Map<string, string>();

  private key(x: number, y: number): string { return `${x},${y}`; }

  reserve(x: number, y: number, agentId: string): boolean {
    const k = this.key(x, y);
    const current = this.map.get(k);
    if (current && current !== agentId) return false;
    this.map.set(k, agentId);
    return true;
  }

  release(agentId: string) {
    for (const [k, v] of this.map) {
      if (v === agentId) this.map.delete(k);
    }
  }

  isAvailable(x: number, y: number, agentId: string): boolean {
    const current = this.map.get(this.key(x, y));
    return !current || current === agentId;
  }
}
