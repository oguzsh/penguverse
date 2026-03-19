import type { AgentState, TypedLocation } from '@penguverse/types';
import type { Pathfinder } from '../scene/Pathfinder';
import type { TileReservation } from './TileReservation';
import type { Penguin } from './Penguin';

export interface NpcState {
  phase: 'idle' | 'working' | 'resting';
  phaseTimer: number;
  phaseDuration: number;
}

export function createNpcState(): NpcState {
  return {
    phase: 'idle',
    phaseTimer: 0,
    phaseDuration: 3 + Math.random() * 5,
  };
}

export function updateNpcPhase(
  penguin: Penguin,
  npc: NpcState,
  delta: number,
  pathfinder: Pathfinder,
  typedLocations?: TypedLocation[],
  reservation?: TileReservation,
  excludeNames?: Set<string>,
): void {
  npc.phaseTimer += delta;
  if (npc.phaseTimer < npc.phaseDuration) return;
  npc.phaseTimer = 0;

  if (npc.phase === 'idle') {
    npc.phase = Math.random() < 0.6 ? 'working' : 'resting';
    npc.phaseDuration = 10 + Math.random() * 20;
  } else {
    npc.phase = 'idle';
    npc.phaseDuration = 5 + Math.random() * 10;
  }

  const newState: AgentState = npc.phase === 'working' ? 'working'
    : npc.phase === 'resting' ? 'sleeping'
    : 'idle';

  if (newState !== penguin.state) {
    let reached = false;
    if (typedLocations && typedLocations.length > 0) {
      if (newState === 'working') {
        const home = penguin.getHomePosition();
        reached = penguin.goToAnchor(home, typedLocations, pathfinder, reservation)
          || penguin.goToAnchorType('work', typedLocations, pathfinder, reservation, excludeNames);
      } else if (newState === 'sleeping') {
        reached = penguin.goToAnchorType('rest', typedLocations, pathfinder, reservation, excludeNames);
      }
    }

    if (newState === 'idle' || reached) {
      penguin.updateState(newState, null, penguin.energy);
      if (newState === 'idle') {
        penguin.navigation.resetIdleTimer();
      }
    } else {
      npc.phase = 'idle';
      npc.phaseDuration = 3 + Math.random() * 5;
    }
  }
}
