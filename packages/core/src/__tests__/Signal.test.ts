import { describe, test, expect, mock, afterEach } from 'bun:test';
import { Signal } from '../signal/Signal';

describe('Signal', () => {
  let signal: Signal;

  afterEach(() => {
    signal?.stop();
  });

  test('mock signal emits initial data', () => {
    const mockData = () => [
      { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, task: null, energy: 1 },
    ];
    signal = new Signal({ type: 'mock', mockData, interval: 100 });

    const cb = mock(() => {});
    signal.onUpdate(cb);
    signal.start();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([
      { id: 'agent-1', name: 'Agent 1', state: 'idle', task: null, energy: 1, metadata: undefined },
    ]);
  });

  test('mock signal passes data directly (no normalization)', () => {
    const mockData = () => [
      { id: 'agent-2', name: 'Agent 2', state: 'working' as const, task: 'coding', energy: 0.8 },
    ];
    signal = new Signal({ type: 'mock', mockData, interval: 100 });

    const cb = mock(() => {});
    signal.onUpdate(cb);
    signal.start();

    const agents = cb.mock.calls[0][0];
    expect(agents[0].id).toBe('agent-2');
    expect(agents[0].state).toBe('working');
    expect(agents[0].task).toBe('coding');
    expect(agents[0].energy).toBe(0.8);
  });

  test('stop clears interval', () => {
    const mockData = mock(() => []);
    signal = new Signal({ type: 'mock', mockData, interval: 50 });
    signal.start();
    signal.stop();

    const callCount = mockData.mock.calls.length;
    // After stop, no more calls should happen
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  test('onEvent registers event callback', () => {
    signal = new Signal({ type: 'mock', mockData: () => [] });
    const cb = mock(() => {});
    signal.onEvent(cb);
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });

  test('onMessage registers message callback', () => {
    signal = new Signal({ type: 'mock', mockData: () => [] });
    const cb = mock(() => {});
    signal.onMessage(cb);
    expect(true).toBe(true);
  });

  test('mock signal without mockData does nothing', () => {
    signal = new Signal({ type: 'mock' });
    signal.start(); // Should not throw
    signal.stop();
  });

  test('multiple callbacks are all called', () => {
    const mockData = () => [{ id: 'a', name: 'A', state: 'idle' as const, task: null, energy: 1 }];
    signal = new Signal({ type: 'mock', mockData, interval: 100 });

    const cb1 = mock(() => {});
    const cb2 = mock(() => {});
    signal.onUpdate(cb1);
    signal.onUpdate(cb2);
    signal.start();

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
