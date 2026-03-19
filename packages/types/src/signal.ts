import type { AgentState } from './agent';

export interface AgentStatus {
  id: string;
  name: string;
  state: AgentState;
  task: string | null;
  energy: number;
  metadata?: Record<string, unknown>;
}

export interface SignalConfig {
  type: 'websocket' | 'mock';
  url?: string;
  interval?: number;
  mockData?: () => AgentStatus[];
}

export type SignalCallback = (agents: AgentStatus[]) => void;
export type EventCallback = (event: { id: number; timestamp: number; agentId: string; action: Record<string, unknown> }) => void;
export type MessageCallback = (msg: { from: string; message: string; channel?: string }) => void;
