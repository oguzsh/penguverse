import { AgentStore } from "./store";
import { EventLog } from "./events";
import { MessageRouter } from "./messages";
import { HookHandler } from "./hooks";
import { handleHttp } from "./http";
import { createWsHandlers } from "./ws";

export interface PenguverseServerConfig {
	port?: number;
	offlineTimeout?: number;
}

export class PenguverseServer {
	private store: AgentStore;
	private events: EventLog;
	private messages: MessageRouter;
	private hooks: HookHandler;
	private port: number;
	private clients: Set<WebSocket> = new Set();
	private agentSockets: Map<string, WebSocket> = new Map();
	private server: ReturnType<typeof Bun.serve> | null = null;

	constructor(config: PenguverseServerConfig = {}) {
		this.port = config.port ?? 4321;
		this.store = new AgentStore(config.offlineTimeout ?? 120000);
		this.events = new EventLog();
		this.messages = new MessageRouter();
		this.hooks = new HookHandler(this.store, this.events);

		this.store.onUpdate(() => this.broadcast());
		this.events.onEvent(event => {
			const msg = JSON.stringify({ type: "event", event });
			for (const ws of this.clients) {
				if (ws.readyState === WebSocket.OPEN) ws.send(msg);
			}
		});
	}

	start(): number {
		this.store.start();

		const self = this;
		const wsHandlers = createWsHandlers({
			store: this.store,
			events: this.events,
			messages: this.messages,
			clients: this.clients,
			agentSockets: this.agentSockets,
		});

		this.server = Bun.serve({
			port: this.port,
			fetch(req, server) {
				const url = new URL(req.url);

				if (url.pathname === "/ws") {
					const upgraded = server.upgrade(req);
					if (!upgraded) {
						return new Response("WebSocket upgrade failed", { status: 400 });
					}
					return undefined as any;
				}

				return handleHttp(req, url, self.store, self.port, self.hooks);
			},
			websocket: {
				open(ws) { wsHandlers.open(ws as any); },
				message(ws, rawMessage) { wsHandlers.message(ws as any, rawMessage); },
				close(ws) { wsHandlers.close(ws as any); },
			},
		});

		this.port = this.server.port;
		return this.port;
	}

	stop() {
		this.store.stop();
		this.hooks.stopAll();
		this.server?.stop();
	}

	getPort(): number {
		return this.port;
	}

	private broadcast() {
		const msg = JSON.stringify({
			type: "agents",
			agents: this.store.getPublicList(),
		});
		for (const ws of this.clients) {
			if (ws.readyState === WebSocket.OPEN) ws.send(msg);
		}
	}
}
