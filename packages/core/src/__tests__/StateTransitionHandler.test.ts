import { describe, test, expect, mock } from 'bun:test';
import { StateTransitionHandler } from '../StateTransitionHandler';
import { Pathfinder } from '../scene/Pathfinder';
import { TileReservation } from '../penguins/TileReservation';

function makeGrid(): boolean[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(true));
}

function makePenguin(id: string, state = 'idle' as any) {
  return {
    agentId: id,
    state,
    task: null,
    energy: 1,
    x: 0,
    y: 0,
    isNpc: false,
    isMoving: () => false,
    updateState: mock(function(this: any, s: string, t: any, e: number) { this.state = s; }),
    goToAnchor: mock(() => true),
    goToAnchorType: mock(() => true),
    getHomePosition: () => 'home',
    getTilePosition: () => ({ x: 0, y: 0 }),
    walkTo: mock(() => {}),
    containsPoint: () => false,
  } as any;
}

function makeDeps(penguins: any[] = []) {
  const pathfinder = new Pathfinder(makeGrid());
  const reservation = new TileReservation();
  return {
    pathfinder,
    reservation,
    particles: { emitExclamation: mock(() => {}), emitZzz: mock(() => {}), emitThought: mock(() => {}) } as any,
    speechBubbles: { show: mock(() => {}) } as any,
    getTypedLocations: () => [{ name: 'desk', x: 2, y: 2, type: 'work' as const }],
    getPenguins: () => penguins,
    getPenguin: (id: string) => penguins.find((p: any) => p.agentId === id),
    getOtherHomeAnchors: () => new Set<string>(),
    autoSpawnPenguin: mock(() => {}),
    autoSpawnEnabled: () => true,
  };
}

describe('StateTransitionHandler', () => {
  test('updates penguin state on signal', () => {
    const penguin = makePenguin('agent-1');
    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent 1', state: 'working', task: 'building', energy: 0.8 },
    ]);

    expect(penguin.updateState).toHaveBeenCalledWith('working', 'building', 0.8);
  });

  test('triggers auto-spawn for unknown agents', () => {
    const deps = makeDeps([]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'new-agent', name: 'New', state: 'idle', task: null, energy: 1 },
    ]);

    expect(deps.autoSpawnPenguin).toHaveBeenCalled();
  });

  test('does not auto-spawn offline agents', () => {
    const deps = makeDeps([]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'offline-agent', name: 'Off', state: 'offline', task: null, energy: 1 },
    ]);

    expect(deps.autoSpawnPenguin).not.toHaveBeenCalled();
  });

  test('does not auto-spawn when disabled', () => {
    const deps = makeDeps([]);
    deps.autoSpawnEnabled = () => false;
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'new-agent', name: 'New', state: 'idle', task: null, energy: 1 },
    ]);

    expect(deps.autoSpawnPenguin).not.toHaveBeenCalled();
  });

  test('skips NPC penguins', () => {
    const penguin = makePenguin('npc-1');
    penguin.isNpc = true;
    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'npc-1', name: 'NPC', state: 'working', task: 'task', energy: 1 },
    ]);

    expect(penguin.updateState).not.toHaveBeenCalled();
  });

  test('navigates to work anchor on working transition', () => {
    const penguin = makePenguin('agent-1', 'idle');
    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent', state: 'working', task: 'coding', energy: 1 },
    ]);

    expect(penguin.goToAnchor).toHaveBeenCalled();
  });

  test('shows speech bubble on working with task', () => {
    const penguin = makePenguin('agent-1', 'idle');
    penguin.task = 'building feature';
    penguin.updateState = mock(function(this: any, s: any, t: any, e: any) {
      this.state = s;
      this.task = t;
    });

    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent', state: 'working', task: 'building feature', energy: 1 },
    ]);

    expect(deps.speechBubbles.show).toHaveBeenCalled();
  });

  test('emits exclamation on error transition', () => {
    const penguin = makePenguin('agent-1', 'working');
    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent', state: 'error', task: null, energy: 1 },
    ]);

    expect(deps.particles.emitExclamation).toHaveBeenCalled();
  });

  test('debounces rapid transitions', () => {
    const penguin = makePenguin('agent-1', 'idle');
    const deps = makeDeps([penguin]);
    const handler = new StateTransitionHandler(deps);

    // First transition always goes through
    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent', state: 'thinking', task: null, energy: 1 },
    ]);

    // Immediate second transition should be debounced (unless it's working/offline)
    penguin.isMoving = () => true; // make it moving to trigger debounce
    handler.handleSignalUpdate([
      { id: 'agent-1', name: 'Agent', state: 'speaking', task: null, energy: 1 },
    ]);

    // goToAnchorType should only have been called once (for thinking → utility)
    expect(penguin.goToAnchorType).toHaveBeenCalledTimes(1);
  });

  test('handleDmEvent walks sender to recipient', () => {
    const sender = makePenguin('sender', 'idle');
    const recipient = makePenguin('recipient', 'idle');
    recipient.x = 64;
    recipient.y = 64;
    recipient.getTilePosition = () => ({ x: 2, y: 2 });

    const deps = makeDeps([sender, recipient]);
    const handler = new StateTransitionHandler(deps);

    handler.handleDmEvent({
      agentId: 'sender',
      action: { type: 'message', to: 'recipient', message: 'hi' },
    });

    expect(sender.walkTo).toHaveBeenCalled();
  });

  test('handleDmEvent ignores non-message events', () => {
    const sender = makePenguin('sender');
    const deps = makeDeps([sender]);
    const handler = new StateTransitionHandler(deps);

    handler.handleDmEvent({
      agentId: 'sender',
      action: { type: 'move', to: 'somewhere' },
    });

    expect(sender.walkTo).not.toHaveBeenCalled();
  });
});
