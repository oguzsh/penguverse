import type { AgentStore } from "./store";
import type { EventLog } from "./events";
import type { MessageRouter } from "./messages";
import { handleAction } from "./actions";

export interface WsContext {
	store: AgentStore;
	events: EventLog;
	messages: MessageRouter;
	clients: Set<WebSocket>;
	agentSockets: Map<string, WebSocket>;
}

export function createWsHandlers(ctx: WsContext) {
	return {
		open(ws: WebSocket) {
			ctx.clients.add(ws);
			ws.send(
				JSON.stringify({
					type: "agents",
					agents: ctx.store.getPublicList(),
				}),
			);
		},

		message(ws: WebSocket, rawMessage: unknown) {
			try {
				const msg = JSON.parse(String(rawMessage));

				if (msg.agent) {
					ctx.agentSockets.set(msg.agent, ws);
				}

				if (msg.type === "heartbeat" && msg.agent) {
					ctx.store.heartbeat({
						agent: msg.agent,
						name: msg.name,
						state: msg.state,
						task: msg.task,
						energy: msg.energy,
					});
				} else if (msg.type === "action" && msg.agent && msg.action) {
					handleAction(msg.agent, msg.action, ctx.store, ctx.events, ctx.messages, ctx.agentSockets);
				} else if (msg.type === "observe" && msg.agent) {
					const snapshot = {
						agents: ctx.store.getPublicList(),
						events: msg.since ? ctx.events.since(msg.since) : ctx.events.recent(50),
						lastEventId: ctx.events.lastId(),
					};
					ws.send(JSON.stringify({ type: "world", snapshot }));
				} else if (msg.type === "join_channel" && msg.agent && msg.channel) {
					ctx.messages.joinChannel(msg.agent, msg.channel);
				} else if (msg.type === "leave_channel" && msg.agent && msg.channel) {
					ctx.messages.leaveChannel(msg.agent, msg.channel);
				}
			} catch {
				// Ignore malformed messages
			}
		},

		close(ws: WebSocket) {
			ctx.clients.delete(ws);
			for (const [id, sock] of ctx.agentSockets) {
				if (sock === ws) {
					ctx.agentSockets.delete(id);
					ctx.messages.removeAgent(id);
				}
			}
		},
	};
}
