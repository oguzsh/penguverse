import type { AgentState } from './agent';

export type WorldAction =
  | { type: 'move'; to: string }
  | { type: 'speak'; message: string; to?: string }
  | { type: 'emote'; emote: string }
  | { type: 'status'; state?: AgentState; task?: string | null; energy?: number }
  | { type: 'message'; message: string; to?: string | string[]; channel?: string };
