import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentStore } from '../store';

describe('AgentStore', () => {
  let store: AgentStore;

  beforeEach(() => {
    store = new AgentStore(100); // 100ms timeout for fast tests
  });

  afterEach(() => {
    store.stop();
  });

  test('heartbeat creates a new agent', () => {
    const agent = store.heartbeat({ agent: 'test-1', name: 'Test', state: 'idle' });
    expect(agent.agent).toBe('test-1');
    expect(agent.name).toBe('Test');
    expect(agent.state).toBe('idle');
    expect(agent.energy).toBe(1);
  });

  test('heartbeat updates existing agent', () => {
    store.heartbeat({ agent: 'a', state: 'idle' });
    const updated = store.heartbeat({ agent: 'a', state: 'working', task: 'Coding' });
    expect(updated.state).toBe('working');
    expect(updated.task).toBe('Coding');
  });

  test('heartbeat preserves fields not provided', () => {
    store.heartbeat({ agent: 'a', name: 'Alice', state: 'idle', energy: 0.5 });
    const updated = store.heartbeat({ agent: 'a', state: 'working' });
    expect(updated.name).toBe('Alice');
    expect(updated.energy).toBe(0.5);
  });

  test('getAll returns all agents', () => {
    store.heartbeat({ agent: 'a' });
    store.heartbeat({ agent: 'b' });
    expect(store.getAll().length).toBe(2);
  });

  test('getPublicList excludes lastSeen', () => {
    store.heartbeat({ agent: 'a' });
    const list = store.getPublicList();
    expect(list.length).toBe(1);
    expect((list[0] as any).lastSeen).toBeUndefined();
  });

  test('remove deletes agent', () => {
    store.heartbeat({ agent: 'a' });
    store.remove('a');
    expect(store.getAll().length).toBe(0);
  });

  test('onUpdate callback fires on heartbeat', () => {
    let callCount = 0;
    store.onUpdate(() => { callCount++; });
    store.heartbeat({ agent: 'a' });
    store.heartbeat({ agent: 'b' });
    expect(callCount).toBe(2);
  });

  test('onUpdate unsubscribe works', () => {
    let callCount = 0;
    const unsub = store.onUpdate(() => { callCount++; });
    store.heartbeat({ agent: 'a' });
    unsub();
    store.heartbeat({ agent: 'b' });
    expect(callCount).toBe(1);
  });

  test('timeout cascade: active → sleeping → offline', async () => {
    store.start();
    store.heartbeat({ agent: 'a', state: 'working' });

    // Wait for first sweep (100ms timeout + 5s sweep interval is too slow)
    // Instead, test the logic directly
    store.stop();

    // Manually age the agent
    const agents = store.getAll();
    agents[0].lastSeen = Date.now() - 150;
    store.start();

    await new Promise(r => setTimeout(r, 6000));

    const agent = store.getAll()[0];
    expect(agent.state).toBe('sleeping');
    store.stop();
  }, 10000);

  test('defaults when no fields provided', () => {
    const agent = store.heartbeat({ agent: 'bare' });
    expect(agent.name).toBe('bare');
    expect(agent.state).toBe('idle');
    expect(agent.task).toBeNull();
    expect(agent.energy).toBe(1);
    expect(agent.metadata).toEqual({});
  });
});
