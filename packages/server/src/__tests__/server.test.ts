import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PenguverseServer } from '../server';

let server: PenguverseServer;
let port: number;

beforeAll(() => {
  server = new PenguverseServer({ port: 0 }); // Use port 0 for auto-assign
  port = server.start();
});

afterAll(() => {
  server.stop();
});

function wsUrl(): string {
  return `ws://localhost:${port}/ws`;
}

function httpUrl(path: string): string {
  return `http://localhost:${port}${path}`;
}

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

function waitForMessage(ws: WebSocket, type?: string): Promise<any> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (!type || data.type === type) {
        ws.removeEventListener('message', handler);
        resolve(data);
      }
    };
    ws.addEventListener('message', handler);
  });
}

describe('PenguverseServer', () => {
  test('GET / returns HTML', async () => {
    const res = await fetch(httpUrl('/'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Penguverse');
  });

  test('GET /api/info returns server info', async () => {
    const res = await fetch(httpUrl('/api/info'));
    const data = await res.json();
    expect(data.penguverse).toBe(true);
    expect(data.version).toBe('0.1.0');
    expect(data.agents).toBeDefined();
  });

  test('unknown route returns 404', async () => {
    const res = await fetch(httpUrl('/api/nonexistent'));
    expect(res.status).toBe(404);
  });

  test('WebSocket receives agents on connect', async () => {
    const ws = await connectWs();
    const msg = await waitForMessage(ws, 'agents');
    expect(msg.type).toBe('agents');
    expect(Array.isArray(msg.agents)).toBe(true);
    ws.close();
  });

  test('WebSocket heartbeat creates agent and broadcasts', async () => {
    const ws = await connectWs();
    // Consume initial agents message
    await waitForMessage(ws, 'agents');

    // Send heartbeat
    ws.send(JSON.stringify({
      type: 'heartbeat',
      agent: 'test-ws',
      name: 'WS Test',
      state: 'working',
    }));

    // Should get updated agents broadcast
    const msg = await waitForMessage(ws, 'agents');
    const agent = msg.agents.find((a: any) => a.agent === 'test-ws');
    expect(agent).toBeDefined();
    expect(agent.state).toBe('working');
    ws.close();
  });

  test('Claude Code hooks create agent', async () => {
    // Post a Claude Code hook with explicit agent ID
    const res = await fetch(httpUrl('/api/hooks/claude-code?agent=hook-penguin&name=Hook+Penguin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: 'hook-test-123',
        cwd: '/tmp/test-project',
      }),
    });
    expect(res.status).toBe(200);

    // Verify via /api/info that agent count increased
    const info = await (await fetch(httpUrl('/api/info'))).json();
    expect(info.agents.total).toBeGreaterThan(0);
  });

  test('WebSocket observe returns world snapshot', async () => {
    const ws = await connectWs();
    await waitForMessage(ws, 'agents');

    ws.send(JSON.stringify({ type: 'observe', agent: 'observer' }));
    const msg = await waitForMessage(ws, 'world');
    expect(msg.snapshot).toBeDefined();
    expect(msg.snapshot.agents).toBeDefined();
    expect(msg.snapshot.events).toBeDefined();
    ws.close();
  });

  test('WebSocket action broadcasts event', async () => {
    const ws = await connectWs();
    await waitForMessage(ws, 'agents');

    ws.send(JSON.stringify({
      type: 'action',
      agent: 'actor',
      action: { type: 'speak', message: 'Hello everyone!' },
    }));

    const msg = await waitForMessage(ws, 'event');
    expect(msg.event.agentId).toBe('actor');
    expect(msg.event.action.type).toBe('speak');
    ws.close();
  });

  test('CORS headers present on responses', async () => {
    const res = await fetch(httpUrl('/api/info'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('OPTIONS returns 204', async () => {
    const res = await fetch(httpUrl('/api/info'), { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
});
