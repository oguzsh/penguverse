import { describe, test, expect } from 'bun:test';
import { TileReservation } from '../penguins/TileReservation';

describe('TileReservation', () => {
  test('reserve and check availability', () => {
    const r = new TileReservation();
    expect(r.isAvailable(1, 1, 'a')).toBe(true);
    expect(r.reserve(1, 1, 'a')).toBe(true);
    expect(r.isAvailable(1, 1, 'a')).toBe(true); // Same agent
    expect(r.isAvailable(1, 1, 'b')).toBe(false); // Different agent
  });

  test('reserve fails when occupied by another agent', () => {
    const r = new TileReservation();
    r.reserve(2, 3, 'agent1');
    expect(r.reserve(2, 3, 'agent2')).toBe(false);
  });

  test('same agent can re-reserve', () => {
    const r = new TileReservation();
    r.reserve(0, 0, 'a');
    expect(r.reserve(0, 0, 'a')).toBe(true);
  });

  test('release frees all tiles for agent', () => {
    const r = new TileReservation();
    r.reserve(0, 0, 'a');
    r.reserve(1, 1, 'a');
    r.release('a');
    expect(r.isAvailable(0, 0, 'b')).toBe(true);
    expect(r.isAvailable(1, 1, 'b')).toBe(true);
  });

  test('release does not affect other agents', () => {
    const r = new TileReservation();
    r.reserve(0, 0, 'a');
    r.reserve(1, 1, 'b');
    r.release('a');
    expect(r.isAvailable(0, 0, 'b')).toBe(true);
    expect(r.isAvailable(1, 1, 'a')).toBe(false);
  });

  test('multiple tiles same agent', () => {
    const r = new TileReservation();
    r.reserve(0, 0, 'x');
    r.reserve(5, 5, 'x');
    r.reserve(3, 3, 'y');
    expect(r.isAvailable(0, 0, 'y')).toBe(false);
    expect(r.isAvailable(5, 5, 'y')).toBe(false);
    expect(r.isAvailable(3, 3, 'x')).toBe(false);
  });
});
