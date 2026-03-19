import type { Penguin } from './penguins/Penguin';
import type { AgentState, AgentStatus, TypedLocation } from '@penguverse/types';
import type { Pathfinder } from './scene/Pathfinder';
import type { TileReservation } from './penguins/TileReservation';
import type { ParticleSystem } from './effects/Particles';
import type { SpeechBubbleSystem } from './effects/SpeechBubble';

export interface StateTransitionDeps {
  pathfinder: Pathfinder;
  reservation: TileReservation;
  particles: ParticleSystem;
  speechBubbles: SpeechBubbleSystem;
  getTypedLocations: () => TypedLocation[];
  getPenguins: () => Penguin[];
  getPenguin: (agentId: string) => Penguin | undefined;
  getOtherHomeAnchors: (excludeAgentId: string) => Set<string>;
  autoSpawnPenguin: (agent: AgentStatus) => void;
  autoSpawnEnabled: () => boolean;
}

const TRANSITION_DEBOUNCE_MS = 8000;

export class StateTransitionHandler {
  private lastTransitionTime: Map<string, number> = new Map();

  constructor(private deps: StateTransitionDeps) {}

  handleSignalUpdate(agents: AgentStatus[]) {
    for (const agent of agents) {
      const penguin = this.deps.getPenguin(agent.id);
      if (!penguin) {
        if (this.deps.autoSpawnEnabled()
          && agent.state !== 'offline') {
          this.deps.autoSpawnPenguin(agent);
        }
        continue;
      }

      if (penguin.isNpc) continue;

      const prevState = penguin.state;
      penguin.updateState(agent.state, agent.task, agent.energy);

      if (prevState !== agent.state) {
        const now = Date.now();
        const lastTransition = this.lastTransitionTime.get(penguin.agentId) ?? 0;
        const elapsed = now - lastTransition;

        const shouldTransition =
          elapsed >= TRANSITION_DEBOUNCE_MS
          || agent.state === 'working'
          || agent.state === 'offline'
          || prevState === 'offline'
          || !penguin.isMoving();

        if (shouldTransition) {
          this.handleStateTransition(penguin, prevState, agent.state);
          this.lastTransitionTime.set(penguin.agentId, now);
        }
      }
    }
  }

  handleDmEvent(event: { agentId: string; action: Record<string, unknown> }) {
    if (event.action?.type !== 'message' || !event.action?.to) return;

    const penguins = this.deps.getPenguins();
    const sender = penguins.find(p => p.agentId === event.agentId);
    const recipient = penguins.find(p => p.agentId === event.action.to);
    if (!sender || !recipient || sender === recipient) return;

    const sPos = sender.getTilePosition();
    const rPos = recipient.getTilePosition();
    const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let bestPath: { x: number; y: number }[] = [];
    for (const [dx, dy] of offsets) {
      const path = this.deps.pathfinder.findPath(sPos.x, sPos.y, rPos.x + dx, rPos.y + dy);
      if (path.length > 1 && (bestPath.length === 0 || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath.length > 1) {
      sender.walkTo(bestPath);
    }
  }

  private handleStateTransition(penguin: Penguin, _from: AgentState, to: AgentState) {
    const otherHomes = this.deps.getOtherHomeAnchors(penguin.agentId);
    const typedLocations = this.deps.getTypedLocations();

    if (typedLocations.length > 0) {
      if (to === 'working') {
        const home = penguin.getHomePosition();
        if (!penguin.goToAnchor(home, typedLocations, this.deps.pathfinder, this.deps.reservation)) {
          penguin.goToAnchorType('work', typedLocations, this.deps.pathfinder, this.deps.reservation, otherHomes);
        }
      } else if (to === 'sleeping') {
        penguin.goToAnchorType('rest', typedLocations, this.deps.pathfinder, this.deps.reservation, otherHomes);
      } else if (to === 'speaking') {
        if (!penguin.isMoving()) {
          penguin.goToAnchorType('social', typedLocations, this.deps.pathfinder, this.deps.reservation, otherHomes);
        }
      } else if (to === 'thinking') {
        penguin.goToAnchorType('utility', typedLocations, this.deps.pathfinder, this.deps.reservation, otherHomes);
      }
    }

    if (to === 'working' && penguin.task) {
      this.deps.speechBubbles.show(penguin.x + 16, penguin.y - 24, penguin.task, 4, penguin);
    } else if (to === 'error') {
      this.deps.particles.emitExclamation(penguin.x, penguin.y, penguin);
    } else if (to === 'speaking' && penguin.task) {
      this.deps.speechBubbles.show(penguin.x + 16, penguin.y - 24, penguin.task, 5, penguin);
    }
  }
}
