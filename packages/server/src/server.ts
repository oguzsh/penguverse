import { AgentStore } from './store';
import { EventLog } from './events';
import { MessageRouter } from './messages';
import { getFrontendHtml } from './frontend';

export interface PenguverseServerConfig {
  port?: number;
  offlineTimeout?: number;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
}

export class PenguverseServer {
  private store: AgentStore;
  private events: EventLog;
  private messages: MessageRouter;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private agentSockets: Map<string, WebSocket> = new Map();
  private server: ReturnType<typeof Bun.serve> | null = null;

  private keepalives: Map<string, ReturnType<typeof setInterval>> = new Map();
  private subagentKeepAlives: Map<string, Set<string>> = new Map();

  constructor(config: PenguverseServerConfig = {}) {
    this.port = config.port ?? 4321;
    this.store = new AgentStore(config.offlineTimeout ?? 120000);
    this.events = new EventLog();
    this.messages = new MessageRouter();

    this.store.onUpdate(() => this.broadcast());
    this.events.onEvent((event) => {
      const msg = JSON.stringify({ type: 'event', event });
      for (const ws of this.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    });
  }

  start(): number {
    this.store.start();

    const self = this;

    this.server = Bun.serve({
      port: this.port,
      fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === '/ws') {
          const upgraded = server.upgrade(req);
          if (!upgraded) {
            return new Response('WebSocket upgrade failed', { status: 400 });
          }
          return undefined as any;
        }

        return self.handleHttp(req, url);
      },
      websocket: {
        open(ws) {
          self.clients.add(ws as any);
          (ws as any).send(JSON.stringify({ type: 'agents', agents: self.store.getPublicList() }));
        },
        message(ws, rawMessage) {
          self.handleWsMessage(ws as any, rawMessage);
        },
        close(ws) {
          self.clients.delete(ws as any);
          for (const [id, sock] of self.agentSockets) {
            if (sock === (ws as any)) {
              self.agentSockets.delete(id);
              self.messages.removeAgent(id);
            }
          }
        },
      },
    });

    this.port = this.server.port;
    return this.port;
  }

  stop() {
    this.store.stop();
    for (const interval of this.keepalives.values()) {
      clearInterval(interval);
    }
    this.keepalives.clear();
    this.server?.stop();
  }

  getPort(): number {
    return this.port;
  }

  private broadcast() {
    const msg = JSON.stringify({ type: 'agents', agents: this.store.getPublicList() });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  private handleWsMessage(ws: WebSocket, raw: unknown) {
    try {
      const msg = JSON.parse(String(raw));

      if (msg.agent) {
        this.agentSockets.set(msg.agent, ws);
      }

      if (msg.type === 'heartbeat' && msg.agent) {
        this.store.heartbeat({
          agent: msg.agent,
          name: msg.name,
          state: msg.state,
          task: msg.task,
          energy: msg.energy,
        });
      } else if (msg.type === 'action' && msg.agent && msg.action) {
        this.handleAction(msg.agent, msg.action, ws);
      } else if (msg.type === 'observe' && msg.agent) {
        const snapshot = this.buildSnapshot(msg.since);
        ws.send(JSON.stringify({ type: 'world', snapshot }));
      } else if (msg.type === 'join_channel' && msg.agent && msg.channel) {
        this.messages.joinChannel(msg.agent, msg.channel);
      } else if (msg.type === 'leave_channel' && msg.agent && msg.channel) {
        this.messages.leaveChannel(msg.agent, msg.channel);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private handleAction(agentId: string, action: { type: string; [key: string]: unknown }, senderWs?: WebSocket) {
    const actionType = action.type;

    if (actionType === 'move' && typeof action.to === 'string') {
      this.store.heartbeat({ agent: agentId, metadata: { moveTo: action.to } });
      this.events.push(agentId, action);

    } else if (actionType === 'speak' && typeof action.message === 'string') {
      this.store.heartbeat({
        agent: agentId,
        state: 'speaking',
        task: action.message as string,
        metadata: { to: action.to ?? null },
      });
      this.events.push(agentId, action);

    } else if (actionType === 'emote' && typeof action.emote === 'string') {
      this.store.heartbeat({ agent: agentId, metadata: { emote: action.emote } });
      this.events.push(agentId, action);

    } else if (actionType === 'status') {
      this.store.heartbeat({
        agent: agentId,
        state: action.state as string | undefined,
        task: action.task as string | null | undefined,
        energy: action.energy as number | undefined,
      });
      this.events.push(agentId, action);

    } else if (actionType === 'message' && typeof action.message === 'string') {
      this.routeMessage(agentId, action);
      this.store.heartbeat({
        agent: agentId,
        state: 'speaking',
        task: truncate(action.message as string, 40),
      });
    }
  }

  private routeMessage(fromId: string, action: { type: string; [key: string]: unknown }) {
    const msg = JSON.stringify({
      type: 'message',
      from: fromId,
      message: action.message,
      channel: action.channel ?? undefined,
    });

    if (typeof action.channel === 'string') {
      const members = this.messages.getChannelMembers(action.channel);
      for (const memberId of members) {
        if (memberId === fromId) continue;
        const ws = this.agentSockets.get(memberId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        } else {
          this.messages.queueMessage(memberId, fromId, action.message as string, action.channel);
        }
      }
    } else if (action.to) {
      const targets = Array.isArray(action.to) ? action.to : [action.to];
      for (const targetId of targets) {
        const ws = this.agentSockets.get(targetId as string);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        } else {
          this.messages.queueMessage(targetId as string, fromId, action.message as string);
        }
      }
    }

    this.events.push(fromId, {
      type: 'message',
      to: action.to ?? undefined,
      channel: action.channel ?? undefined,
    });
  }

  private buildSnapshot(sinceEventId?: number) {
    return {
      agents: this.store.getPublicList(),
      events: sinceEventId ? this.events.since(sinceEventId) : this.events.recent(50),
      lastEventId: this.events.lastId(),
    };
  }

  // --- Claude Code hook translation ---

  private startKeepalive(agentId: string, agentName: string) {
    this.stopKeepalive(agentId);
    const interval = setInterval(() => {
      this.store.heartbeat({ agent: agentId, name: agentName });
    }, 15000);
    this.keepalives.set(agentId, interval);
  }

  private stopKeepalive(agentId: string) {
    const existing = this.keepalives.get(agentId);
    if (existing) {
      clearInterval(existing);
      this.keepalives.delete(agentId);
    }
  }

  private handleClaudeCodeHook(data: Record<string, unknown>) {
    const event = data.hook_event_name as string | undefined;
    if (!event) return;

    const sessionId = data.session_id as string | undefined;
    const cwd = data.cwd as string | undefined;
    const folder = (cwd ?? '').split('/').pop() || 'code';
    const shortSession = sessionId ? sessionId.slice(0, 6) : '';

    const agentId = (data as any).agent
      ?? (shortSession ? `claude-${folder}-${shortSession}` : `claude-${folder}`);
    const agentName = (data as any).name
      ?? (shortSession ? `Claude (${folder} #${shortSession})` : `Claude (${folder})`);

    const toolName = data.tool_name as string | undefined;
    const prompt = data.prompt as string | undefined;
    const subagentId = data.subagent_id as string | undefined;
    const subagentTask = data.subagent_task as string | undefined;

    switch (event) {
      case 'SessionStart':
        this.store.heartbeat({ agent: agentId, name: agentName, state: 'idle' });
        this.events.push(agentId, { type: 'status', state: 'idle' });
        this.startKeepalive(agentId, agentName);
        break;

      case 'UserPromptSubmit':
        this.store.heartbeat({
          agent: agentId, name: agentName, state: 'thinking',
          task: prompt ? truncate(prompt, 60) : 'Processing request',
        });
        this.events.push(agentId, { type: 'status', state: 'thinking' });
        this.startKeepalive(agentId, agentName);
        break;

      case 'PreToolUse':
        this.store.heartbeat({
          agent: agentId, name: agentName, state: 'working',
          task: toolName ?? 'Using tool',
        });
        break;

      case 'PostToolUse':
        this.store.heartbeat({
          agent: agentId, name: agentName, state: 'working',
          task: toolName ? `Done: ${toolName}` : 'Tool complete',
        });
        break;

      case 'PostToolUseFailure':
        this.store.heartbeat({
          agent: agentId, name: agentName, state: 'error',
          task: toolName ? `Failed: ${toolName}` : 'Tool failed',
        });
        this.events.push(agentId, { type: 'status', state: 'error' });
        break;

      case 'Stop':
        this.store.heartbeat({ agent: agentId, name: agentName, state: 'idle', task: null });
        this.events.push(agentId, { type: 'status', state: 'idle' });
        break;

      case 'SubagentStart': {
        const subId = subagentId
          ? `${agentId}-sub-${subagentId.slice(0, 6)}`
          : `${agentId}-sub-${Math.random().toString(36).slice(2, 8)}`;
        const subName = subagentTask
          ? `Claude (${truncate(subagentTask, 20)})`
          : `Claude (sub of ${folder})`;
        this.store.heartbeat({ agent: subId, name: subName, state: 'working', task: subagentTask ?? 'Running' });
        this.startKeepalive(subId, subName);
        if (!this.subagentKeepAlives.has(agentId)) this.subagentKeepAlives.set(agentId, new Set());
        this.subagentKeepAlives.get(agentId)!.add(subId);
        this.store.heartbeat({ agent: agentId, name: agentName, state: 'working', task: 'Running subagent' });
        break;
      }

      case 'SubagentStop': {
        const subs = this.subagentKeepAlives.get(agentId);
        if (subs) {
          let matchedSubId: string | undefined;
          if (subagentId) {
            const prefix = `${agentId}-sub-${subagentId.slice(0, 6)}`;
            for (const id of subs) {
              if (id === prefix) { matchedSubId = id; break; }
            }
          }
          if (!matchedSubId) matchedSubId = [...subs].pop();
          if (matchedSubId) {
            this.stopKeepalive(matchedSubId);
            this.store.heartbeat({ agent: matchedSubId, name: matchedSubId, state: 'offline', task: null });
            subs.delete(matchedSubId);
          }
        }
        this.store.heartbeat({ agent: agentId, name: agentName, state: 'working', task: 'Subagent complete' });
        break;
      }

      case 'SessionEnd': {
        this.stopKeepalive(agentId);
        this.store.heartbeat({ agent: agentId, name: agentName, state: 'offline', task: null });
        this.events.push(agentId, { type: 'status', state: 'offline' });
        const subs = this.subagentKeepAlives.get(agentId);
        if (subs) {
          for (const subId of subs) {
            this.stopKeepalive(subId);
            this.store.heartbeat({ agent: subId, name: subId, state: 'offline', task: null });
          }
          this.subagentKeepAlives.delete(agentId);
        }
        break;
      }
    }
  }

  // --- HTTP ---

  private async handleHttp(req: Request, url: URL): Promise<Response> {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return new Response(getFrontendHtml(this.port), {
        headers: { ...headers, 'Content-Type': 'text/html' },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/info') {
      const agents = this.store.getPublicList();
      const online = agents.filter(a => a.state !== 'offline').length;
      return Response.json({
        penguverse: true,
        version: '0.1.0',
        agents: { online, total: agents.length },
      }, { headers });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/hooks/claude-code')) {
      try {
        const data = await req.json() as Record<string, unknown>;
        const qAgent = url.searchParams.get('agent');
        const qName = url.searchParams.get('name');
        if (qAgent) data.agent = qAgent;
        if (qName) data.name = qName;
        this.handleClaudeCodeHook(data);
        return new Response(null, { status: 200, headers });
      } catch {
        return new Response(null, { status: 200, headers });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers });
  }
}
