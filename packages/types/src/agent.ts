export type AgentState =
  | 'working'
  | 'idle'
  | 'thinking'
  | 'error'
  | 'sleeping'
  | 'listening'
  | 'speaking'
  | 'offline';

export type AnchorType = 'work' | 'rest' | 'social' | 'utility' | 'wander';

export interface TypedLocation {
  name: string;
  x: number;
  y: number;
  type: AnchorType;
}

export interface PenguinConfig {
  agentId: string;
  name: string;
  sprite: string;
  position: string;
  npc?: boolean;
}
