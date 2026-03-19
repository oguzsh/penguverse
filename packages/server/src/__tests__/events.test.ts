import { describe, test, expect } from 'bun:test';
import { EventLog } from '../events';

describe('EventLog', () => {
  test('push adds event with auto-incrementing ID', () => {
    const log = new EventLog();
    const e1 = log.push('agent-1', { type: 'speak', message: 'hi' });
    const e2 = log.push('agent-2', { type: 'move', to: 'desk' });
    expect(e1.id).toBe(1);
    expect(e2.id).toBe(2);
    expect(e1.agentId).toBe('agent-1');
    expect(e2.agentId).toBe('agent-2');
  });

  test('push includes timestamp', () => {
    const log = new EventLog();
    const before = Date.now();
    const e = log.push('a', { type: 'test' });
    const after = Date.now();
    expect(e.timestamp).toBeGreaterThanOrEqual(before);
    expect(e.timestamp).toBeLessThanOrEqual(after);
  });

  test('ring buffer overflow discards oldest', () => {
    const log = new EventLog(3);
    log.push('a', { type: '1' });
    log.push('a', { type: '2' });
    log.push('a', { type: '3' });
    log.push('a', { type: '4' }); // should evict event 1

    const recent = log.recent(10);
    expect(recent.length).toBe(3);
    expect(recent[0].action.type).toBe('2');
    expect(recent[2].action.type).toBe('4');
  });

  test('since returns events after given ID', () => {
    const log = new EventLog();
    log.push('a', { type: '1' });
    const e2 = log.push('a', { type: '2' });
    log.push('a', { type: '3' });

    const after = log.since(e2.id);
    expect(after.length).toBe(1);
    expect(after[0].action.type).toBe('3');
  });

  test('since returns empty if no newer events', () => {
    const log = new EventLog();
    const e = log.push('a', { type: '1' });
    expect(log.since(e.id)).toEqual([]);
  });

  test('since returns all events if afterId is 0', () => {
    const log = new EventLog();
    log.push('a', { type: '1' });
    log.push('a', { type: '2' });
    expect(log.since(0).length).toBe(2);
  });

  test('recent returns last N events', () => {
    const log = new EventLog();
    log.push('a', { type: '1' });
    log.push('a', { type: '2' });
    log.push('a', { type: '3' });

    const last2 = log.recent(2);
    expect(last2.length).toBe(2);
    expect(last2[0].action.type).toBe('2');
    expect(last2[1].action.type).toBe('3');
  });

  test('lastId returns 0 when empty', () => {
    const log = new EventLog();
    expect(log.lastId()).toBe(0);
  });

  test('lastId returns latest event ID', () => {
    const log = new EventLog();
    log.push('a', { type: '1' });
    log.push('a', { type: '2' });
    expect(log.lastId()).toBe(2);
  });

  test('onEvent listener fires on push', () => {
    const log = new EventLog();
    const received: string[] = [];
    log.onEvent((e) => received.push(e.action.type));
    log.push('a', { type: 'hello' });
    log.push('b', { type: 'world' });
    expect(received).toEqual(['hello', 'world']);
  });
});
